import type { WikiPageDto } from '@coconut-studio/wiki-contracts'
import { describe, expect, it, vi } from 'vitest'

import type { WikiRepositories } from '../../persistence/repository'
import { WikiPageService } from './page-service'

const pages: WikiPageDto[] = [
    page('public', 'public'),
    page('private-readable', 'private'),
    page('private-hidden', 'private')
]

describe('WikiPageService.listReadablePages', () => {
    it('does not resolve permissions for anonymous public-page listings', async () => {
        const resolvePagePermissions = vi.fn()
        const service = new WikiPageService(repositories(resolvePagePermissions))

        expect((await service.listReadablePages(null)).map((entry) => entry.id)).toEqual(['public'])
        expect(resolvePagePermissions).not.toHaveBeenCalled()
    })

    it('resolves all private-page permissions in one batch', async () => {
        const resolvePagePermissions = vi.fn().mockResolvedValue(new Map([['private-readable', 'read']]))
        const service = new WikiPageService(repositories(resolvePagePermissions))

        const result = await service.listReadablePages({
            userId: 'viewer',
            name: 'Viewer',
            roles: ['wiki:viewer']
        })

        expect(result.map((entry) => entry.id)).toEqual(['public', 'private-readable'])
        expect(resolvePagePermissions).toHaveBeenCalledOnce()
        expect(resolvePagePermissions).toHaveBeenCalledWith({
            pageIds: ['private-readable', 'private-hidden'],
            userId: 'viewer',
            roles: ['wiki:viewer']
        })
    })
})

function repositories(resolvePagePermissions: ReturnType<typeof vi.fn>): WikiRepositories {
    return {
        pages: { listPages: vi.fn().mockResolvedValue(pages) },
        permissions: { resolvePagePermissions },
        mode: 'file-dev'
    } as unknown as WikiRepositories
}

function page(id: string, visibility: WikiPageDto['visibility']): WikiPageDto {
    return {
        id,
        slug: id,
        title: id,
        icon: null,
        visibility,
        createdBy: 'author',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
        deletedBy: null
    }
}
