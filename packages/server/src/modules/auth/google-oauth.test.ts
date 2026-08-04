import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import { GoogleOAuthService, googlePayloadToAuth, googleRolesForAdminStatus, sanitizeReturnTo } from './google-oauth'

const googleConfig = {
    redirectUri: 'https://wiki.example.com/api/wiki/auth/google/callback',
    hostedDomain: undefined
}

describe('Google OAuth roles', () => {
    it('allows verified Google users and separates viewer and admin roles by email', () => {
        expect(
            googlePayloadToAuth(
                { sub: 'viewer-id', email: 'viewer@example.com', email_verified: true, name: 'Viewer' },
                googleConfig
            )
        ).toEqual({
            userId: 'google:viewer-id',
            name: 'Viewer',
            email: 'viewer@example.com',
            roles: ['wiki:viewer']
        })
        expect(googleRolesForAdminStatus(true)).toEqual(['wiki:admin'])
        expect(googleRolesForAdminStatus(false)).toEqual(['wiki:viewer'])
    })

    it('rejects unverified users and accounts outside the configured hosted domain', () => {
        expect(() =>
            googlePayloadToAuth({ sub: 'user-id', email: 'user@example.com', email_verified: false }, googleConfig)
        ).toThrow('forbidden')
        expect(() =>
            googlePayloadToAuth(
                { sub: 'user-id', email: 'user@example.com', email_verified: true, hd: 'example.com' },
                { ...googleConfig, hostedDomain: 'studio.example.com' }
            )
        ).toThrow('forbidden')
    })

    it('only advertises Google login in Google auth mode', () => {
        const credentials = { ...googleConfig, clientId: 'client-id', clientSecret: 'client-secret' }
        expect(
            new GoogleOAuthService({ mode: 'google', jwtSecret: 'secret', sessionTtl: '8h', google: credentials })
                .enabled
        ).toBe(true)
        expect(new GoogleOAuthService({ mode: 'dev', sessionTtl: '8h', google: credentials }).enabled).toBe(false)
    })

    it('resolves an existing session role from the admin account repository', async () => {
        const secret = 'test-session-secret'
        const token = await new SignJWT({ name: '관리자', email: 'admin@example.com' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer('coconut-studio-wiki')
            .setAudience('coconut-studio-wiki')
            .setSubject('google:admin')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(secret))
        const service = new GoogleOAuthService(
            { mode: 'google', jwtSecret: secret, sessionTtl: '8h', google: googleConfig },
            {
                listAdminEmails: async () => ['admin@example.com'],
                isAdminEmail: async (email) => email === 'admin@example.com',
                addAdminEmail: async () => undefined,
                removeAdminEmail: async () => false
            }
        )

        await expect(service.authenticateSession(token)).resolves.toMatchObject({ roles: ['wiki:admin'] })
    })
})

describe('Google OAuth return path', () => {
    it('keeps wiki paths and rejects external redirects', () => {
        expect(sanitizeReturnTo('/wiki/category/guides')).toBe('/wiki/category/guides')
        expect(sanitizeReturnTo('https://attacker.example/wiki/welcome')).toBe('/wiki/welcome')
        expect(sanitizeReturnTo('//attacker.example/wiki/welcome')).toBe('/wiki/welcome')
    })
})
