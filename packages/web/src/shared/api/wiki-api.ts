import type {
    CreateWikiSavepointResponse,
    CreateWikiPageRequest,
    UpdateWikiPageAddressRequest,
    UpdateWikiPageMetaRequest,
    WikiAuthStatusDto,
    WikiNavigationPreferencesResponse,
    WikiNavigationPreferencesDto,
    WikiPageDetailDto,
    WikiPageDto,
    WikiPageListResponse,
    WikiPageSearchResponse,
    WikiPageResponse,
    WikiSavepointListResponse,
    WikiSnapshotDto
} from '@coconut-studio/wiki-contracts'
import { isWikiApiErrorDto } from '@coconut-studio/wiki-contracts'

export type ApiClient = {
    token: string
    basePath?: string
}

export type PageResponse = WikiPageResponse
export type PageListResponse = WikiPageListResponse

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])
const IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif'
}
const IMAGE_UPLOAD_CHUNK_BYTES = 512 * 1024
const MAX_IMAGE_UPLOAD_BYTES = 100 * 1024 * 1024

export class WikiApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string
    ) {
        super(message)
        this.name = 'WikiApiError'
    }
}

export const fetchAuthMe = (client: ApiClient) => request<WikiAuthStatusDto>(client, '/auth/me')
export const fetchPageBySlug = (client: ApiClient, slug: string) =>
    request<WikiPageResponse>(client, `/pages/by-slug/${encodeURIComponent(slug)}`)
export const fetchPages = (client: ApiClient) => request<WikiPageListResponse>(client, '/pages')
export const searchWikiPages = (client: ApiClient, query: string, signal?: AbortSignal) =>
    request<WikiPageSearchResponse>(client, `/pages/search?q=${encodeURIComponent(query)}`, { signal })
export const fetchTrashedPages = (client: ApiClient) => request<WikiPageListResponse>(client, '/trash')
export const fetchNavigationPreferences = (client: ApiClient) =>
    request<WikiNavigationPreferencesResponse>(client, '/navigation/preferences')

export function saveNavigationPreferences(
    client: ApiClient,
    preferences: WikiNavigationPreferencesDto,
    baseVersion: number | null
): Promise<WikiNavigationPreferencesResponse> {
    return request(client, '/navigation/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences, baseVersion })
    })
}

export function createWikiPage(client: ApiClient, input: CreateWikiPageRequest): Promise<{ page: WikiPageDetailDto }> {
    return request(client, '/pages', { method: 'POST', body: JSON.stringify(input) })
}

export function updatePageMeta(
    client: ApiClient,
    pageId: string,
    input: UpdateWikiPageMetaRequest
): Promise<{ page: WikiPageDetailDto }> {
    return request(client, `/pages/${encodeURIComponent(pageId)}/meta`, {
        method: 'PATCH',
        body: JSON.stringify(input)
    })
}

export function updatePageAddress(
    client: ApiClient,
    pageId: string,
    input: UpdateWikiPageAddressRequest
): Promise<{ page: WikiPageDetailDto }> {
    return request(client, `/pages/${encodeURIComponent(pageId)}/address`, {
        method: 'PATCH',
        body: JSON.stringify(input)
    })
}

export function saveWikiSnapshot(
    client: ApiClient,
    pageId: string,
    markdown: string,
    baseSnapshotUpdatedAt: string
): Promise<{ snapshot: WikiSnapshotDto; savedAt: string }> {
    return request(client, `/pages/${encodeURIComponent(pageId)}/snapshot`, {
        method: 'PUT',
        body: JSON.stringify({ markdown, baseSnapshotUpdatedAt })
    })
}

export function fetchWikiSavepoints(client: ApiClient, pageId: string, limit = 20): Promise<WikiSavepointListResponse> {
    return request(client, `/pages/${encodeURIComponent(pageId)}/savepoints?limit=${limit}`)
}

export function createWikiSavepoint(client: ApiClient, pageId: string) {
    return request<CreateWikiSavepointResponse>(client, `/pages/${encodeURIComponent(pageId)}/savepoints`, {
        method: 'POST'
    })
}

export function restoreWikiSavepoint(
    client: ApiClient,
    pageId: string,
    savepointId: string,
    baseSnapshotUpdatedAt: string
): Promise<{ snapshot: WikiSnapshotDto }> {
    return request(
        client,
        `/pages/${encodeURIComponent(pageId)}/savepoints/${encodeURIComponent(savepointId)}/restore`,
        {
            method: 'POST',
            body: JSON.stringify({ baseSnapshotUpdatedAt })
        }
    )
}

