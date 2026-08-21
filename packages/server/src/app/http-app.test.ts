import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { WikiAuthService } from '../modules/auth/auth-service'
import { createFileRepositories } from '../persistence/file/file-repository'
import { createWikiHttpApp } from './http-app'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

describe('wiki HTTP API', () => {
    it('keeps public reads open while exposing edit access to admins only', async () => {
        const api = await startApi()

        const anonymousAuth = await api.request('/api/wiki/auth/me')
        expect(anonymousAuth.status).toBe(200)
        expect(((await anonymousAuth.json()) as { user: unknown }).user).toBeNull()

        const anonymousPage = await api.request('/api/wiki/pages/by-slug/welcome')
        expect(anonymousPage.status).toBe(200)
        expect(((await anonymousPage.json()) as { permissions: { write: boolean } }).permissions.write).toBe(false)

        const viewerAuth = await api.request('/api/wiki/auth/me', { token: 'dev-viewer' })
        expect(((await viewerAuth.json()) as { user: { roles: string[] } }).user.roles).toEqual(['wiki:viewer'])
        const viewerPage = await api.request('/api/wiki/pages/by-slug/welcome', { token: 'dev-viewer' })
        expect(((await viewerPage.json()) as { permissions: { write: boolean } }).permissions.write).toBe(false)
        expect(
            (
                await api.request('/api/wiki/pages/welcome/meta', {
                    method: 'PATCH',
                    token: 'dev-viewer',
                    body: { title: 'ì°¨ë¨', slug: 'welcome', visibility: 'public' }
                })
            ).status
        ).toBe(403)

        const adminPage = await api.request('/api/wiki/pages/by-slug/welcome', { token: 'dev-admin' })
        expect(((await adminPage.json()) as { permissions: { write: boolean } }).permissions.write).toBe(true)
    })

    it('keeps page routes and returns structured errors', async () => {
        const api = await startApi()
        expect((await api.request('/api/wiki/pages/by-slug/welcome')).status).toBe(200)

        const viewerCreate = await api.request('/api/wiki/pages', {
            method: 'POST',
            token: 'dev-viewer',
            body: { title: 'ì°¨ë¨', slug: 'blocked', visibility: 'public', markdown: '' }
        })
        expect(viewerCreate.status).toBe(403)

        const created = await api.request('/api/wiki/pages', {
            method: 'POST',
            token: 'dev-admin',
            body: { title: 'ë¹ê³µê°', slug: 'private-page', visibility: 'private', markdown: '# ë¹ê³µê°' }
        })
        expect(created.status).toBe(201)
        const createdPage = (await created.json()) as { page: { id: string; snapshotUpdatedAt: string } }
        const pageId = createdPage.page.id

        const forbidden = await api.request('/api/wiki/pages/by-slug/private-page')
        expect(forbidden.status).toBe(403)
        expect(await forbidden.json()).toEqual({
            error: { code: 'forbidden', message: 'You do not have permission for this action' }
        })

        const missingVersion = await api.request(`/api/wiki/pages/${pageId}/snapshot`, {
            method: 'PUT',
            token: 'dev-writer',
            body: { markdown: '# ë²ì  ìë ë³ê²½' }
        })
        expect(missingVersion.status).toBe(400)

        const snapshot = await api.request(`/api/wiki/pages/${pageId}/snapshot`, {
            method: 'PUT',
            token: 'dev-writer',
            body: { markdown: '# ë³ê²½', baseSnapshotUpdatedAt: createdPage.page.snapshotUpdatedAt }
        })
        expect(snapshot.status).toBe(200)
        const savedSnapshot = (await snapshot.json()) as { snapshot: { updatedAt: string } }
        const savepoint = await api.request(`/api/wiki/pages/${pageId}/savepoints`, {
            method: 'POST',
            token: 'dev-writer'
        })
        expect(savepoint.status).toBe(201)
        const savepointId = ((await savepoint.json()) as { savepoint: { id: string } }).savepoint.id
        const savepointList = await api.request(`/api/wiki/pages/${pageId}/savepoints`, { token: 'dev-writer' })
        expect(savepointList.status).toBe(200)
        expect(((await savepointList.json()) as { savepoints: unknown[] }).savepoints).toHaveLength(2)

        const afterSavepoint = await api.request(`/api/wiki/pages/${pageId}/snapshot`, {
            method: 'PUT',
            token: 'dev-writer',
            body: { markdown: '# ì¸ì´ë¸í¬ì¸í¸ ì´í', baseSnapshotUpdatedAt: savedSnapshot.snapshot.updatedAt }
        })
        const afterSavepointBody = (await afterSavepoint.json()) as { snapshot: { updatedAt: string } }
        const restoredSavepoint = await api.request(
            `/api/wiki/pages/${pageId}/savepoints/${encodeURIComponent(savepointId)}/restore`,
            {
                method: 'POST',
                token: 'dev-writer',
                body: { baseSnapshotUpdatedAt: afterSavepointBody.snapshot.updatedAt }
            }
        )
        expect(restoredSavepoint.status).toBe(200)
        const staleSnapshot = await api.request(`/api/wiki/pages/${pageId}/snapshot`, {
            method: 'PUT',
            token: 'dev-writer',
            body: { markdown: '# ì¤ëë ë³ê²½', baseSnapshotUpdatedAt: createdPage.page.snapshotUpdatedAt }
        })
        expect(staleSnapshot.status).toBe(409)
        expect(((await staleSnapshot.json()) as { error: { code: string } }).error.code).toBe('snapshot_conflict')
        const exported = await api.request(`/api/wiki/pages/${pageId}/export.md`, { token: 'dev-writer' })
        expect(exported.status).toBe(200)
        expect(await exported.text()).toBe('# ë³ê²½')

        expect((await api.request(`/api/wiki/pages/${pageId}`, { method: 'DELETE', token: 'dev-writer' })).status).toBe(
            403
        )

        expect((await api.request(`/api/wiki/pages/${pageId}`, { method: 'DELETE', token: 'dev-admin' })).status).toBe(
            200
        )
        const trash = await api.request('/api/wiki/trash', { token: 'dev-admin' })
        expect(trash.status).toBe(200)
        expect(
            ((await trash.json()) as { pages: Array<{ id: string }> }).pages.some((page) => page.id === pageId)
        ).toBe(true)
        expect(
            (await api.request(`/api/wiki/pages/${pageId}/restore`, { method: 'POST', token: 'dev-admin' })).status
        ).toBe(200)
        expect(
            (await api.request(`/api/wiki/pages/${pageId}/purge`, { method: 'DELETE', token: 'dev-admin' })).status
        ).toBe(200)
    })

    it('searches titles and document content in the requested priority order', async () => {
        const api = await startApi()
        const documents = [
            { title: '검색 기능', slug: 'search-exact', markdown: '# 다른 내용' },
            { title: '고급 검색 기능 안내', slug: 'search-title-contains', markdown: '# 다른 내용' },
            { title: '본문 문구', slug: 'search-content-exact', markdown: '검색 기능 사용 방법' },
            {
                title: '본문 키워드',
                slug: 'search-content-contains',
                markdown: '검색을 먼저 실행합니다. 기능 설명입니다.'
            },
            { title: '숨겨진 검색 기능', slug: 'private-search', markdown: '검색 기능', visibility: 'private' as const }
        ]

        for (const document of documents) {
            const response = await api.request('/api/wiki/pages', {
                method: 'POST',
                token: 'dev-admin',
                body: { visibility: 'public', ...document }
            })
            expect(response.status).toBe(201)
        }

        const response = await api.request('/api/wiki/pages/search?q=' + encodeURIComponent('검색 기능'))
        expect(response.status).toBe(200)
        const body = (await response.json()) as { results: Array<{ page: { slug: string }; match: string }> }
        expect(body.results.map(({ page, match }) => [page.slug, match])).toEqual([
            ['search-exact', 'title-exact'],
            ['search-title-contains', 'title-contains'],
            ['search-content-exact', 'content-exact'],
            ['search-content-contains', 'content-contains']
        ])
    })

    it('keeps address changes separate from metadata autosaves', async () => {
        const api = await startApi()
        const renamed = await api.request('/api/wiki/pages/welcome/address', {
            method: 'PATCH',
            token: 'dev-admin',
            body: { slug: 'renamed-welcome' }
        })
        expect(renamed.status).toBe(200)

        const metadata = await api.request('/api/wiki/pages/welcome/meta', {
            method: 'PATCH',
            token: 'dev-admin',
            body: { title: '새 대문', slug: 'welcome', visibility: 'public' }
        })
        expect(metadata.status).toBe(200)
        expect(((await metadata.json()) as { page: { slug: string; title: string } }).page).toMatchObject({
            slug: 'renamed-welcome',
            title: '새 대문'
        })
        expect((await api.request('/api/wiki/pages/by-slug/welcome')).status).toBe(404)
        expect((await api.request('/api/wiki/pages/by-slug/renamed-welcome')).status).toBe(200)
    })

    it('maps duplicate slugs to conflict errors', async () => {
        const api = await startApi()
        const response = await api.request('/api/wiki/pages', {
            method: 'POST',
            token: 'dev-admin',
            body: { title: 'ì¤ë³µ', slug: 'welcome', visibility: 'public', markdown: '' }
        })
        expect(response.status).toBe(409)
        expect(((await response.json()) as { error: { code: string } }).error.code).toBe('conflict')
    })

    it('trashes and purges page batches atomically through one request', async () => {
        const api = await startApi()
        const pageIds: string[] = []
        for (const slug of ['batch-one', 'batch-two']) {
            const response = await api.request('/api/wiki/pages', {
                method: 'POST',
                token: 'dev-admin',
                body: { title: slug, slug, visibility: 'public', markdown: '' }
            })
            pageIds.push(((await response.json()) as { page: { id: string } }).page.id)
        }

        const trashed = await api.request('/api/wiki/pages/batch/trash', {
            method: 'POST',
            token: 'dev-admin',
            body: { pageIds }
        })
        expect(trashed.status).toBe(200)
        expect(((await trashed.json()) as { pages: unknown[] }).pages).toHaveLength(2)

        const purged = await api.request('/api/wiki/pages/batch/purge', {
            method: 'POST',
            token: 'dev-admin',
            body: { pageIds }
        })
        expect(purged.status).toBe(200)
        expect(((await purged.json()) as { purged: number }).purged).toBe(2)
    })

    it('persists one shared navigation structure for every viewer', async () => {
        const api = await startApi()
        const initial = await api.request('/api/wiki/navigation/preferences')
        expect(initial.status).toBe(200)
        expect(((await initial.json()) as { initialized: boolean }).initialized).toBe(false)

        const preferences = {
            categories: [
                {
                    id: 'guides',
                    title: 'ìë´',
                    icon: 'ð',
                    documentSlug: 'category-guides',
                    pageSlugs: ['welcome'],
                    collapsed: true
                }
            ],
            rootPageSlugs: [],
            favoriteSlugs: ['welcome'],
            theme: 'light'
        }
        const saved = await api.request('/api/wiki/navigation/preferences', {
            method: 'PUT',
            token: 'dev-admin',
            body: { preferences, baseVersion: null }
        })
        expect(saved.status).toBe(200)
        const savedBody = (await saved.json()) as { initialized: boolean; version: number }
        expect(savedBody.initialized).toBe(true)
        expect(savedBody.version).toBe(1)

        const updated = await api.request('/api/wiki/navigation/preferences', {
            method: 'PUT',
            token: 'dev-admin',
            body: { preferences: { ...preferences, theme: 'dark' }, baseVersion: savedBody.version }
        })
        expect(updated.status).toBe(200)
        expect(((await updated.json()) as { version: number }).version).toBe(2)

        const staleSave = await api.request('/api/wiki/navigation/preferences', {
            method: 'PUT',
            token: 'dev-admin',
            body: { preferences, baseVersion: savedBody.version }
        })
        expect(staleSave.status).toBe(409)

        const restored = await api.request('/api/wiki/navigation/preferences', { token: 'dev-admin' })
        expect(restored.status).toBe(200)
        expect(((await restored.json()) as { preferences: unknown }).preferences).toEqual({
            ...preferences,
            theme: 'dark'
        })

        const otherUser = await api.request('/api/wiki/navigation/preferences', { token: 'dev-writer' })
        expect(((await otherUser.json()) as { preferences: unknown }).preferences).toEqual({
            ...preferences,
            theme: 'dark'
        })

        const forbiddenSave = await api.request('/api/wiki/navigation/preferences', {
            method: 'PUT',
            token: 'dev-writer',
            body: { preferences, baseVersion: 2 }
        })
        expect(forbiddenSave.status).toBe(403)
    })

    it('assembles a GIF from proxy-safe upload chunks', async () => {
        const api = await startApi({ hiddenMediaDirectory: true })
        const gif = Buffer.alloc(512 * 1024 + 7, 0x2a)
        gif.write('GIF89a')
        const authHeaders = { Authorization: 'Bearer dev-admin' }

        const initialized = await fetch(`${api.baseUrl}/api/wiki/media/uploads`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: 'animation.GIF', mimeType: 'image/gif', size: gif.length })
        })
        expect(initialized.status).toBe(201)
        const { uploadId } = (await initialized.json()) as { uploadId: string }

        for (const [index, chunk] of [gif.subarray(0, 512 * 1024), gif.subarray(512 * 1024)].entries()) {
            const uploaded = await fetch(`${api.baseUrl}/api/wiki/media/uploads/${uploadId}/chunks/${index}`, {
                method: 'PUT',
                headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' },
                body: chunk
            })
            expect(uploaded.status).toBe(204)
        }

        const completed = await fetch(`${api.baseUrl}/api/wiki/media/uploads/${uploadId}/complete`, {
            method: 'POST',
            headers: authHeaders
        })
        expect(completed.status).toBe(201)
        const { url } = (await completed.json()) as { url: string }
        expect(url).toMatch(/\.gif$/)

        const served = await fetch(`${api.baseUrl}${url}`)
        expect(served.status).toBe(200)
        expect(served.headers.get('content-type')).toContain('image/gif')
        expect(Buffer.from(await served.arrayBuffer())).toEqual(gif)
    })
})

