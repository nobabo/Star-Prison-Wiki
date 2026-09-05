import express, { type Express } from 'express'
import type { PageMutation } from '../modules/collaboration/page-mutation'

import type { WikiAuthService } from '../modules/auth/auth-service'
import { createAuthRouter, type AuthRouterOptions } from '../modules/auth/auth-router'
import { createMediaRouter } from '../modules/media/media-router'
import { createPageRouter } from '../modules/pages/page-router'
import type { WikiRepositories } from '../persistence/repository'
import { errorResponse, HttpError } from '../shared/http/http-error'

export type WikiHttpAppOptions = {
    repositories: WikiRepositories
    authService: WikiAuthService
    authRouter: AuthRouterOptions
    jsonLimit?: string
    logger?: Pick<Console, 'error'>
    mediaDirectory?: string
} & { mutatePage?: PageMutation }

export function createWikiHttpApp(options: WikiHttpAppOptions): Express {
    const app = express()
    const logger = options.logger ?? console
    app.disable('x-powered-by')
    app.use('/api/wiki', (_request, response, next) => {
        response.setHeader('Cache-Control', 'private, no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        next()
    })
    if (options.mediaDirectory) {
        app.use('/api/wiki', createMediaRouter(options.repositories, options.authService, options.mediaDirectory))
    }
    app.use(express.json({ limit: options.jsonLimit ?? '5mb' }))

    app.get('/api/wiki/health', (_request, response) => {
        response.json({
            ok: true,
            store: options.repositories.mode,
            authMode: options.authService.status.authMode
        })
    })
    app.use('/api/wiki', createAuthRouter(options.authService, options.authRouter))
    app.use('/api/wiki', createPageRouter(options.repositories, options.authService, options.mutatePage))

    app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
        const mapped = mapError(error)
        if (mapped.status >= 500) {
            logger.error('[wiki-server] request failed', {
                method: request.method,
                path: request.originalUrl,
                error
            })
        }
        response.status(mapped.status).json(errorResponse(mapped.code, mapped.message))
    })
    return app
}

function mapError(error: unknown): HttpError {
    if (error instanceof HttpError) return error
    const message = error instanceof Error ? error.message : 'Unexpected wiki server error'
    if (message === 'unauthorized') return new HttpError(401, 'unauthorized', 'Authentication is required')
    if (message === 'forbidden') return new HttpError(403, 'forbidden', 'You do not have permission for this action')
    if (message === 'page_not_found') return new HttpError(404, 'not_found', 'Wiki page was not found')
    if (message === 'document_busy')
        return new HttpError(409, 'document_busy', 'Document is being updated; retry shortly')
    if (message === 'slug_conflict' || (error as { code?: unknown })?.code === '23505') {
        return new HttpError(409, 'conflict', 'The wiki slug is already in use')
    }
    if (message.startsWith('oauth_')) return new HttpError(400, message, message.replaceAll('_', ' '))
    if ((error as { type?: unknown })?.type === 'entity.too.large') {
        return new HttpError(413, 'image_too_large', 'Image files must be 100MB or smaller')
    }
    if (error instanceof SyntaxError && 'body' in error) return new HttpError(400, 'bad_request', 'Invalid JSON body')
    return new HttpError(500, 'internal_server_error', 'Unexpected wiki server error')
}