export async function uploadWikiImage(client: ApiClient, file: File): Promise<{ url: string }> {
    const mimeType = getImageUploadMimeType(file)
    if (!mimeType) throw new WikiApiError(400, 'unsupported_image_type', 'Unsupported image type')
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        throw new WikiApiError(413, 'image_too_large', 'Image files must be 100MB or smaller')
    }

    const upload = await request<{ uploadId: string }>(client, '/media/uploads', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, mimeType, size: file.size })
    })

    try {
        for (let index = 0, offset = 0; offset < file.size; index += 1, offset += IMAGE_UPLOAD_CHUNK_BYTES) {
            const headers = authHeaders(client)
            headers.set('Content-Type', 'application/octet-stream')
            const chunk = file.slice(offset, Math.min(offset + IMAGE_UPLOAD_CHUNK_BYTES, file.size))
            const response = await fetch(`${basePath(client)}/media/uploads/${upload.uploadId}/chunks/${index}`, {
                method: 'PUT',
                headers,
                body: chunk
            })
            if (!response.ok) throw await toApiError(response)
        }
        return await request<{ url: string }>(client, `/media/uploads/${upload.uploadId}/complete`, {
            method: 'POST'
        })
    } catch (error) {
        void fetch(`${basePath(client)}/media/uploads/${upload.uploadId}`, {
            method: 'DELETE',
            headers: authHeaders(client)
        })
        throw error
    }
}

export function getImageUploadMimeType(file: Pick<File, 'name' | 'type'>): string | null {
    const declaredType = file.type.trim().toLowerCase()
    if (IMAGE_MIME_TYPES.has(declaredType)) return declaredType

    const extension = /\.([^.]+)$/.exec(file.name.trim().toLowerCase())?.[1]
    return extension ? (IMAGE_MIME_BY_EXTENSION[extension] ?? null) : null
}

export const trashWikiPage = (client: ApiClient, pageId: string) =>
    request<{ page: WikiPageDto }>(client, `/pages/${encodeURIComponent(pageId)}`, { method: 'DELETE' })
export const restoreWikiPage = (client: ApiClient, pageId: string) =>
    request<{ page: WikiPageDto }>(client, `/pages/${encodeURIComponent(pageId)}/restore`, { method: 'POST' })
export const purgeWikiPage = (client: ApiClient, pageId: string) =>
    request<{ ok: boolean }>(client, `/pages/${encodeURIComponent(pageId)}/purge`, { method: 'DELETE' })

export function trashWikiPages(client: ApiClient, pageIds: string[]): Promise<{ pages: WikiPageDto[] }> {
    return request(client, '/pages/batch/trash', {
        method: 'POST',
        body: JSON.stringify({ pageIds })
    })
}

export function purgeWikiPages(client: ApiClient, pageIds: string[]): Promise<{ purged: number }> {
    return request(client, '/pages/batch/purge', {
        method: 'POST',
        body: JSON.stringify({ pageIds })
    })
}

export async function exportWikiMarkdown(client: ApiClient, pageId: string): Promise<string> {
    const response = await fetch(`${basePath(client)}/pages/${encodeURIComponent(pageId)}/export.md`, {
        headers: authHeaders(client)
    })
    if (!response.ok) throw await toApiError(response)
    return response.text()
}

async function request<T>(client: ApiClient, path: string, init: RequestInit = {}): Promise<T> {
    const headers = authHeaders(client, init.headers)
    headers.set('Content-Type', 'application/json')
    const response = await fetch(`${basePath(client)}${path}`, { ...init, headers })
    if (!response.ok) throw await toApiError(response)
    return response.json() as Promise<T>
}

function authHeaders(client: ApiClient, initial?: HeadersInit): Headers {
    const headers = new Headers(initial)
    if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
    return headers
}

function basePath(client: ApiClient): string {
    return (client.basePath ?? '/api/wiki').replace(/\/$/, '')
}

async function toApiError(response: Response): Promise<WikiApiError> {
    const body = await response
        .clone()
        .json()
        .catch(() => null)
    if (isWikiApiErrorDto(body)) return new WikiApiError(response.status, body.error.code, body.error.message)
    return new WikiApiError(response.status, 'unknown_error', `Wiki API ${response.status}`)
}
