import { describe, expect, it } from 'vitest'

import {
    getHighlightBlockHtmlAttrs,
    normalizeHighlightBlockShape,
    parseHighlightBlockMarkdownAttrs,
    renderMarkdownToHtml,
    serializeHighlightBlockMarkdownAttrs
} from './index'

describe('highlight block shape', () => {
    it('keeps existing cards diamond-shaped by default', () => {
        expect(normalizeHighlightBlockShape(undefined)).toBe('diamond')
        expect(parseHighlightBlockMarkdownAttrs('width="50%" variant="panel"').shape).toBe('diamond')
    })

    it('round-trips the selected card shape through markdown and HTML', () => {
        const attrs = parseHighlightBlockMarkdownAttrs('width="50%" variant="panel" attached="false" shape="rectangle"')

        expect(attrs.shape).toBe('rectangle')
        expect(serializeHighlightBlockMarkdownAttrs(attrs)).toContain('shape="rectangle"')
        expect(getHighlightBlockHtmlAttrs(attrs).dataShape).toBe('rectangle')
    })

    it('preserves the shape through the sanitized render pipeline', async () => {
        const html = await renderMarkdownToHtml(
            ':::wiki-highlight{width="50%" variant="panel" shape="rectangle"}\n내용\n:::'
        )

        expect(html).toContain('data-shape="rectangle"')
    })
})
