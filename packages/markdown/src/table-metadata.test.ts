import { describe, expect, it } from 'vitest'

import { renderMarkdownToHtml } from './render'
import { normalizeTableHeaderBackground, parseWikiTableMetadata, serializeWikiTableMetadata } from './table-metadata'

describe('wiki table metadata', () => {
    it('normalizes and serializes safe table presentation values', () => {
        const serialized = serializeWikiTableMetadata({
            headerBackground: '#DAE6FB',
            widths: [120.4, 260, 12]
        })

        expect(serialized).toBe('<!-- wiki-table headerBackground="#dae6fb" widths="120,260,0" -->')
        expect(parseWikiTableMetadata(serialized)).toEqual({
            headerBackground: '#dae6fb',
            widths: [120, 260, 0]
        })
        expect(normalizeTableHeaderBackground('red')).toBe('')
    })

    it('renders the header color and resized columns through the sanitized pipeline', async () => {
        const html = await renderMarkdownToHtml(`<!-- wiki-table headerBackground="#dae6fb" widths="140,260" -->

| 제목 | 설명 |
| --- | --- |
| 값 | 내용 |`)

        expect(html).toContain('data-header-background="#dae6fb"')
        expect(html).toContain('--wiki-table-header-color: #dae6fb')
        expect(html).toContain('style="width: 140px"')
        expect(html).toContain('style="width: 260px"')
        expect(html).not.toContain('wiki-table headerBackground')
    })
})
