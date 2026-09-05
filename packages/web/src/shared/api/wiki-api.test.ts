import { afterEach, describe, expect, it, vi } from 'vitest'

import { uploadWikiImage } from './wiki-api'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('image uploads', () => {
    it('uploads an extension-detected GIF in proxy-safe chunks', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ uploadId: '11111111-1111-4111-8111-111111111111' }, { status: 201 }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(Response.json({ url: '/api/wiki/media/animation.gif' }, { status: 201 }))
        globalThis.fetch = fetchMock
        const gif = new File([new Uint8Array(512 * 1024 + 7)], 'animation.GIF', { type: '' })

        await expect(uploadWikiImage({ token: 'writer' }, gif, 'welcome')).resolves.toEqual({
            url: '/api/wiki/media/animation.gif'
        })

        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            '/api/wiki/media/uploads',
            '/api/wiki/media/uploads/11111111-1111-4111-8111-111111111111/chunks/0',
            '/api/wiki/media/uploads/11111111-1111-4111-8111-111111111111/chunks/1',
            '/api/wiki/media/uploads/11111111-1111-4111-8111-111111111111/complete'
        ])
        expect((fetchMock.mock.calls[1]?.[1]?.body as Blob).size).toBe(512 * 1024)
        expect((fetchMock.mock.calls[2]?.[1]?.body as Blob).size).toBe(7)
    })
})