async function startApi(options: { hiddenMediaDirectory?: boolean } = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'star-prison-wiki-api-'))
    const repositories = createFileRepositories({
        filePath: join(directory, 'wiki-store.json'),
        seed: {
            id: 'welcome',
            slug: 'welcome',
            title: 'ëë¬¸',
            icon: 'ð',
            visibility: 'public',
            actorId: 'dev-admin',
            markdown: ''
        }
    })
    const authService = new WikiAuthService({
        mode: 'dev',
        sessionTtl: '8h',
        google: { redirectUri: 'http://127.0.0.1/callback' }
    })
    const app = createWikiHttpApp({
        repositories,
        authService,
        authRouter: { transactionCookieName: 'test_oauth', forceSecureCookie: false },
        mediaDirectory: join(directory, options.hiddenMediaDirectory ? '.local/media' : 'media'),
        logger: { error: () => undefined }
    })
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const value = app.listen(0, '127.0.0.1', () => resolve(value))
    })
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    cleanups.push(async () => {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
        await repositories.close()
        await rm(directory, { recursive: true, force: true })
    })
    return {
        baseUrl,
        request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
            const headers = new Headers()
            if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
            if (options.body !== undefined) headers.set('Content-Type', 'application/json')
            return fetch(`${baseUrl}${path}`, {
                method: options.method,
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            })
        }
    }
}
