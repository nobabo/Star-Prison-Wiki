import Image from '@tiptap/extension-image'
import { Markdown } from '@tiptap/markdown'
import { Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import {
    applyWikiImageMetadata,
    collectWikiImageMetadata,
    extractWikiImageMetadata,
    getEditorMarkdown,
    injectWikiImageMetadata,
    setEditorMarkdown
} from './wiki-markdown'

const imageDoc: JSONContent = {
    type: 'doc',
    content: [
        {
            type: 'image',
            attrs: { src: '/api/wiki/media/image.png', alt: '전경', width: 420, height: 236 }
        },
        { type: 'paragraph' }
    ]
}

describe('wiki image markdown metadata', () => {
    it('injects and extracts dimensions next to the matching image', () => {
        const markdown = '![전경](/api/wiki/media/image.png)'
        const serialized = injectWikiImageMetadata(markdown, collectWikiImageMetadata(imageDoc))

        expect(serialized).toContain('<!-- wiki-image width="420" height="236" -->')
        const extracted = extractWikiImageMetadata(serialized)
        expect(extracted.markdown).toBe(markdown)
        expect(extracted.metadata).toEqual([{ width: 420, height: 236 }])
    })

    it('restores width and height attributes on the parsed image node', () => {
        const plainDoc: JSONContent = JSON.parse(JSON.stringify(imageDoc))
        plainDoc.content![0]!.attrs = {
            src: '/api/wiki/media/image.png',
            alt: '전경',
            width: null,
            height: null
        }

        const restored = applyWikiImageMetadata(plainDoc, [{ width: 420, height: 236 }])

        expect(restored.changed).toBe(true)
        expect(restored.doc.content?.[0]?.attrs).toMatchObject({ width: 420, height: 236 })
    })

    it('keeps unresized images free of metadata comments', () => {
        const markdown = '![전경](/api/wiki/media/image.png)'
        expect(injectWikiImageMetadata(markdown, [null])).toBe(markdown)
        expect(extractWikiImageMetadata(markdown).metadata).toEqual([null])
    })

    it('round-trips resized dimensions through the actual editor markdown API', () => {
        const editor = new Editor({
            extensions: [
                StarterKit.configure({ link: false }),
                Image,
                Markdown.configure({ markedOptions: { gfm: true, breaks: false } })
            ],
            content: { type: 'doc', content: [{ type: 'paragraph' }] }
        })
        const markdown = '<!-- wiki-image width="420" height="236" -->\n![전경](/api/wiki/media/image.png)'

        expect(setEditorMarkdown(editor, markdown)).toBe(true)
        expect(editor.getJSON().content?.[0]?.attrs).toMatchObject({ width: 420, height: 236 })
        expect(getEditorMarkdown(editor)).toContain('<!-- wiki-image width="420" height="236" -->')
        editor.destroy()
    })
})
