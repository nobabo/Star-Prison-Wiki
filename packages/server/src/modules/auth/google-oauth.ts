import { createHash, randomBytes } from 'node:crypto'

import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose'

import type {
    AuthContext,
    GoogleOAuthCallback,
    GoogleOAuthStart,
    GoogleOAuthTransaction,
    WikiAuthConfig
} from './types'

import type { AdminAccountRepository } from '../../persistence/repository'
import { HttpError } from '../../shared/http/http-error'

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const OAUTH_TRANSACTION_ISSUER = 'coconut-studio-wiki-oauth'
const OAUTH_TRANSACTION_AUDIENCE = 'coconut-studio-wiki-google'
const APP_SESSION_ISSUER = 'coconut-studio-wiki'
const APP_SESSION_AUDIENCE = 'coconut-studio-wiki'
const OAUTH_TRANSACTION_MAX_AGE_SECONDS = 10 * 60
const googleJwks = createRemoteJWKSet(GOOGLE_JWKS_URL)

export const EMPTY_ADMIN_ACCOUNT_REPOSITORY: AdminAccountRepository = {
    listAdminEmails: async () => [],
    isAdminEmail: async () => false,
    addAdminEmail: async () => undefined,
    removeAdminEmail: async () => false
}

export class GoogleOAuthService {
    constructor(
        private readonly config: WikiAuthConfig,
        private readonly adminAccounts: AdminAccountRepository = EMPTY_ADMIN_ACCOUNT_REPOSITORY
    ) {}

    get enabled(): boolean {
        return this.config.mode === 'google' && Boolean(this.config.google.clientId && this.config.google.clientSecret)
    }

    async createStart(returnTo: string): Promise<GoogleOAuthStart> {
        const state = randomToken()
        const nonce = randomToken()
        const codeVerifier = randomToken(64)
        const transaction: GoogleOAuthTransaction = {
            state,
            nonce,
            codeVerifier,
            returnTo: sanitizeReturnTo(returnTo)
        }
        const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_URL)
        authorizationUrl.searchParams.set('client_id', this.requireClientId())
        authorizationUrl.searchParams.set('redirect_uri', this.config.google.redirectUri)
        authorizationUrl.searchParams.set('response_type', 'code')
        authorizationUrl.searchParams.set('scope', 'openid email profile')
        authorizationUrl.searchParams.set('state', state)
        authorizationUrl.searchParams.set('nonce', nonce)
        authorizationUrl.searchParams.set('code_challenge', codeChallenge(codeVerifier))
        authorizationUrl.searchParams.set('code_challenge_method', 'S256')
        authorizationUrl.searchParams.set('access_type', 'online')
        authorizationUrl.searchParams.set('prompt', 'select_account')

