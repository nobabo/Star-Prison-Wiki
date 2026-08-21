import { describe, expect, it } from 'vitest'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import { pageIdFromDocumentName, resolveAnonymousCollaborationAccess } from './collaboration-server'

describe('pageIdFromDocumentName', () => {
    it('accepts the wiki document namespace only', () => {
        expect(pageIdFromDocumentName('wiki:page-123')).toBe('page-123')
        expect(() => pageIdFromDocumentName('other:page-123')).toThrow('invalid_document_name')
        expect(() => pageIdFromDocumentName('wiki:../../secret')).toThrow('invalid_document_name')
    })

    it('allows anonymous users to subscribe to public documents as read-only clients', () => {
        expect(resolveAnonymousCollaborationAccess(page('public'))).toEqual({
            permission: 'none',
            readOnly: true
        })
        expect(resolveAnonymousCollaborationAccess(page('private'))).toBeNull()
    })
})

function page(visibility: WikiPageDto['visibility']): WikiPageDto {
    return { visibility } as WikiPageDto
}
