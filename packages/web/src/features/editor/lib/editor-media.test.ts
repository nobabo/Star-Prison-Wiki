import { Editor } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { WikiHighlightBlock } from '../extensions/wiki-highlight-extension'
import { WikiTableKit } from '../extensions/wiki-table-extension'
import {
    copyActiveTable,
    deleteEmptyParagraphAfterImage,
    deleteSelectedImage,
    getDroppedImageFiles,
    getImageFiles,
    imageBlocksWithTrailingParagraphs,
    insertImageBlocks,
    pasteCopiedTable,
    TABLE_CLIPBOARD_TYPE
} from './editor-media'

function tableContent() {
    return {
        type: 'doc',
        content: [
            {
                type: 'table',
                content: [
                    {
                        type: 'tableRow',
                        content: [
                            {
                                type: 'tableCell',
                                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A1' }] }]
                            }
                        ]
                    }
                ]
            }
        ]
    }
}

function clipboard(): DataTransfer {
    const values = new Map<string, string>()
    return {
        setData: (type: string, value: string) => values.set(type, value),
        getData: (type: string) => values.get(type) ?? ''
    } as unknown as DataTransfer
}

describe('table clipboard', () => {
    it('copies and pastes a whole active table with the custom clipboard format', () => {
        const source = new Editor({ extensions: [StarterKit, WikiTableKit], content: tableContent() })
        source.commands.setTextSelection(3)
        const data = clipboard()

        expect(copyActiveTable(source, data, false)).toBe(true)
        expect(JSON.parse(data.getData(TABLE_CLIPBOARD_TYPE))).toMatchObject({ type: 'table' })

        const target = new Editor({
            extensions: [StarterKit, WikiTableKit],
            content: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'target' }] }]
            }
        })
        expect(pasteCopiedTable(target, data)).toBe(true)
        expect(target.getJSON().content?.some((node) => node.type === 'table')).toBe(true)

        source.destroy()
        target.destroy()
    })

    it('cuts the whole table when the caret is inside it', () => {
        const editor = new Editor({ extensions: [StarterKit, WikiTableKit], content: tableContent() })
        editor.commands.setTextSelection(3)

        expect(copyActiveTable(editor, clipboard(), true)).toBe(true)
        expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(false)
        editor.destroy()
    })

    it('copies a whole table selected through its move handle', () => {
        const editor = new Editor({ extensions: [StarterKit, WikiTableKit], content: tableContent() })
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
        const data = clipboard()

        expect(copyActiveTable(editor, data, false)).toBe(true)
        expect(JSON.parse(data.getData(TABLE_CLIPBOARD_TYPE))).toMatchObject({ type: 'table' })
        editor.destroy()
    })
})

describe('image file filtering', () => {
    it('adds an independent empty paragraph after every uploaded image', () => {
        const first = { type: 'image', attrs: { src: '/api/wiki/media/first.png' } }
        const second = { type: 'image', attrs: { src: '/api/wiki/media/second.png' } }

        expect(imageBlocksWithTrailingParagraphs([first, second])).toEqual([
            first,
            { type: 'paragraph' },
            second,
            { type: 'paragraph' }
        ])
    })

    it('deletes an empty trailing paragraph without deleting its image', () => {
        const editor = new Editor({
            extensions: [StarterKit, Image],
            content: {
                type: 'doc',
                content: [
                    { type: 'image', attrs: { src: '/api/wiki/media/image.png' } },
                    { type: 'paragraph' },
                    { type: 'paragraph', content: [{ type: 'text', text: '다음 문단' }] }
                ]
            }
        })
        editor.commands.setTextSelection(2)

        expect(deleteEmptyParagraphAfterImage(editor)).toBe(true)
        expect(editor.getJSON().content).toMatchObject([
            { type: 'image', attrs: { src: '/api/wiki/media/image.png' } },
            { type: 'paragraph', content: [{ type: 'text', text: '다음 문단' }] }
        ])
        editor.destroy()
    })

    it('inserts pasted or dropped images after a card instead of nesting them', () => {
        const image = { type: 'image', attrs: { src: '/api/wiki/media/card.png' } }
        const editor = new Editor({
            extensions: [StarterKit, Image, WikiHighlightBlock],
            content: {
                type: 'doc',
                content: [{ type: 'wikiHighlightBlock', content: [{ type: 'paragraph' }] }]
            }
        })
        editor.commands.setTextSelection(2)

        insertImageBlocks(editor, [image])

        expect(editor.getJSON().content).toMatchObject([
            { type: 'wikiHighlightBlock', content: [{ type: 'paragraph' }] },
            image,
            { type: 'paragraph' }
        ])
        editor.destroy()
    })

    it('accepts a GIF by extension when the browser does not provide a MIME type', () => {
        const gif = new File(['GIF89a'], 'animation.GIF', { type: '' })
        const item = {
            kind: 'file',
            getAsFile: () => gif
        } as unknown as DataTransferItem

        expect(getImageFiles([item] as unknown as DataTransferItemList, null)).toEqual([gif])
    })

    it('leaves internal editor image drags to ProseMirror instead of uploading another copy', () => {
        const image = new File(['image'], 'image.png', { type: 'image/png' })
        const item = { kind: 'file', getAsFile: () => image } as unknown as DataTransferItem
        const editor = { view: { dragging: { move: true } } } as unknown as Pick<Editor, 'view'>

        expect(getDroppedImageFiles(editor, [item] as unknown as DataTransferItemList, null)).toEqual([])
    })

    it('deletes a selected image node', () => {
        const editor = new Editor({
            extensions: [StarterKit, Image],
            content: {
                type: 'doc',
                content: [{ type: 'image', attrs: { src: '/api/wiki/media/image.png' } }, { type: 'paragraph' }]
            }
        })
        editor.commands.setNodeSelection(0)

        expect(deleteSelectedImage(editor)).toBe(true)
        expect(editor.getJSON().content?.some((node) => node.type === 'image')).toBe(false)
        editor.destroy()
    })
})
