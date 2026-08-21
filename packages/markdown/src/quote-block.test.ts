import { describe, expect, it } from 'vitest'

import {
    getQuoteBlockHtmlAttrs,
    normalizeQuoteBlockAttrs,
    parseQuoteBlockMarkdownAttrs,
    renderMarkdownToHtml,
    serializeQuoteBlockMarkdownAttrs
} from './index'

describe('quote block', () => {
    it('normalizes and serializes the supported tones and emoji', () => {
        const attrs = parseQuoteBlockMarkdownAttrs('tone="warning" emoji="⚠️"')

        expect(attrs).toEqual({ tone: 'warning', color: '', emoji: '⚠️' })
        expect(serializeQuoteBlockMarkdownAttrs(attrs)).toBe('tone="warning" emoji="⚠️"')

        const custom = parseQuoteBlockMarkdownAttrs('tone="blue" color="#2468ac"')
        expect(custom).toEqual({ tone: 'blue', color: '#2468ac', emoji: '' })
        expect(serializeQuoteBlockMarkdownAttrs(custom)).toBe('tone="blue" color="#2468ac"')
        expect(normalizeQuoteBlockAttrs({ tone: 'unknown', emoji: '🙂' })).toEqual({
            tone: 'info',
            color: '',
            emoji: '🙂'
        })
    })

    it('renders quote tone and emoji attributes through the sanitized pipeline', async () => {
        const html = await renderMarkdownToHtml(':::wiki-quote {tone="correct" emoji="✅"}\n\n완료되었습니다.\n\n:::')

        expect(html).toContain('class="wiki-quote wiki-quote-correct"')
        expect(html).toContain('data-wiki-quote="true"')
        expect(html).toContain('data-quote-tone="correct"')
        expect(html).toContain('data-quote-emoji="✅"')
        expect(getQuoteBlockHtmlAttrs({ tone: 'error' }).className).toEqual(['wiki-quote', 'wiki-quote-error'])

        const customHtml = await renderMarkdownToHtml(
            `:::wiki-quote {color="#2468ac"}

사용자 색상

:::`
        )
        expect(customHtml).toContain('data-quote-color="#2468ac"')
        expect(customHtml).toContain('style="--wiki-quote-color: #2468ac"')
    })
})
