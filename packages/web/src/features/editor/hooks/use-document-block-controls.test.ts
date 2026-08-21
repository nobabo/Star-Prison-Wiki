import { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { WikiTableAttributes, WikiTableKit } from '../extensions/wiki-table-extension'
import {
    moveTopLevelBlock,
    moveTopLevelBlockTo,
    selectTopLevelTable,
    setTopLevelTableHeaderBackground
} from './use-document-block-controls'

describe('document block movement', () => {
    it('moves any top-level block up and down without changing its content', () => {
        const editor = new Editor({
            extensions: [StarterKit],
            content: {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
                    {
                        type: 'blockquote',
                        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quote' }] }]
                    },
                    { type: 'paragraph', content: [{ type: 'text', text: 'last' }] }
                ]
            }
        })

        expect(moveTopLevelBlock(editor, 1, 'up')).toBe(true)
        expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['blockquote', 'paragraph', 'paragraph'])
        expect(moveTopLevelBlock(editor, 0, 'down')).toBe(true)
        expect(editor.getText()).toContain('first')
        expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'blockquote', 'paragraph'])
        expect(moveTopLevelBlock(editor, 0, 'up')).toBe(false)
        expect(moveTopLevelBlockTo(editor, 2, 0)).toBe(true)
        expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'blockquote'])
        expect(moveTopLevelBlockTo(editor, 0, 2)).toBe(true)
        expect(moveTopLevelBlockTo(editor, 1, 1)).toBe(false)

        editor.destroy()
    })

    it('moves a horizontal rule like any other top-level block', () => {
        const editor = new Editor({
            extensions: [StarterKit],
            content: {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
                    { type: 'horizontalRule' },
                    { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }
                ]
            }
        })

        expect(moveTopLevelBlock(editor, 1, 'down')).toBe(true)
        expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'horizontalRule'])

        editor.destroy()
    })

    it('updates a table header background by top-level block position', () => {
        const editor = new Editor({
            extensions: [StarterKit, WikiTableKit, WikiTableAttributes],
            content: {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
                    {
                        type: 'table',
                        content: [
                            {
                                type: 'tableRow',
                                content: [{ type: 'tableHeader', content: [{ type: 'paragraph' }] }]
                            }
                        ]
                    }
                ]
            }
        })

        expect(setTopLevelTableHeaderBackground(editor, 1, '#d9f1df')).toBe(true)
        expect(editor.getJSON().content?.[1]?.attrs).toMatchObject({ headerBackground: '#d9f1df' })
        expect(setTopLevelTableHeaderBackground(editor, 0, '#d9f1df')).toBe(false)
        editor.destroy()
    })

    it('selects a whole table by its top-level block position', () => {
        const editor = new Editor({
            extensions: [StarterKit, WikiTableKit],
            content: {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
                    {
                        type: 'table',
                        content: [
                            {
                                type: 'tableRow',
                                content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }]
                            }
                        ]
                    }
                ]
            }
        })

        expect(selectTopLevelTable(editor, 1)).toBe(true)
        expect(editor.state.selection).toBeInstanceOf(NodeSelection)
        expect((editor.state.selection as NodeSelection).node.type.name).toBe('table')
        expect(selectTopLevelTable(editor, 0)).toBe(false)
        editor.destroy()
    })
})
