import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { WikiBlockquote } from './wiki-blockquote-extension'

function createMarkdownManager() {
    return new MarkdownManager({
        extensions: [StarterKit.configure({ undoRedo: false, link: false, blockquote: false }), WikiBlockquote],
        markedOptions: { gfm: true, breaks: false }
    })
}

describe('WikiBlockquote', () => {
    it('round-trips a custom quote tone and emoji', () => {
        const markdown = `:::wiki-quote {tone="warning" emoji="⚠️"}

주의 내용

:::`
        const manager = createMarkdownManager()

        const parsed = manager.parse(markdown)

        expect(parsed.content?.[0]).toMatchObject({
            type: 'blockquote',
            attrs: { tone: 'warning', color: '', emoji: '⚠️' }
        })

        const serialized = manager.serialize(parsed)
        expect(serialized).toContain(':::wiki-quote')
        expect(serialized).toContain('tone="warning"')
        expect(serialized).toContain('emoji="⚠️"')

        expect(manager.parse(serialized).content?.[0]).toMatchObject({
            type: 'blockquote',
            attrs: { tone: 'warning', color: '', emoji: '⚠️' }
        })
    })

    it('round-trips a custom picker color', () => {
        const manager = createMarkdownManager()
        const parsed = manager.parse(`:::wiki-quote {color="#2468ac"}

사용자 색상

:::`)

        expect(parsed.content?.[0]).toMatchObject({
            type: 'blockquote',
            attrs: { tone: 'info', color: '#2468ac', emoji: '' }
        })
        expect(manager.serialize(parsed)).toContain('color="#2468ac"')
    })

    it('keeps standard Markdown blockquotes pink by default', () => {
        const manager = createMarkdownManager()
        const parsed = manager.parse('> 기본 안내')

        expect(parsed.content?.[0]).toMatchObject({
            type: 'blockquote',
            attrs: { tone: 'info', color: '', emoji: '' }
        })
        expect(manager.serialize(parsed)).toContain('> 기본 안내')
    })
})
