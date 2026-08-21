import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WikiPageDetailDto, WikiPageDto } from '@coconut-studio/wiki-contracts'

import { createWikiPageWithUniqueSlug } from './WikiApplication'

const page = (slug: string): WikiPageDto => ({
    id: slug,
    slug,
    title: slug,
    icon: null,
    visibility: 'public',
    createdBy: 'test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    deletedBy: null
})

afterEach(() => vi.unstubAllGlobals())

describe('createWikiPageWithUniqueSlug', () => {
    it('refreshes the page index and retries after a slug conflict', async () => {
        const created = {
            ...page('hello-2'),
            markdown: '',
            renderedHtml: '',
            updatedBy: 'test',
            snapshotUpdatedAt: '2026-01-01T00:00:00.000Z'
        } satisfies WikiPageDetailDto
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: { code: 'conflict', message: 'slug conflict' } }), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
            .mockResolvedValueOnce(Response.json({ pages: [page('hello')] }))
            .mockResolvedValueOnce(Response.json({ page: created }, { status: 201 }))
        vi.stubGlobal('fetch', fetchMock)

        const result = await createWikiPageWithUniqueSlug({ token: 'test', basePath: '/api/wiki' }, 'Hello', [], {
            title: 'Hello',
            icon: null,
            visibility: 'public',
            markdown: ''
        })

        expect(result.page.slug).toBe('hello-2')
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({ slug: 'hello-2' })
    })
})
