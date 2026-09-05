import { readFile, readdir } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import * as Y from 'yjs'
import { PostgresWikiRepository } from './postgres-repository'

const databaseUrl = process.env.WIKI_TEST_DATABASE_URL
describe.skipIf(!databaseUrl)('PostgreSQL search and restore integration', () => {
    let repository: PostgresWikiRepository
    let pool: pg.Pool
    beforeAll(async () => {
        pool = new pg.Pool({ connectionString: databaseUrl })
        const directory = new URL('../../../database/migrations/', import.meta.url)
        for (const file of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
            await pool.query(await readFile(new URL(file, directory), 'utf8'))
        }
        repository = new PostgresWikiRepository(databaseUrl!)
    })
    afterAll(async () => {
        await repository?.close()
        await pool?.end()
    })
    it('limits results in SQL and excludes private pages unless the actor has access', async () => {
        const suffix = Date.now().toString()
        const publicPage = await repository.createPage({
            title: 'Unique search ' + suffix,
            slug: 'search-' + suffix,
            visibility: 'public',
            markdown: 'test 100% literal',
            actorId: 'integration'
        })
        const privatePage = await repository.createPage({
            title: 'Unique search ' + suffix,
            slug: 'private-' + suffix,
            visibility: 'private',
            markdown: 'secret',
            actorId: 'integration'
        })
        try {
            const result = await repository.searchPages({ query: suffix, userId: null, roles: [], limit: 50 })
            expect(result.map((item) => item.page.id)).toEqual([publicPage.id])
            expect(result[0]!.page).not.toHaveProperty('markdown')
            expect(
                await repository.searchPages({ query: suffix, userId: 'integration', roles: ['wiki:admin'], limit: 1 })
            ).toHaveLength(1)
            expect(await repository.searchPages({ query: '100%', userId: null, roles: [], limit: 50 })).toHaveLength(1)
            const point = (await repository.listSavepoints(publicPage.id, 20))[0]
            const changed = await repository.saveMarkdownSnapshot({
                pageId: publicPage.id,
                markdown: '# Changed',
                actorId: 'integration',
                expectedUpdatedAt: publicPage.snapshotUpdatedAt
            })
            const restored = await repository.restoreSavepoint({
                pageId: publicPage.id,
                savepointId: point!.id,
                actorId: 'integration',
                expectedUpdatedAt: changed.updatedAt
            })
            expect(restored?.markdown).toBe(publicPage.markdown)
            const state = await repository.loadYState(`wiki:${publicPage.id}`)
            expect(state).not.toBeNull()
            const doc = new Y.Doc()
            Y.applyUpdate(doc, state!)
            expect(doc.getXmlFragment('default').toString()).toContain('100% literal')
            doc.destroy()
        } finally {
            await repository.purgePages([publicPage.id, privatePage.id])
        }
    })
})
