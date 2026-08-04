import { describe, expect, it } from 'vitest'

import { consumeGoogleOAuthCallback, googleOAuthStartUrl } from './auth-session'

describe('browser auth session', () => {
    it('consumes the Google callback token and removes credentials from the URL', () => {
        let replaced = ''
        const token = consumeGoogleOAuthCallback(
            {
                pathname: '/wiki/welcome',
                search: '?preview=1',
                hash: '#wiki_token=session.jwt&wiki_auth=google'
            } as Location,
            {
                state: { preserved: true },
                replaceState(_data, _unused, url) {
                    replaced = String(url)
                }
            } as History
        )

        expect(token).toBe('session.jwt')
        expect(replaced).toBe('/wiki/welcome?preview=1')
    })

    it('ignores unrelated fragments and creates an encoded OAuth start URL', () => {
        let replaced = false
        expect(
            consumeGoogleOAuthCallback(
                { pathname: '/wiki/welcome', search: '', hash: '#section' } as Location,
                { state: null, replaceState: () => (replaced = true) } as unknown as History
            )
        ).toBeNull()
        expect(replaced).toBe(false)
        expect(googleOAuthStartUrl('/api/wiki', '/wiki/category/운영', 'https://wiki.example.com')).toBe(
            'https://wiki.example.com/api/wiki/auth/google/start?returnTo=%2Fwiki%2Fcategory%2F%EC%9A%B4%EC%98%81'
        )
    })
})
