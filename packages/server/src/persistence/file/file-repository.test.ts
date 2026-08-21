import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { FileWikiRepository } from './file-repository'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
})

describe('FileWikiRepository', () => {
    it('persists page, revision, trash and collaboration state operations', async () => {
        const { repository, filePath } = await createRepository()
        expect((await repository.getPageBySlug('welcome'))?.title).toBe('대문')

        const page = await repository.createPage({
            title: '운영 규칙',
            slug: 'rules',
            visibility: 'private',
            markdown: '# 규칙',
            actorId: 'dev-admin'
        })
        const firstSnapshot = await repository.saveMarkdownSnapshot({
            pageId: page.id,
            markdown: '첫 저장',
            actorId: 'dev-admin',
            expectedUpdatedAt: page.snapshotUpdatedAt
        })
        await repository.saveMarkdownSnapshot({
            pageId: page.id,
            markdown: '최종 저장',
            actorId: 'dev-admin',
            expectedUpdatedAt: firstSnapshot.updatedAt
        })
        expect((await repository.getPageById(page.id))?.markdown).toBe('최종 저장')

        const state = Uint8Array.from([1, 2, 3, 4])
        await repository.saveYState(`wiki:${page.id}`, page.id, state)
        expect(await repository.loadYState(`wiki:${page.id}`)).toEqual(state)

        const navigationPreferences = {
            categories: [
                {
                    id: 'guides',
                    title: '안내',
                    icon: '📚',
                    documentSlug: 'category-guides',
                    pageSlugs: ['welcome'],
                    collapsed: false
                }
            ],
            rootPageSlugs: [page.slug],
            favoriteSlugs: ['welcome'],
            theme: 'light' as const
        }
        const savedPreferences = await repository.saveNavigationPreferences({
            userId: 'dev-admin',
            preferences: navigationPreferences,
            expectedVersion: null
        })
        expect(await repository.getNavigationPreferences('dev-admin')).toEqual(savedPreferences)
        const updatedPreferences = await repository.saveNavigationPreferences({
            userId: 'dev-admin',
            preferences: { ...navigationPreferences, theme: 'dark' },
            expectedVersion: savedPreferences.version
        })
        expect(updatedPreferences.version).toBe(savedPreferences.version + 1)
        await expect(
            repository.saveNavigationPreferences({
                userId: 'dev-admin',
                preferences: navigationPreferences,
                expectedVersion: savedPreferences.version
            })
        ).rejects.toThrow('preferences_conflict')
        expect(await repository.getNavigationPreferences('dev-writer')).toBeNull()
        expect(await repository.listAdminEmails()).toEqual(['admin@example.com'])
        expect(await repository.isAdminEmail('ADMIN@example.com')).toBe(true)
        await repository.addAdminEmail('editor@example.com')
        expect(await repository.isAdminEmail('editor@example.com')).toBe(true)
        expect(await repository.removeAdminEmail('editor@example.com')).toBe(true)
        expect(await repository.removeAdminEmail('editor@example.com')).toBe(false)

        expect(await repository.trashPage({ pageId: page.id, actorId: 'dev-admin' })).not.toBeNull()
        expect(await repository.getPageById(page.id)).toBeNull()
        expect(await repository.restorePage(page.id)).not.toBeNull()
        expect(await repository.purgePage(page.id)).toBe(true)

        const stored = JSON.parse(await readFile(filePath, 'utf8')) as {
            version: number
            pages: unknown[]
            revisions: unknown[]
            navigationPreferences: unknown[]
        }
        expect(stored.version).toBe(1)
        expect(stored.pages).toHaveLength(1)
        expect(stored.revisions).toHaveLength(1)
        expect(stored.navigationPreferences).toHaveLength(1)
    })

    it('rejects an active duplicate slug', async () => {
        const { repository } = await createRepository()
        await expect(
            repository.createPage({
                title: '중복',
                slug: 'welcome',
                visibility: 'public',
                markdown: '',
                actorId: 'dev-admin'
            })
        ).rejects.toThrow('slug_conflict')
    })

    it('persists a changed page address and resolves the page only by its new slug', async () => {
        const { repository } = await createRepository()
        const page = await repository.getPageBySlug('welcome')
        expect(page).not.toBeNull()

        const updated = await repository.updatePageAddress({
            pageId: page!.id,
            slug: 'new-address'
        })

        expect(updated?.slug).toBe('new-address')
        expect(await repository.getPageBySlug('welcome')).toBeNull()
        expect((await repository.getPageBySlug('new-address'))?.id).toBe(page!.id)
    })

    it('does not revert a changed address during a later metadata save', async () => {
        const { repository } = await createRepository()
        const page = await repository.getPageBySlug('welcome')
        expect(page).not.toBeNull()

        await repository.updatePageAddress({ pageId: page!.id, slug: 'stable-address' })
        const updated = await repository.updatePageMeta({
            pageId: page!.id,
            title: '새 제목',
            icon: page!.icon,
            visibility: page!.visibility
        })

        expect(updated?.slug).toBe('stable-address')
        expect(updated?.title).toBe('새 제목')
    })

    it('rejects stale snapshot writes without replacing the latest snapshot', async () => {
        const { repository } = await createRepository()
        const page = await repository.getPageBySlug('welcome')
        expect(page).not.toBeNull()

        const saved = await repository.saveMarkdownSnapshot({
            pageId: page!.id,
            markdown: '# 최신 문서',
            actorId: 'dev-admin',
            expectedUpdatedAt: page!.snapshotUpdatedAt
        })

        await expect(
            repository.saveMarkdownSnapshot({
                pageId: page!.id,
                markdown: '# 오래된 문서',
                actorId: 'dev-admin',
                expectedUpdatedAt: page!.snapshotUpdatedAt
            })
        ).rejects.toThrow('snapshot_conflict')
        expect((await repository.getPageById(page!.id))?.markdown).toBe('# 최신 문서')
        expect((await repository.getPageById(page!.id))?.snapshotUpdatedAt).toBe(saved.updatedAt)
    })

    it('creates and restores explicit savepoints without recording every snapshot', async () => {
        const { repository } = await createRepository()
        const page = await repository.getPageBySlug('welcome')
        expect(page).not.toBeNull()
        const first = await repository.saveMarkdownSnapshot({
            pageId: page!.id,
            markdown: '# 첫 변경',
            actorId: 'dev-admin',
            expectedUpdatedAt: page!.snapshotUpdatedAt
        })
        const savepoint = await repository.createSavepoint({ pageId: page!.id, actorId: 'dev-admin' })
        expect(savepoint).not.toBeNull()
        const second = await repository.saveMarkdownSnapshot({
            pageId: page!.id,
            markdown: '# 두 번째 변경',
            actorId: 'dev-admin',
            expectedUpdatedAt: first.updatedAt
        })

        expect(await repository.createSavepoint({ pageId: page!.id, actorId: 'dev-admin' })).not.toBeNull()
        expect(await repository.listSavepoints(page!.id, 20)).toHaveLength(3)
        const restored = await repository.restoreSavepoint({
            pageId: page!.id,
            savepointId: savepoint!.id,
            actorId: 'dev-admin',
            expectedUpdatedAt: second.updatedAt
        })
        expect(restored?.markdown).toBe('# 첫 변경')
        expect((await repository.getPageById(page!.id))?.markdown).toBe('# 첫 변경')
    })
})

async function createRepository() {
    const directory = await mkdtemp(join(tmpdir(), 'star-prison-wiki-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'wiki-store.json')
    return {
        filePath,
        repository: new FileWikiRepository({
            filePath,
            seed: {
                id: 'welcome',
                slug: 'welcome',
                title: '대문',
                icon: '📘',
                visibility: 'public',
                actorId: 'dev-admin',
                markdown: '',
                adminEmails: ['Admin@example.com']
            }
        })
    }
}
