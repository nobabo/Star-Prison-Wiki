import express, { type Express } from 'express'

import type { WikiAuthService } from '../modules/auth/auth-service'
import { createAuthRouter, type AuthRouterOptions } from '../modules/auth/auth-router'
import { createPageRouter } from '../modules/pages/page-router'
import type { WikiRepositories } from '../persistence/repository'
import { errorResponse, HttpError } from '../shared/http/http-error'

export type WikiHttpAppOptions = {
    repositories: WikiRepositories
    authService: WikiAuthService
    authRouter: AuthRouterOptions
    jsonLimit?: string
    logger?: Pick<Console, 'error'>
}

export function createWikiHttpApp(options: WikiHttpAppOptions): Express {
    const app = express()
    const logger = options.logger ?? console
    app.disable('x-powered-by')
    app.use(express.json({ limit: options.jsonLimit ?? '5mb' }))

    app.get('/api/wiki/health', (_request, response) => {
        response.json({
            ok: true,
            store: options.repositories.mode,
            authMode: options.authService.status.authMode
        })
    })
    app.use('/api/wiki', createAuthRouter(options.authService, options.authRouter))
    app.use('/api/wiki', createPageRouter(options.repositories, options.authService))

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
    if (message === 'slug_conflict' || (error as { code?: unknown })?.code === '23505') {
        return new HttpError(409, 'conflict', 'The wiki slug is already in use')
    }
    if (message.startsWith('oauth_')) return new HttpError(400, message, message.replaceAll('_', ' '))
    if (error instanceof SyntaxError && 'body' in error) return new HttpError(400, 'bad_request', 'Invalid JSON body')
    return new HttpError(500, 'internal_server_error', 'Unexpected wiki server error')
}
