import { describe, expect, it } from 'vitest'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import { canAdminPage, canReadPage, canWritePage, strongestPermission } from './page-policy'

const privatePage = { visibility: 'private' } as WikiPageDto
const publicPage = { visibility: 'public' } as WikiPageDto

describe('page policy', () => {
    it('keeps public reads open and private reads permission-gated', () => {
        expect(canReadPage(publicPage, 'none')).toBe(true)
        expect(canReadPage(privatePage, 'none')).toBe(false)
        expect(canReadPage(privatePage, 'read')).toBe(true)
    })

    it('separates write and admin access and selects the strongest grant', () => {
        expect(canWritePage('read')).toBe(false)
        expect(canWritePage('write')).toBe(true)
        expect(canAdminPage('write')).toBe(false)
        expect(canAdminPage('admin')).toBe(true)
        expect(strongestPermission('read', 'admin')).toBe('admin')
    })
})
