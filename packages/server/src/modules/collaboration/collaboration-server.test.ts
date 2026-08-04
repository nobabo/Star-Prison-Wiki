import { describe, expect, it } from 'vitest'

import { pageIdFromDocumentName } from './collaboration-server'

describe('pageIdFromDocumentName', () => {
    it('accepts the wiki document namespace only', () => {
        expect(pageIdFromDocumentName('wiki:page-123')).toBe('page-123')
        expect(() => pageIdFromDocumentName('other:page-123')).toThrow('invalid_document_name')
        expect(() => pageIdFromDocumentName('wiki:../../secret')).toThrow('invalid_document_name')
    })
})
