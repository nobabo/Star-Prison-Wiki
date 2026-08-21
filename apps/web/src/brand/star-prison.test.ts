import { describe, expect, it } from 'vitest'

import { buildStarPrisonCollaborationUrl } from './star-prison'

describe('Star Prison collaboration URL', () => {
    it('uses the same HTTPS host through the public Nginx WebSocket path', () => {
        expect(
            buildStarPrisonCollaborationUrl('welcome', {
                protocol: 'https:',
                host: 'wiki.kokonut.studio',
                hostname: 'wiki.kokonut.studio'
            })
        ).toBe('wss://wiki.kokonut.studio/collab/wiki/welcome')
    })

    it('uses the direct collaboration port during local HTTP development', () => {
        expect(
            buildStarPrisonCollaborationUrl(
                'welcome',
                {
                    protocol: 'http:',
                    host: '127.0.0.1:5173',
                    hostname: '127.0.0.1'
                },
                undefined,
                '2234'
            )
        ).toBe('ws://127.0.0.1:2234/collab/wiki/welcome')
    })

    it('honors an explicit collaboration base URL', () => {
        const location = { protocol: 'https:', host: 'wiki.example.com', hostname: 'wiki.example.com' }

        expect(buildStarPrisonCollaborationUrl('운영 기록', location, 'wss://sync.example.com/')).toBe(
            'wss://sync.example.com/collab/wiki/%EC%9A%B4%EC%98%81%20%EA%B8%B0%EB%A1%9D'
        )
    })
})
