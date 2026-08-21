import { Router } from 'express'
import type { WikiNavigationPreferencesDto, WikiSnapshotDto } from '@coconut-studio/wiki-contracts'

import type { WikiAuthService } from '../auth/auth-service'
import type { WikiRepositories } from '../../persistence/repository'
import { createSavepointRouter } from '../savepoints/savepoint-router'
import { badRequest, HttpError, notFound } from '../../shared/http/http-error'
import { normalizePageIcon } from '../../shared/page-normalization'
import { WikiPageService } from './page-service'

const GLOBAL_NAVIGATION_ID = 'wiki:global-navigation'

export function createPageRouter(repositories: WikiRepositories, authService: WikiAuthService): Router {
    const router = Router()
    const pages = new WikiPageService(repositories)
    const auth = (request: Parameters<WikiAuthService['authenticateRequest']>[0]) =>
        authService.authenticateRequest(request)

    router.get('/pages', async (request, response) => {
        response.json({ pages: await pages.listReadablePages(await auth(request)) })
    })

    router.get('/pages/search', async (request, response) => {
        const query = typeof request.query.q === 'string' ? request.query.q.trim() : ''
        if (query.length > 100) throw badRequest('q must contain at most 100 characters')
        response.json({ results: await pages.searchReadablePages(query, await auth(request)) })
    })

    router.get('/navigation/preferences', async (request, response) => {
        const actor = await auth(request)
        const globalRecord = await repositories.navigation.getNavigationPreferences(GLOBAL_NAVIGATION_ID)
        const legacyRecord =
            !globalRecord && actor ? await repositories.navigation.getNavigationPreferences(actor.userId) : null
        const preferences = globalRecord?.preferences ?? legacyRecord?.preferences ?? defaultNavigationPreferences()
        response.json({
            preferences,
            initialized: Boolean(globalRecord || legacyRecord),
            version: globalRecord?.version ?? null
        })
    })

    router.put('/navigation/preferences', async (request, response) => {
        await pages.requireGlobalAdmin(await auth(request))
        const body = asObject(request.body)
        try {
            const record = await repositories.navigation.saveNavigationPreferences({
                userId: GLOBAL_NAVIGATION_ID,
                preferences: parseNavigationPreferencesBody(body.preferences),
                expectedVersion:
                    body.baseVersion === null ? null : requirePositiveInteger(body.baseVersion, 'baseVersion')
            })
            response.json({ preferences: record.preferences, initialized: true, version: record.version })
        } catch (error) {
            if (error instanceof Error && error.message === 'preferences_conflict') {
                throw new HttpError(409, 'preferences_conflict', 'Navigation preferences changed before this save')
            }
            throw error
        }
    })

    router.get('/pages/by-slug/:slug', async (request, response) => {
        const result = await pages.getReadablePageBySlug(String(request.params.slug), await auth(request))
        if (!result) throw notFound('Wiki page was not found')
        response.json(result)
    })

    router.get('/pages/:pageId', async (request, response) => {
        const result = await pages.getReadablePageById(String(request.params.pageId), await auth(request))
        if (!result) throw notFound('Wiki page was not found')
        response.json(result)
    })

    router.get('/pages/:pageId/export.md', async (request, response) => {
        const result = await pages.getReadablePageById(String(request.params.pageId), await auth(request))
        if (!result) throw notFound('Wiki page was not found')
        response.type('text/markdown').send(result.page.markdown)
    })

    router.post('/pages', async (request, response) => {
        const actor = await pages.requireGlobalWriter(await auth(request))
        const body = parsePageBody(request.body)
        const page = await repositories.pages.createPage({ ...body, actorId: actor.userId })
        response.status(201).json({ page })
    })

    router.patch('/pages/:pageId/meta', async (request, response) => {
        const pageId = String(request.params.pageId)
        await pages.requirePageWriter(pageId, await auth(request))
        const page = await repositories.pages.updatePageMeta({ pageId, ...parseMetaBody(request.body) })
        if (!page) throw notFound('Wiki page was not found')
        response.json({ page })
    })

    router.patch('/pages/:pageId/address', async (request, response) => {
        const pageId = String(request.params.pageId)
        await pages.requirePageWriter(pageId, await auth(request))
        const body = asObject(request.body)
        const page = await repositories.pages.updatePageAddress({ pageId, slug: requireSlug(body.slug) })
        if (!page) throw notFound('Wiki page was not found')
        response.json({ page })
    })

    router.put('/pages/:pageId/snapshot', async (request, response) => {
        const pageId = String(request.params.pageId)
        const actor = await pages.requirePageWriter(pageId, await auth(request))
        const body = asObject(request.body)
        const markdown = requireMarkdown(body.markdown)
        const expectedUpdatedAt = requireText(body.baseSnapshotUpdatedAt, 'baseSnapshotUpdatedAt')
        let snapshot: WikiSnapshotDto
        try {
            snapshot = await repositories.pages.saveMarkdownSnapshot({
                pageId,
                markdown,
                actorId: actor.userId,
                expectedUpdatedAt
            })
        } catch (error) {
            if (error instanceof Error && error.message === 'snapshot_conflict') {
                throw new HttpError(409, 'snapshot_conflict', 'The wiki snapshot changed before this save completed')
            }
            throw error
        }
        response.json({ snapshot, savedAt: snapshot.updatedAt })
    })

    router.delete('/pages/:pageId', async (request, response) => {
        const pageId = String(request.params.pageId)
        const actor = await pages.requirePageAdmin(pageId, await auth(request))
        const page = await repositories.pages.trashPage({ pageId, actorId: actor.userId })
        if (!page) throw notFound('Wiki page was not found')
        response.json({ page })
    })

    router.post('/pages/batch/trash', async (request, response) => {
        const actor = await pages.requireGlobalAdmin(await auth(request))
        const pageIds = parsePageIds(request.body)
        response.json({ pages: await repositories.pages.trashPages({ pageIds, actorId: actor.userId }) })
    })

    router.post('/pages/:pageId/restore', async (request, response) => {
        const pageId = String(request.params.pageId)
        await pages.requirePageAdmin(pageId, await auth(request))
        const page = await repositories.pages.restorePage(pageId)
        if (!page) throw notFound('Wiki page was not found')
        response.json({ page })
    })

    router.delete('/pages/:pageId/purge', async (request, response) => {
        const pageId = String(request.params.pageId)
        await pages.requirePageAdmin(pageId, await auth(request))
        if (!(await repositories.pages.purgePage(pageId))) throw notFound('Wiki page was not found')
        response.json({ ok: true })
    })

    router.post('/pages/batch/purge', async (request, response) => {
        await pages.requireGlobalAdmin(await auth(request))
        const pageIds = parsePageIds(request.body)
        response.json({ purged: await repositories.pages.purgePages(pageIds) })
    })

    router.get('/trash', async (request, response) => {
        await pages.requireGlobalAdmin(await auth(request))
        response.json({ pages: await repositories.pages.listTrashedPages() })
    })

    router.use(createSavepointRouter(repositories, authService))

    return router
}