        if (this.config.google.hostedDomain) {
            authorizationUrl.searchParams.set('hd', this.config.google.hostedDomain)
        }
        return {
            authorizationUrl: authorizationUrl.toString(),
            transactionToken: await this.signTransaction(transaction),
            cookieMaxAgeSeconds: OAUTH_TRANSACTION_MAX_AGE_SECONDS
        }
    }

    async complete(input: { code: string; state: string; transactionToken: string }): Promise<GoogleOAuthCallback> {
        const transaction = await this.verifyTransaction(input.transactionToken)
        if (input.state !== transaction.state) throw new Error('oauth_state_mismatch')

        const tokenResponse = await this.exchangeCode(input.code, transaction.codeVerifier)
        if (!tokenResponse.id_token) throw new Error('oauth_missing_id_token')

        const { payload } = await jwtVerify(tokenResponse.id_token, googleJwks, {
            issuer: GOOGLE_ISSUERS,
            audience: this.requireClientId()
        })
        if (payload.nonce !== transaction.nonce) throw new Error('oauth_nonce_mismatch')

        const auth = await this.payloadToAuth(payload)
        return { sessionToken: await this.signSession(auth), returnTo: transaction.returnTo }
    }

    async authenticateSession(token: string): Promise<AuthContext | null> {
        let payload: JWTPayload
        try {
            const verified = await jwtVerify(token, this.secret(), {
                issuer: APP_SESSION_ISSUER,
                audience: APP_SESSION_AUDIENCE
            })
            payload = verified.payload
        } catch {
            return null
        }
        if (typeof payload.sub !== 'string') return null
        const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined
        if (!email) return null
        const isAdmin = await this.adminAccounts.isAdminEmail(email)
        return {
            userId: payload.sub,
            name: typeof payload.name === 'string' ? payload.name : payload.sub,
            email,
            roles: googleRolesForAdminStatus(isAdmin)
        }
    }

    private async payloadToAuth(payload: JWTPayload): Promise<AuthContext> {
        const auth = googlePayloadToAuth(payload, this.config.google)
        const isAdmin = auth.email ? await this.adminAccounts.isAdminEmail(auth.email) : false
        return { ...auth, roles: googleRolesForAdminStatus(isAdmin) }
    }

    private async signTransaction(transaction: GoogleOAuthTransaction): Promise<string> {
        return new SignJWT(transaction)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer(OAUTH_TRANSACTION_ISSUER)
            .setAudience(OAUTH_TRANSACTION_AUDIENCE)
            .setIssuedAt()
            .setExpirationTime('10m')
            .sign(this.secret())
    }

    private async verifyTransaction(token: string): Promise<GoogleOAuthTransaction> {
        const { payload } = await jwtVerify(token, this.secret(), {
            issuer: OAUTH_TRANSACTION_ISSUER,
            audience: OAUTH_TRANSACTION_AUDIENCE
        })
        if (
            typeof payload.state !== 'string' ||
            typeof payload.nonce !== 'string' ||
            typeof payload.codeVerifier !== 'string' ||
            typeof payload.returnTo !== 'string'
        ) {
            throw new Error('oauth_invalid_transaction')
        }
        return {
            state: payload.state,
            nonce: payload.nonce,
            codeVerifier: payload.codeVerifier,
            returnTo: sanitizeReturnTo(payload.returnTo)
        }
    }

    private async signSession(auth: AuthContext): Promise<string> {
        return new SignJWT({ name: auth.name, email: auth.email, roles: auth.roles })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer(APP_SESSION_ISSUER)
            .setAudience(APP_SESSION_AUDIENCE)
            .setSubject(auth.userId)
            .setIssuedAt()
            .setExpirationTime(this.config.sessionTtl)
            .sign(this.secret())
    }

    private async exchangeCode(code: string, codeVerifier: string): Promise<{ id_token?: string }> {
        let response: Response
        try {
            response = await fetch(GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: this.requireClientId(),
                    client_secret: this.requireClientSecret(),
                    redirect_uri: this.config.google.redirectUri,
                    grant_type: 'authorization_code',
                    code_verifier: codeVerifier
                }),
                signal: AbortSignal.timeout(10_000)
            })
        } catch (error) {
            const providerError = new HttpError(502, 'oauth_provider_error', 'Google OAuth is unavailable')
            providerError.cause = error
            throw providerError
        }
        if (!response.ok) {
            throw new HttpError(502, 'oauth_provider_error', 'Google OAuth token exchange failed')
        }
        const body = (await response.json()) as unknown
        if (!body || typeof body !== 'object') {
            throw new HttpError(502, 'oauth_provider_error', 'Google OAuth returned an invalid response')
        }
        const idToken = (body as { id_token?: unknown }).id_token
        return { ...(typeof idToken === 'string' ? { id_token: idToken } : {}) }
    }

    private requireClientId(): string {
        if (!this.config.google.clientId) throw new Error('GOOGLE_OAUTH_CLIENT_ID is required for Google OAuth')
        return this.config.google.clientId
    }

    private requireClientSecret(): string {
        if (!this.config.google.clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET is required for Google OAuth')
        return this.config.google.clientSecret
    }

    private secret(): Uint8Array {
        if (!this.config.jwtSecret) throw new Error('WIKI_JWT_SECRET is required when WIKI_AUTH_MODE=google')
        return new TextEncoder().encode(this.config.jwtSecret)
    }
}

export function sanitizeReturnTo(value: unknown): string {
    if (typeof value !== 'string') return '/wiki/welcome'
    try {
        const decoded = decodeURIComponent(value)
        return /^\/wiki\/[A-Za-z0-9가-힣._~!$&'()*+,;=:@%/-]*$/.test(decoded) ? decoded : '/wiki/welcome'
    } catch {
        return '/wiki/welcome'
    }
}

export function googlePayloadToAuth(
    payload: JWTPayload,
    config: Pick<WikiAuthConfig['google'], 'hostedDomain'>
): AuthContext {
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true'
    if (!sub || !email || !emailVerified) throw new Error('forbidden')
    const hostedDomain = typeof payload.hd === 'string' ? payload.hd.toLowerCase() : undefined
    if (config.hostedDomain && hostedDomain !== config.hostedDomain.toLowerCase()) throw new Error('forbidden')

    return {
        userId: `google:${sub}`,
        name: typeof payload.name === 'string' ? payload.name : email,
        email,
        roles: googleRolesForAdminStatus(false)
    }
}

export function googleRolesForAdminStatus(isAdmin: boolean): string[] {
    return isAdmin ? ['wiki:admin'] : ['wiki:viewer']
}

function codeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
}

function randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url')
}
