import type { Request } from 'express'
import { jwtVerify } from 'jose'

import { EMPTY_ADMIN_ACCOUNT_REPOSITORY, GoogleOAuthService } from './google-oauth'
import type { AuthContext, GoogleOAuthCallback, GoogleOAuthStart, WikiAuthConfig } from './types'
import type { AdminAccountRepository } from '../../persistence/repository'

const DEV_TOKENS: Record<string, AuthContext> = {
    'dev-admin': { userId: 'dev-admin', name: '관리자', roles: ['wiki:admin'] },
    'dev-writer': { userId: 'dev-writer', name: '작성자', roles: ['wiki:writer'] },
    'dev-viewer': { userId: 'dev-viewer', name: '열람자', roles: ['wiki:viewer'] }
}

export class WikiAuthService {
    readonly google: GoogleOAuthService

    constructor(
        readonly config: WikiAuthConfig,
        adminAccounts: AdminAccountRepository = EMPTY_ADMIN_ACCOUNT_REPOSITORY
    ) {
        this.google = new GoogleOAuthService(config, adminAccounts)
    }

    get status() {
        return {
            authMode: this.config.mode,
            google: { enabled: this.google.enabled }
        }
    }

    async authenticateRequest(request: Request): Promise<AuthContext | null> {
        const token = readBearerToken(request.headers.authorization)
        return token ? this.authenticateToken(token) : null
    }

    async authenticateToken(token: string): Promise<AuthContext | null> {
        if (this.config.mode === 'dev') return DEV_TOKENS[token] ?? null
        if (this.config.mode === 'google') return this.google.authenticateSession(token)
        return this.authenticateExternalJwt(token)
    }

    createGoogleOAuthStart(returnTo: string): Promise<GoogleOAuthStart> {
        return this.google.createStart(returnTo)
    }

    completeGoogleOAuthCallback(input: {
        code: string
        state: string
        transactionToken: string
    }): Promise<GoogleOAuthCallback> {
        return this.google.complete(input)
    }

    private async authenticateExternalJwt(token: string): Promise<AuthContext | null> {
        if (!this.config.jwtSecret) throw new Error('WIKI_JWT_SECRET is required when WIKI_AUTH_MODE=jwt')
        try {
            const { payload } = await jwtVerify(token, new TextEncoder().encode(this.config.jwtSecret))
            if (typeof payload.sub !== 'string') return null
            const roles = Array.isArray(payload.roles)
                ? payload.roles.filter((role): role is string => typeof role === 'string')
                : []
            return {
                userId: payload.sub,
                name: typeof payload.name === 'string' ? payload.name : payload.sub,
                email: typeof payload.email === 'string' ? payload.email : undefined,
                roles
            }
        } catch {
            return null
        }
    }
}

export function readBearerToken(authorization: string | undefined): string | null {
    if (!authorization) return null
    return /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() || null
}
