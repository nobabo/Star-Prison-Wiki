import { Router, type Request, type Response } from 'express'
import { MEDIA_COOKIE } from '../media/media-storage'
import { readBearerToken } from './auth-service'

import { badRequest, HttpError } from '../../shared/http/http-error'
import type { WikiAuthService } from './auth-service'
import { sanitizeReturnTo } from './google-oauth'

export type AuthRouterOptions = {
    transactionCookieName: string
    forceSecureCookie: boolean
}

export function createAuthRouter(authService: WikiAuthService, options: AuthRouterOptions): Router {
    const router = Router()

    router.get('/auth/me', async (request, response) => {
        const user = await authService.authenticateRequest(request)
        response.setHeader('Cache-Control', 'no-store')
        response.cookie(MEDIA_COOKIE, user ? (readBearerToken(request.headers.authorization) ?? '') : '', {
            httpOnly: true,
            sameSite: 'strict',
            secure: options.forceSecureCookie || isSecureRequest(request),
            path: '/api/wiki/media',
            maxAge: user ? 8 * 60 * 60 * 1000 : 0
        })
        response.json({ ...authService.status, user })
    })

    router.get('/auth/google/start', async (request, response) => {
        if (!authService.google.enabled) {
            throw new HttpError(503, 'oauth_not_configured', 'Google OAuth is not configured')
        }
        const start = await authService.createGoogleOAuthStart(sanitizeReturnTo(request.query.returnTo))
        response.cookie(options.transactionCookieName, start.transactionToken, {
            httpOnly: true,
            sameSite: 'lax',
            secure: options.forceSecureCookie || isSecureRequest(request),
            path: '/api/wiki/auth/google',
            maxAge: start.cookieMaxAgeSeconds * 1000
        })
        response.redirect(start.authorizationUrl)
    })

    router.get('/auth/google/callback', async (request, response) => {
        try {
            const result = await authService.completeGoogleOAuthCallback({
                code: requireQueryText(request.query.code, 'code'),
                state: requireQueryText(request.query.state, 'state'),
                transactionToken:
                    readCookie(request, options.transactionCookieName) ??
                    (() => {
                        throw badRequest('OAuth transaction cookie is missing', 'oauth_missing_transaction')
                    })()
            })
            clearTransactionCookie(request, response, options)
            response.redirect(withSessionFragment(result.returnTo, result.sessionToken))
        } catch (error) {
            clearTransactionCookie(request, response, options)
            throw error
        }
    })

    return router
}

function requireQueryText(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim())
        throw badRequest(`OAuth ${field} is missing`, `oauth_missing_${field}`)
    return value.trim()
}

function readCookie(request: Request, name: string): string | null {
    for (const cookie of request.headers.cookie?.split(';') ?? []) {
        const [rawName, ...rawValue] = cookie.trim().split('=')
        if (rawName === name) return decodeURIComponent(rawValue.join('='))
    }
    return null
}

function clearTransactionCookie(request: Request, response: Response, options: AuthRouterOptions): void {
    response.clearCookie(options.transactionCookieName, {
        path: '/api/wiki/auth/google',
        sameSite: 'lax',
        secure: options.forceSecureCookie || isSecureRequest(request)
    })
}

function withSessionFragment(returnTo: string, sessionToken: string): string {
    return `${returnTo}#${new URLSearchParams({ wiki_token: sessionToken, wiki_auth: 'google' }).toString()}`
}

function isSecureRequest(request: Request): boolean {
    return request.secure || request.headers['x-forwarded-proto'] === 'https'
}
