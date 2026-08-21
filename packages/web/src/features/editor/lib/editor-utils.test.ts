import { describe, expect, it } from 'vitest'

import { normalizePageIcon } from './editor-utils'

describe('normalizePageIcon', () => {
    it('preserves one complete joined emoji', () => {
        expect(normalizePageIcon(' 👩‍⚖️ ')).toBe('👩‍⚖️')
    })

    it('keeps only the first grapheme', () => {
        expect(normalizePageIcon('🇰🇷💵')).toBe('🇰🇷')
        expect(normalizePageIcon('AB')).toBe('A')
        expect(normalizePageIcon('  ')).toBeNull()
    })
})
