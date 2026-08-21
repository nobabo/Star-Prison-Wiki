import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { json, Router, raw, type RequestHandler } from 'express'

import type { WikiAuthService } from '../auth/auth-service'
import type { WikiRepositories } from '../../persistence/repository'
import { badRequest } from '../../shared/http/http-error'
import { WikiPageService } from '../pages/page-service'

const MAX_IMAGE_BYTES = 100 * 1024 * 1024
const IMAGE_CHUNK_BYTES = 512 * 1024
const CHUNK_BODY_LIMIT = 640 * 1024
const UPLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/
const EXTENSIONS_BY_MIME = new Map([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif']
])

type UploadMetadata = {
    fileName: string
    mimeType: string
    extension: string
    size: number
    chunkCount: number
}

export function createMediaRouter(
    repositories: WikiRepositories,
    authService: WikiAuthService,
    mediaDirectory: string
): Router {
    const router = Router()
    const pages = new WikiPageService(repositories)
    const directory = resolve(mediaDirectory)
    const uploadsDirectory = resolve(directory, '.uploads')
    const requireWriter: RequestHandler = async (request, _response, next) => {
        try {
            await pages.requireGlobalWriter(await authService.authenticateRequest(request))
            next()
        } catch (error) {
            next(error)
        }
    }

    router.post('/media/uploads', requireWriter, json({ limit: '16kb' }), async (request, response) => {
        const fileName = typeof request.body?.fileName === 'string' ? request.body.fileName : ''
        const mimeType = typeof request.body?.mimeType === 'string' ? request.body.mimeType.toLowerCase() : ''
        const size: unknown = request.body?.size
        const extension = EXTENSIONS_BY_MIME.get(mimeType)
        if (!extension) throw badRequest('Only PNG, JPEG, GIF, WebP, and AVIF images can be uploaded')
        if (!Number.isSafeInteger(size) || (size as number) <= 0 || (size as number) > MAX_IMAGE_BYTES) {
            throw badRequest('Image size must be between 1 byte and 100MB')
        }

        const uploadId = randomUUID()
        const uploadDirectory = resolve(uploadsDirectory, uploadId)
        const metadata: UploadMetadata = {
            fileName,
            mimeType,
            extension,
            size: size as number,
            chunkCount: Math.ceil((size as number) / IMAGE_CHUNK_BYTES)
        }
        await mkdir(uploadDirectory, { recursive: true })
        await writeFile(resolve(uploadDirectory, 'metadata.json'), JSON.stringify(metadata), { flag: 'wx' })
        response.status(201).json({ uploadId })
    })

    router.put(
        '/media/uploads/:uploadId/chunks/:index',
        requireWriter,
        raw({ type: () => true, limit: CHUNK_BODY_LIMIT }),
        async (request, response) => {
            const uploadDirectory = uploadPath(uploadsDirectory, String(request.params.uploadId))
            const metadata = await readMetadata(uploadDirectory)
            const index = Number(request.params.index)
            if (!Number.isInteger(index) || index < 0 || index >= metadata.chunkCount) {
                throw badRequest('Invalid image chunk index')
            }
            if (!Buffer.isBuffer(request.body)) throw badRequest('Image chunk is required')
            const expectedSize =
                index === metadata.chunkCount - 1 ? metadata.size - IMAGE_CHUNK_BYTES * index : IMAGE_CHUNK_BYTES
            if (request.body.length !== expectedSize) throw badRequest('Invalid image chunk size')

            await writeFile(resolve(uploadDirectory, `${index}.chunk`), request.body, { flag: 'wx' })
            response.status(204).end()
        }
    )

    router.post('/media/uploads/:uploadId/complete', requireWriter, async (request, response) => {
        const uploadDirectory = uploadPath(uploadsDirectory, String(request.params.uploadId))
        const metadata = await readMetadata(uploadDirectory)
        const fileName = `${randomUUID()}.${metadata.extension}`
        const assembledPath = resolve(uploadDirectory, 'assembled')
        const handle = await open(assembledPath, 'wx')
        let written = 0
        try {
            for (let index = 0; index < metadata.chunkCount; index += 1) {
                const chunk = await readChunk(uploadDirectory, index)
                await handle.write(chunk, 0, chunk.length, written)
                written += chunk.length
            }
        } finally {
            await handle.close()
        }
        if (written !== metadata.size) {
            await rm(assembledPath, { force: true })
            throw badRequest('Uploaded image is incomplete')
        }

        await mkdir(directory, { recursive: true })
        await rename(assembledPath, resolve(directory, fileName))
        await rm(uploadDirectory, { recursive: true, force: true })
        response.status(201).json({ url: `/api/wiki/media/${fileName}` })
    })

    router.delete('/media/uploads/:uploadId', requireWriter, async (request, response) => {
        const uploadDirectory = uploadPath(uploadsDirectory, String(request.params.uploadId))
        await rm(uploadDirectory, { recursive: true, force: true })
        response.status(204).end()
    })

    router.post(
        '/media',
        requireWriter,
        raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
        async (request, response) => {
            const mimeType =
                String(request.headers['content-type'] ?? '')
                    .split(';', 1)[0]
                    ?.trim()
                    .toLowerCase() ?? ''
            const extension = EXTENSIONS_BY_MIME.get(mimeType)
            if (!extension) throw badRequest('Only PNG, JPEG, GIF, WebP, and AVIF images can be uploaded')
            if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw badRequest('Image file is required')

            await mkdir(directory, { recursive: true })
            const fileName = `${randomUUID()}.${extension}`
            await writeFile(resolve(directory, fileName), request.body, { flag: 'wx' })
            response.status(201).json({ url: `/api/wiki/media/${fileName}` })
        }
    )

    router.get('/media/:fileName', (request, response) => {
        const fileName = String(request.params.fileName)
        if (!/^[0-9a-f-]{36}\.(?:png|jpg|gif|webp|avif)$/.test(fileName)) throw badRequest('Invalid media file name')
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        response.sendFile(fileName, { root: directory })
    })

    return router
}

function uploadPath(uploadsDirectory: string, uploadId: string): string {
    if (!UPLOAD_ID_PATTERN.test(uploadId)) throw badRequest('Invalid media upload ID')
    return resolve(uploadsDirectory, uploadId)
}

async function readMetadata(uploadDirectory: string): Promise<UploadMetadata> {
    try {
        return JSON.parse(await readFile(resolve(uploadDirectory, 'metadata.json'), 'utf8')) as UploadMetadata
    } catch {
        throw badRequest('Media upload was not found')
    }
}

async function readChunk(uploadDirectory: string, index: number): Promise<Buffer> {
    try {
        return await readFile(resolve(uploadDirectory, `${index}.chunk`))
    } catch {
        throw badRequest('Uploaded image is incomplete')
    }
}
