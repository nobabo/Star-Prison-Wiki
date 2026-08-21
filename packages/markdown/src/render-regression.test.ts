import { describe, expect, it } from 'vitest'

import { renderMarkdownToHtml } from './render'

describe('renderMarkdownToHtml regressions', () => {
    it('groups many underline pairs without rescanning the remaining document', async () => {
        const markdown = Array.from({ length: 2_000 }, (_, index) => `<u>항목 ${index}</u>`).join('\n')
        const html = await renderMarkdownToHtml(markdown)

        expect(html.match(/<u>/g)).toHaveLength(2_000)
        expect(html).toContain('<u>항목 1999</u>')
    })

    it('renders tables outside highlight cards even for existing nested markdown', async () => {
        const markdown = `:::wiki-highlight {width="100%" variant="panel"}

### 작업 안내

| 작업 | 팁 |
| --- | --- |
| 조립 | 기억 |

표 아래 안내

:::`
        const html = await renderMarkdownToHtml(markdown)
        const firstCardEnd = html.indexOf('</div>')
        const tableStart = html.indexOf('<table>')
        const secondCardStart = html.indexOf('<div', firstCardEnd + 1)

        expect(firstCardEnd).toBeGreaterThan(-1)
        expect(tableStart).toBeGreaterThan(firstCardEnd)
        expect(secondCardStart).toBeGreaterThan(tableStart)
        expect(html.slice(tableStart, secondCardStart)).toContain('</table>')
    })
})
