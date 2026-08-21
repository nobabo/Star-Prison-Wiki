import Image from '@tiptap/extension-image'
import { Editor } from '@tiptap/react'
import { EditorState } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { countNestedDocumentElements, getContainingDocumentElementEnd } from '../lib/document-elements'
import { WikiBlockquote } from './wiki-blockquote-extension'
import { WikiHighlightBlock } from './wiki-highlight-extension'
import { preventNestedDocumentElementsPlugin } from './prevent-nested-document-elements'
import { WikiTableKit } from './wiki-table-extension'

function createEditor() {
    return new Editor({
        extensions: [
            StarterKit.configure({ blockquote: false }),
            Image,
            WikiTableKit,
            WikiBlockquote,
            WikiHighlightBlock
        ],
        content: {
            type: 'doc',
            content: [
                {
                    type: 'wikiHighlightBlock',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '카드 내용' }] }]
                },
                { type: 'paragraph' }
            ]
        }
    })
}

function createFilteredState(editor: Editor) {
    return EditorState.create({
        schema: editor.schema,
        doc: editor.state.doc,
        plugins: [preventNestedDocumentElementsPlugin]
    })
}

describe('PreventNestedDocumentElements', () => {
    it('rejects a transaction that adds a block element inside a card', () => {
        const editor = createEditor()
        const state = createFilteredState(editor)
        const nestedDocument = editor.schema.nodeFromJSON({
            type: 'doc',
            content: [
                {
                    type: 'wikiHighlightBlock',
                    content: [
                        {
                            type: 'blockquote',
                            content: [{ type: 'paragraph', content: [{ type: 'text', text: '중첩 인용문' }] }]
                        }
                    ]
                }
            ]
        })
        const result = state.applyTransaction(state.tr.replaceWith(0, state.doc.content.size, nestedDocument.content))

        expect(result.transactions).toHaveLength(0)
        expect(result.state.doc.eq(state.doc)).toBe(true)
        editor.destroy()
    })

    it('allows independent elements as top-level siblings', () => {
        const editor = createEditor()
        const state = createFilteredState(editor)
        const quote = editor.schema.nodeFromJSON({
            type: 'blockquote',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '독립 인용문' }] }]
        })
        const result = state.applyTransaction(state.tr.insert(state.doc.content.size, quote))

        expect(result.transactions).toHaveLength(1)
        expect(result.state.doc.content.content.map((node) => node.type.name)).toEqual([
            'wikiHighlightBlock',
            'paragraph',
            'blockquote'
        ])
        editor.destroy()
    })

    it('allows ordinary text edits inside an element', () => {
        const editor = createEditor()
        const state = createFilteredState(editor)
        const result = state.applyTransaction(state.tr.insertText('새 ', 2))

        expect(result.transactions).toHaveLength(1)
        expect(result.state.doc.textContent).toContain('새 카드 내용')
        editor.destroy()
    })

    it('recognizes nested elements in cards, quotes, and tables', () => {
        const editor = createEditor()
        const nestedDocument = editor.schema.nodeFromJSON({
            type: 'doc',
            content: [
                {
                    type: 'wikiHighlightBlock',
                    content: [{ type: 'image', attrs: { src: '/card.png' } }]
                },
                {
                    type: 'blockquote',
                    content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'code' }] }]
                },
                {
                    type: 'table',
                    content: [
                        {
                            type: 'tableRow',
                            content: [
                                {
                                    type: 'tableCell',
                                    content: [
                                        {
                                            type: 'bulletList',
                                            content: [
                                                {
                                                    type: 'listItem',
                                                    content: [{ type: 'paragraph' }]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        })

        expect(countNestedDocumentElements(nestedDocument)).toBe(3)
        editor.destroy()
    })
})

describe('getContainingDocumentElementEnd', () => {
    it('returns the outer block end for a caret inside a card', () => {
        const editor = createEditor()
        editor.commands.setTextSelection(2)

        expect(getContainingDocumentElementEnd(editor)).toBe(editor.state.doc.firstChild?.nodeSize)
        editor.destroy()
    })

    it('returns the selected element end but ignores a normal paragraph', () => {
        const editor = createEditor()
        const cardSize = editor.state.doc.firstChild?.nodeSize ?? 0

        editor.commands.setNodeSelection(0)
        expect(getContainingDocumentElementEnd(editor)).toBe(cardSize)

        editor.commands.setTextSelection(cardSize + 1)
        expect(getContainingDocumentElementEnd(editor)).toBeNull()
        editor.destroy()
    })
})
