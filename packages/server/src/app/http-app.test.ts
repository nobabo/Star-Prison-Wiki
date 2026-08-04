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
                    body: { title: '차단', slug: 'welcome', visibility: 'public' }
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
            body: { title: '차단', slug: 'blocked', visibility: 'public', markdown: '' }
        })
        expect(viewerCreate.status).toBe(403)

        const created = await api.request('/api/wiki/pages', {
            method: 'POST',
            token: 'dev-admin',
            body: { title: '비공개', slug: 'private-page', visibility: 'private', markdown: '# 비공개' }
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
            body: { markdown: '# 버전 없는 변경' }
        })
        expect(missingVersion.status).toBe(400)

        const snapshot = await api.request(`/api/wiki/pages/${pageId}/snapshot`, {
            method: 'PUT',
            token: 'dev-writer',
            body: { markdown: '# 변경', baseSnapshotUpdatedAt: createdPage.page.snapshotUpdatedAt }
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
            body: { markdown: '# 세이브포인트 이후', baseSnapshotUpdatedAt: savedSnapshot.snapshot.updatedAt }
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
            body: { markdown: '# 오래된 변경', baseSnapshotUpdatedAt: createdPage.page.snapshotUpdatedAt }
        })
        expect(staleSnapshot.status).toBe(409)
        expect(((await staleSnapshot.json()) as { error: { code: string } }).error.code).toBe('snapshot_conflict')
        const exported = await api.request(`/api/wiki/pages/${pageId}/export.md`, { token: 'dev-writer' })
        expect(exported.status).toBe(200)
        expect(await exported.text()).toBe('# 변경')

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

    it('maps duplicate slugs to conflict errors', async () => {
        const api = await startApi()
        const response = await api.request('/api/wiki/pages', {
            method: 'POST',
            token: 'dev-admin',
            body: { title: '중복', slug: 'welcome', visibility: 'public', markdown: '' }
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

    it('persists navigation preferences per authenticated user', async () => {
        const api = await startApi()
        expect((await api.request('/api/wiki/navigation/preferences')).status).toBe(401)

        const preferences = {
            categories: [
                {
                    id: 'guides',
                    title: '안내',
                    icon: '📚',
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
        expect(((await otherUser.json()) as { initialized: boolean }).initialized).toBe(false)
    })
})

async function startApi() {
    const directory = await mkdtemp(join(tmpdir(), 'star-prison-wiki-api-'))
    const repositories = createFileRepositories({
        filePath: join(directory, 'wiki-store.json'),
        seed: {
            id: 'welcome',
            slug: 'welcome',
            title: '대문',
            icon: '📘',
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
