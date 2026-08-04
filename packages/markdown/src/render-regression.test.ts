import { describe, expect, it } from 'vitest'

import { renderMarkdownToHtml } from './render'

describe('renderMarkdownToHtml regressions', () => {
    it('groups many underline pairs without rescanning the remaining document', async () => {
        const markdown = Array.from({ length: 2_000 }, (_, index) => `<u>항목 ${index}</u>`).join('\n')
        const html = await renderMarkdownToHtml(markdown)

        expect(html.match(/<u>/g)).toHaveLength(2_000)
        expect(html).toContain('<u>항목 1999</u>')
    })
})