function parsePageBody(body: unknown) {
    const value = asObject(body)
    const title = requireText(value.title, 'title')
    return {
        title,
        icon: normalizePageIcon(value.icon),
        slug: requireSlug(value.slug),
        visibility: requireVisibility(value.visibility),
        markdown: typeof value.markdown === 'string' ? value.markdown : `# ${title}\n`
    }
}

function parseMetaBody(body: unknown) {
    const value = asObject(body)
    return {
        title: requireText(value.title, 'title'),
        icon: normalizePageIcon(value.icon),
        visibility: requireVisibility(value.visibility)
    }
}

function parseNavigationPreferencesBody(body: unknown): WikiNavigationPreferencesDto {
    const value = asObject(body)
    if (!Array.isArray(value.categories)) throw badRequest('categories must be an array')
    if (!Array.isArray(value.rootPageSlugs)) throw badRequest('rootPageSlugs must be an array')
    if (!Array.isArray(value.favoriteSlugs)) throw badRequest('favoriteSlugs must be an array')

    return {
        categories: value.categories.map((entry, index) => parseCategory(entry, index)),
        rootPageSlugs: parseStringArray(value.rootPageSlugs, 'rootPageSlugs'),
        favoriteSlugs: parseStringArray(value.favoriteSlugs, 'favoriteSlugs'),
        theme: value.theme === 'light' ? 'light' : value.theme === 'dark' ? 'dark' : invalid('theme')
    }
}

function parseCategory(value: unknown, index: number): WikiNavigationPreferencesDto['categories'][number] {
    const category = asObject(value)
    return {
        id: requireText(category.id, `categories[${index}].id`),
        title: requireText(category.title, `categories[${index}].title`),
        icon: typeof category.icon === 'string' ? category.icon : invalid(`categories[${index}].icon`),
        ...(category.documentSlug === undefined
            ? {}
            : { documentSlug: requireText(category.documentSlug, `categories[${index}].documentSlug`) }),
        pageSlugs: Array.isArray(category.pageSlugs)
            ? parseStringArray(category.pageSlugs, `categories[${index}].pageSlugs`)
            : invalid(`categories[${index}].pageSlugs`),
        collapsed:
            typeof category.collapsed === 'boolean' ? category.collapsed : invalid(`categories[${index}].collapsed`)
    }
}

function parseStringArray(value: unknown[], field: string): string[] {
    return value.map((entry, index) => {
        if (typeof entry !== 'string') throw badRequest(`${field}[${index}] must be a string`)
        return entry
    })
}

function invalid(field: string): never {
    throw badRequest(`${field} is invalid`)
}

function defaultNavigationPreferences(): WikiNavigationPreferencesDto {
    return { categories: [], rootPageSlugs: [], favoriteSlugs: [], theme: 'dark' }
}

function asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('JSON object is required')
    return value as Record<string, unknown>
}

function requireText(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw badRequest(`${field} is required`)
    return value.trim()
}

function requirePositiveInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        throw badRequest(`${field} must be a positive integer or null`)
    }
    return value
}

function requireMarkdown(value: unknown): string {
    if (typeof value !== 'string') throw badRequest('markdown must be a string')
    return value
}

function requireVisibility(value: unknown): 'public' | 'private' {
    if (value !== 'public' && value !== 'private') throw badRequest('visibility must be public or private')
    return value
}

function parsePageIds(body: unknown): string[] {
    const value = asObject(body)
    if (!Array.isArray(value.pageIds) || value.pageIds.length === 0 || value.pageIds.length > 500) {
        throw badRequest('pageIds must contain between 1 and 500 page ids')
    }
    const pageIds = value.pageIds.map((pageId, index) => requireText(pageId, `pageIds[${index}]`))
    return [...new Set(pageIds)]
}

function requireSlug(value: unknown): string {
    const slug = requireText(value, 'slug')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw badRequest('slug must use lowercase letters, numbers, and hyphens')
    }
    return slug
}
