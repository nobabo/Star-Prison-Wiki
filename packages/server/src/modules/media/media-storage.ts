import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { badRequest, HttpError } from '../../shared/http/http-error'

export const IMAGE_CHUNK_BYTES = 512 * 1024
export const MAX_IMAGE_BYTES = 100 * 1024 * 1024
export const MEDIA_COOKIE = 'wiki_media_session'
export const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const EXTENSIONS_BY_MIME = new Map([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif']
])
export type UploadMetadata = {
    mimeType: string
    extension: string
    size: number
    chunkCount: number
    pageId: string
    actorId: string
}

export function uploadPath(directory: string, uploadId: string): string {
    if (!UPLOAD_ID_PATTERN.test(uploadId)) throw badRequest('Invalid media upload ID')
    return resolve(directory, uploadId)
}

export async function readMetadata(directory: string): Promise<UploadMetadata> {
    try {
        return JSON.parse(await readFile(resolve(directory, 'metadata.json'), 'utf8')) as UploadMetadata
    } catch {
        throw badRequest('Media upload was not found')
    }
}

export async function readChunk(directory: string, index: number): Promise<Buffer> {
    try {
        return await readFile(resolve(directory, `${index}.chunk`))
    } catch {
        throw badRequest('Uploaded image is incomplete')
    }
}

export async function writeChunk(path: string, bytes: Buffer): Promise<void> {
    try {
        await writeFile(path, bytes, { flag: 'wx' })
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (!(await readFile(path)).equals(bytes))
            throw new HttpError(409, 'chunk_conflict', 'Image chunk differs from the original')
    }
}

export function verifyImageSignature(bytes: Buffer, mime: string): void {
    const valid =
        mime === 'image/png'
            ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : mime === 'image/jpeg'
              ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
              : mime === 'image/gif'
                ? /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))
                : mime === 'image/webp'
                  ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
                  : mime === 'image/avif' &&
                    bytes.toString('ascii', 4, 8) === 'ftyp' &&
                    /avif|avis/.test(bytes.toString('ascii', 8, 40))
    if (!valid) throw badRequest('Image contents do not match the declared format', 'unsupported_image_type')
}

/** Reserve disk budget using upload metadata; abandoned uploads expire after a day. */
export async function checkMediaBudget(directory: string, requested: number): Promise<void> {
    await mkdir(resolve(directory, '.uploads'), { recursive: true })
    let used = 0
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isFile()) used += (await stat(resolve(directory, entry.name))).size
    }
    const uploads = resolve(directory, '.uploads')
    for (const entry of await readdir(uploads, { withFileTypes: true })) {
        if (!entry.isDirectory() || !UPLOAD_ID_PATTERN.test(entry.name)) continue
        const target = uploadPath(uploads, entry.name)
        if (Date.now() - (await stat(target)).mtimeMs > 24 * 60 * 60 * 1000) {
            await rm(target, { recursive: true, force: true })
        } else {
            try {
                await stat(resolve(target, 'receipt.json'))
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
                used += (await readMetadata(target)).size
            }
        }
    }
    if (used + requested > 2 * 1024 * 1024 * 1024)
        throw new HttpError(507, 'media_quota', 'Image storage capacity has been reached')
}
