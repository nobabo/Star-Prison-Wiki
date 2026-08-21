import { describe, expect, it } from 'vitest'

import {
    getHighlightBlockHtmlAttrs,
    normalizeHighlightBlockHeight,
    normalizeHighlightBlockShape,
    parseHighlightBlockMarkdownAttrs,
    renderMarkdownToHtml,
    serializeHighlightBlockMarkdownAttrs
} from './index'

describe('highlight block shape', () => {
    it('supports a serif lead paragraph variant', async () => {
        const attrs = parseHighlightBlockMarkdownAttrs('width="100%" variant="lead"')
        const html = await renderMarkdownToHtml(':::wiki-highlight{variant="lead"}\n문서의 첫 단락\n:::')

        expect(attrs.variant).toBe('lead')
        expect(serializeHighlightBlockMarkdownAttrs(attrs)).toContain('variant="lead"')
        expect(html).toContain('wiki-highlight-block-lead')
    })

    it('round-trips a resized card height and rejects unsafe values', () => {
        const attrs = parseHighlightBlockMarkdownAttrs('width="50%" height="287.4px" variant="panel"')

        expect(attrs.height).toBe('287.4px')
        expect(serializeHighlightBlockMarkdownAttrs(attrs)).toContain('height="287.4px"')
        expect(getHighlightBlockHtmlAttrs(attrs).dataHeight).toBe('287.4px')
        expect(normalizeHighlightBlockHeight('10px')).toBe('132px')
        expect(normalizeHighlightBlockHeight('calc(100vh)')).toBe('')
    })

    it('preserves the resized height through the sanitized render pipeline', async () => {
        const html = await renderMarkdownToHtml(
            ':::wiki-highlight{width="50%" height="287.4px" variant="panel"}\ncontent\n:::'
        )

        expect(html).toContain('data-height="287.4px"')
        expect(html).toContain('height: 287.4px')
    })

    it('keeps existing cards diamond-shaped by default', () => {
        expect(normalizeHighlightBlockShape(undefined)).toBe('diamond')
        expect(parseHighlightBlockMarkdownAttrs('width="50%" variant="panel"').shape).toBe('diamond')
    })

    it('round-trips the selected card shape through markdown and HTML', () => {
        const attrs = parseHighlightBlockMarkdownAttrs(
            'width="50%" variant="panel" attached="false" rowStart="true" shape="rectangle"'
        )

        expect(attrs.shape).toBe('rectangle')
        expect(attrs.rowStart).toBe(true)
        expect(serializeHighlightBlockMarkdownAttrs(attrs)).toContain('shape="rectangle"')
        expect(serializeHighlightBlockMarkdownAttrs(attrs)).toContain('rowStart="true"')
        expect(getHighlightBlockHtmlAttrs(attrs).dataShape).toBe('rectangle')
        expect(getHighlightBlockHtmlAttrs(attrs).dataRowStart).toBe('true')
    })

    it('round-trips a theme-aware custom card background', async () => {
        const attrs = parseHighlightBlockMarkdownAttrs('width="50%" variant="panel" backgroundColor="#DAE6FB"')

        expect(attrs.backgroundColor).toBe('#dae6fb')
        expect(serializeHighlightBlockMarkdownAttrs(attrs)).toContain('backgroundColor="#dae6fb"')
        const html = await renderMarkdownToHtml(
            ':::wiki-highlight{width="50%" variant="panel" backgroundColor="#dae6fb"}\n내용\n:::'
        )
        expect(html).toContain('data-background-color="#dae6fb"')
        expect(html).toContain('--wiki-card-color: #dae6fb')
    })

    it('preserves the shape through the sanitized render pipeline', async () => {
        const html = await renderMarkdownToHtml(
            ':::wiki-highlight{width="50%" variant="panel" rowStart="true" shape="rectangle"}\n내용\n:::'
        )

        expect(html).toContain('data-shape="rectangle"')
        expect(html).toContain('data-row-start="true"')
    })

    it('renders the spaced directive syntax serialized by the editor', async () => {
        const html = await renderMarkdownToHtml(
            `:::wiki-highlight {width="100%" variant="panel" rowStart="true" shape="rectangle"}
내용
:::`
        )

        expect(html).toContain('class="wiki-highlight-block wiki-highlight-block-panel"')
        expect(html).toContain('data-wiki-highlight-block="true"')
    })
})
