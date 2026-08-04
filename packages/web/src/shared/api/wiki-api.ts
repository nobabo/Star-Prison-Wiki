import type {
    CreateWikiSavepointResponse,
    CreateWikiPageRequest,
    UpdateWikiPageMetaRequest,
    WikiAuthStatusDto,
    WikiNavigationPreferencesResponse,
    WikiNavigationPreferencesDto,
    WikiPageDetailDto,
    WikiPageDto,
    WikiPageListResponse,
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
