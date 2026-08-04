import { describe, expect, it } from 'vitest'

import {
    decodeColorHtml,
    encodeColorDirectives,
    normalizeColor,
    normalizeHighlightBlockWidth,
    renderMarkdownToHtml
} from './index'

describe('wiki markdown', () => {
    it('round-trips safe color directives', () => {
        const markdown = ':color[주황]{fg="#F97316" bg="#fff7cc"}'
        expect(decodeColorHtml(encodeColorDirectives(markdown))).toBe(':color[주황]{fg="#f97316" bg="#fff7cc"}')
    })

    it('rejects non-hex colors and clamps highlight widths', () => {
        expect(normalizeColor('red')).toBeUndefined()
        expect(normalizeColor('url(https://example.com)')).toBeUndefined()
        expect(normalizeHighlightBlockWidth('10%')).toBe('25%')
        expect(normalizeHighlightBlockWidth('120%')).toBe('100%')
    })

    it('sanitizes scripts while preserving wiki directives', async () => {
        const html = await renderMarkdownToHtml(
            '<script>alert(1)</script>\n\n:color[안전]{fg="#f97316"}\n\n:::wiki-highlight{width="50%" variant="panel"}\n내용\n:::'
        )
        expect(html).not.toContain('<script')
        expect(html).toContain('wiki-color')
        expect(html).toContain('wiki-highlight-block-panel')
        expect(html).toContain('width: 50%')
    })
})
