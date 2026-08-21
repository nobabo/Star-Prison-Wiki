import { describe, expect, it } from 'vitest'

import { normalizePageIcon } from './page-normalization'

describe('normalizePageIcon', () => {
    it('preserves one complete joined emoji', () => {
        expect(normalizePageIcon(' 👩‍⚖️ ')).toBe('👩‍⚖️')
    })

    it('keeps only the first grapheme and rejects non-string values', () => {
        expect(normalizePageIcon('🇰🇷💵')).toBe('🇰🇷')
        expect(normalizePageIcon('AB')).toBe('A')
        expect(normalizePageIcon(null)).toBeNull()
    })
})
