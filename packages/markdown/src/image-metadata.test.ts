import { describe, expect, it } from 'vitest'

import { parseWikiImageMetadata, serializeWikiImageMetadata } from './image-metadata'
import { renderMarkdownToHtml } from './render'

describe('wiki image markdown metadata', () => {
    it('normalizes and parses image dimensions', () => {
        const serialized = serializeWikiImageMetadata({ width: 420.4, height: 236.2 })

        expect(serialized).toBe('<!-- wiki-image width="420" height="236" -->')
        expect(parseWikiImageMetadata(serialized)).toEqual({ width: 420, height: 236 })
        expect(parseWikiImageMetadata('<!-- wiki-image width="10" height="99999" -->')).toBeNull()
    })

    it('renders the persisted image size without exposing the metadata comment', async () => {
        const html = await renderMarkdownToHtml(
            '<!-- wiki-image width="420" height="236" -->\n![교도소 전경](/api/wiki/media/image.png)'
        )

        expect(html).toContain('width="420"')
        expect(html).toContain('height="236"')
        expect(html).toContain('style="width: 420px; height: auto; max-width: 100%"')
        expect(html).not.toContain('<!-- wiki-image')
    })
})
