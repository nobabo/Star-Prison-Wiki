import { Router } from 'express'
import { directPageMutation, type PageMutation } from '../collaboration/page-mutation'

import type { WikiAuthService } from '../auth/auth-service'
import { WikiPageService } from '../pages/page-service'
import type { WikiRepositories } from '../../persistence/repository'
import { badRequest, HttpError, notFound } from '../../shared/http/http-error'

export function createSavepointRouter(
    repositories: WikiRepositories,
    authService: WikiAuthService,
    mutatePage: PageMutation = directPageMutation
): Router {
    const router = Router()
    const pages = new WikiPageService(repositories)
    const auth = (request: Parameters<WikiAuthService['authenticateRequest']>[0]) =>
        authService.authenticateRequest(request)

    router.get('/pages/:pageId/savepoints', async (request, response) => {
        const pageId = String(request.params.pageId)
        await pages.requirePageWriter(pageId, await auth(request))
        response.json({ savepoints: await repositories.pages.listSavepoints(pageId, parseLimit(request.query.limit)) })
    })

    router.post('/pages/:pageId/savepoints', async (request, response) => {
        const pageId = String(request.params.pageId)
        const actor = await pages.requirePageWriter(pageId, await auth(request))
        const savepoint = await repositories.pages.createSavepoint({ pageId, actorId: actorDisplayName(actor) })
        response.status(savepoint ? 201 : 200).json({ savepoint })
    })

    router.post('/pages/:pageId/savepoints/:savepointId/restore', async (request, response) => {
        const pageId = String(request.params.pageId)
        const actor = await pages.requirePageWriter(pageId, await auth(request))
        const body = asObject(request.body)
        try {
            const snapshot = await mutatePage(pageId, () =>
                repositories.pages.restoreSavepoint({
                    pageId,
                    savepointId: String(request.params.savepointId),
                    actorId: actorDisplayName(actor),
                    expectedUpdatedAt: requireText(body.baseSnapshotUpdatedAt, 'baseSnapshotUpdatedAt')
                })
            )
            if (!snapshot) throw notFound('Wiki savepoint was not found')
            response.json({ snapshot })
        } catch (error) {
            if (error instanceof Error && error.message === 'snapshot_conflict') {
                throw new HttpError(409, 'snapshot_conflict', 'The wiki snapshot changed before restore completed')
            }
            throw error
        }
    })

    return router
}

function actorDisplayName(actor: { userId: string; name: string; email?: string }): string {
    return `${actor.name} (${actor.email ?? actor.userId})`
}

function parseLimit(value: unknown): number {
    if (value === undefined) return 20
    const limit = Number(value)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest('limit must be between 1 and 100')
    return limit
}

function asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('JSON object is required')
    return value as Record<string, unknown>
}

function requireText(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw badRequest(`${field} is required`)
    return value.trim()
}
