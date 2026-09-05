import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { json, Router, raw, type RequestHandler } from 'express'

import type { WikiAuthService } from '../auth/auth-service'
import type { WikiRepositories } from '../../persistence/repository'
import { badRequest, HttpError } from '../../shared/http/http-error'
import { rateLimit } from '../../shared/http/rate-limit'
import {
    MEDIA_COOKIE,
    IMAGE_CHUNK_BYTES,
    MAX_IMAGE_BYTES,
    EXTENSIONS_BY_MIME,
    uploadPath,
    readMetadata,
    readChunk,
    writeChunk,
    verifyImageSignature,
    checkMediaBudget,
    type UploadMetadata
} from './media-storage'
import { WikiPageService } from '../pages/page-service'

export function createMediaRouter(
    repositories: WikiRepositories,
    authService: WikiAuthService,
    mediaDirectory: string
): Router {
    const router = Router()
    const pages = new WikiPageService(repositories)
    const directory = resolve(mediaDirectory)
    const uploadsDirectory = resolve(directory, '.uploads')
    let reservation = Promise.resolve()
    const reserve = async (operation: () => Promise<void>) => {
        const task = reservation.catch(() => undefined).then(operation)
        reservation = task
        await task
    }
    const activeCompletions = new Set<string>()
    const writer: RequestHandler = async (request, _response, next) => {
        try {
            await pages.requireGlobalWriter(await authService.authenticateRequest(request))
            next()
        } catch (error) {
            next(error)
        }
    }
    const uploadOwner = async (request: import('express').Request, metadata: UploadMetadata) => {
        const actor = pages.requireAuthenticated(await authService.authenticateRequest(request))
        if (metadata.actorId !== actor.userId)
            throw new HttpError(403, 'forbidden', 'Upload belongs to a different user')
        await pages.requirePageWriter(metadata.pageId, actor)
        if (!(await repositories.pages.getPageById(metadata.pageId)))
            throw new HttpError(404, 'not_found', 'Wiki page was not found')
    }
    router.post('/media/uploads', writer, rateLimit(30), json({ limit: '16kb' }), async (request, response) => {
        const actor = pages.requireAuthenticated(await authService.authenticateRequest(request))
        const pageId = typeof request.body?.pageId === 'string' ? request.body.pageId : ''
        const page = await pages.getReadablePageById(pageId, actor)
        if (!page?.permissions.write) throw new HttpError(403, 'forbidden', 'An editable page is required')
        const mimeType = String(request.body?.mimeType ?? '').toLowerCase()
        const extension = EXTENSIONS_BY_MIME.get(mimeType)
        const size: unknown = request.body?.size
        if (!extension) throw badRequest('Unsupported image type')
        if (!Number.isSafeInteger(size) || (size as number) <= 0 || (size as number) > MAX_IMAGE_BYTES)
            throw badRequest('Image size must be between 1 byte and 100MB')
        const uploadId = randomUUID()
        const uploadDirectory = uploadPath(uploadsDirectory, uploadId)
        const metadata: UploadMetadata = {
            mimeType,
            extension,
            size: size as number,
            chunkCount: Math.ceil((size as number) / IMAGE_CHUNK_BYTES),
            pageId,
            actorId: actor.userId
        }
        await reserve(async () => {
            await checkMediaBudget(directory, metadata.size)
            await mkdir(uploadDirectory, { recursive: true })
            await writeFile(resolve(uploadDirectory, 'metadata.json'), JSON.stringify(metadata), { flag: 'wx' })
        })
        response.status(201).json({ uploadId })
    })
    router.put(
        '/media/uploads/:uploadId/chunks/:index',
        writer,
        raw({ type: () => true, limit: 640 * 1024 }),
        async (request, response) => {
            const uploadDirectory = uploadPath(uploadsDirectory, String(request.params.uploadId))
            const metadata = await readMetadata(uploadDirectory)
            await uploadOwner(request, metadata)
            const index = Number(request.params.index)
            if (!Number.isInteger(index) || index < 0 || index >= metadata.chunkCount)
                throw badRequest('Invalid image chunk index')
            const expected =
                index === metadata.chunkCount - 1 ? metadata.size - IMAGE_CHUNK_BYTES * index : IMAGE_CHUNK_BYTES
            if (!Buffer.isBuffer(request.body) || request.body.length !== expected)
                throw badRequest('Invalid image chunk size')
            await writeChunk(resolve(uploadDirectory, `${index}.chunk`), request.body)
            response.status(204).end()
        }
    )
    router.post('/media/uploads/:uploadId/complete', writer, async (request, response) => {
        const uploadId = String(request.params.uploadId)
        const uploadDirectory = uploadPath(uploadsDirectory, uploadId)
        const metadata = await readMetadata(uploadDirectory)
        await uploadOwner(request, metadata)
        const receiptPath = resolve(uploadDirectory, 'receipt.json')
        try {
            response.status(201).json(JSON.parse(await readFile(receiptPath, 'utf8')))
            return
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        if (activeCompletions.has(uploadId)) throw new HttpError(409, 'upload_busy', 'Image is being assembled')
        activeCompletions.add(uploadId)
        const assembledPath = resolve(uploadDirectory, 'assembled')
        const fileName = `${uploadId}.${metadata.extension}`
        try {
            const handle = await open(assembledPath, 'w')
            let written = 0
            try {
                for (let index = 0; index < metadata.chunkCount; index++) {
                    const chunk = await readChunk(uploadDirectory, index)
                    if (index === 0) verifyImageSignature(chunk, metadata.mimeType)
                    let offset = 0
                    while (offset < chunk.length) {
                        const result = await handle.write(chunk, offset, chunk.length - offset, written)
                        if (!result.bytesWritten) throw new Error('image_write_failed')
                        offset += result.bytesWritten
                        written += result.bytesWritten
                    }
                }
            } finally {
                await handle.close()
            }
            if (written !== metadata.size) throw badRequest('Uploaded image is incomplete')
            // Write the authorization record before making the asset visible.
            await writeFile(resolve(directory, `${fileName}.json`), JSON.stringify({ pageId: metadata.pageId }))
            await rename(assembledPath, resolve(directory, fileName))
            const receipt = { url: `/api/wiki/media/${fileName}` }
            await writeFile(receiptPath, JSON.stringify(receipt))
            for (let index = 0; index < metadata.chunkCount; index++)
                await rm(resolve(uploadDirectory, `${index}.chunk`), { force: true })
            response.status(201).json(receipt)
        } finally {
            activeCompletions.delete(uploadId)
            await rm(assembledPath, { force: true })
        }
    })
    router.delete('/media/uploads/:uploadId', writer, async (request, response) => {
        const uploadDirectory = uploadPath(uploadsDirectory, String(request.params.uploadId))
        const metadata = await readMetadata(uploadDirectory)
        await uploadOwner(request, metadata)
        if (activeCompletions.has(String(request.params.uploadId)))
            throw new HttpError(409, 'upload_busy', 'Image is being assembled')
        await rm(uploadDirectory, { recursive: true, force: true })
        response.status(204).end()
    })
    router.post('/media', writer, (_request, response) => {
        response
            .status(410)
            .json({ error: { code: 'chunk_upload_required', message: 'Use the page-scoped chunk upload endpoint' } })
    })
    router.post('/media/:fileName/ownership', json({ limit: '16kb' }), async (request, response) => {
        const actor = await pages.requireGlobalAdmin(await authService.authenticateRequest(request))
        const fileName = String(request.params.fileName)
        if (!/^[0-9a-f-]{36}\.(?:png|jpg|gif|webp|avif)$/.test(fileName)) throw badRequest('Invalid media file name')
        const pageId = request.body?.pageId
        if (typeof pageId !== 'string') throw badRequest('pageId is required')
        if (!(await pages.getReadablePageById(pageId, actor)))
            throw new HttpError(404, 'not_found', 'Wiki page was not found')
        await stat(resolve(directory, fileName))
        await writeFile(resolve(directory, `${fileName}.json`), JSON.stringify({ pageId }))
        response.status(204).end()
    })
    router.get('/media/:fileName', async (request, response) => {
        const fileName = String(request.params.fileName)
        if (!/^[0-9a-f-]{36}\.(?:png|jpg|gif|webp|avif)$/.test(fileName)) throw badRequest('Invalid media file name')
        const cookie = request.headers.cookie
            ?.split(';')
            .map((value) => value.trim())
            .find((value) => value.startsWith(MEDIA_COOKIE + '='))
        let cookieToken = ''
        try {
            cookieToken = cookie ? decodeURIComponent(cookie.slice(MEDIA_COOKIE.length + 1)) : ''
        } catch {
            /* invalid cookie */
        }
        const actor =
            (await authService.authenticateRequest(request)) ??
            (cookieToken ? await authService.authenticateToken(cookieToken) : null)
        let pageId: string | undefined
        try {
            pageId = (JSON.parse(await readFile(resolve(directory, `${fileName}.json`), 'utf8')) as { pageId?: string })
                .pageId
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        if (pageId) {
            if (!(await pages.getReadablePageById(pageId, actor)))
                throw new HttpError(404, 'not_found', 'Image was not found')
        } else {
            // Legacy assets have no ownership record. Fail closed until explicitly assigned.
            await pages.requireGlobalAdmin(actor)
        }
        response.setHeader('Cache-Control', 'private, no-store')
        response.setHeader('Vary', 'Cookie, Authorization')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.sendFile(fileName, { root: directory, cacheControl: false })
    })
    return router
}
