import { Editor } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { isTableHeaderColumnActive } from '../WikiEditor'
import { liftTablesOutOfHighlightBlocks } from '../lib/wiki-markdown'
import { WikiHighlightBlock } from './wiki-highlight-extension'
import { DeleteEmptyTableOnBackspace, isActiveTableEmpty, WikiTableKit } from './wiki-table-extension'

function createMarkdownManager() {
    return new MarkdownManager({
        extensions: [StarterKit.configure({ undoRedo: false, link: false }), WikiTableKit, Image, WikiHighlightBlock],
        markedOptions: { gfm: true, breaks: false }
    })
}

function createTableEditor(bodyText = '') {
    const cell = (type: 'tableHeader' | 'tableCell', text = '') => ({
        type,
        content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }]
    })
    const editor = new Editor({
        extensions: [StarterKit.configure({ undoRedo: false, link: false }), WikiTableKit, DeleteEmptyTableOnBackspace],
        content: {
            type: 'doc',
            content: [
                {
                    type: 'table',
                    content: [
                        { type: 'tableRow', content: [cell('tableHeader'), cell('tableHeader')] },
                        { type: 'tableRow', content: [cell('tableCell', bodyText), cell('tableCell')] }
                    ]
                },
                { type: 'paragraph' }
            ]
        }
    })
    let bodyCellPosition = 0
    editor.state.doc.descendants((node, position) => {
        if (!bodyCellPosition && node.type.name === 'tableCell') bodyCellPosition = position + 2
    })
    editor.commands.setTextSelection(bodyCellPosition)
    return editor
}

function getTableSize(editor: Editor): [number, number] {
    const table = editor.state.doc.firstChild
    if (table?.type.name !== 'table') return [0, 0]

    return [table.childCount, table.firstChild?.childCount ?? 0]
}

describe('WikiTableKit', () => {
    it('round-trips a GFM table inside a wiki highlight card', () => {
        const markdown = `:::wiki-highlight {width="100%" variant="panel" attached="false" rowStart="true" shape="rectangle"}

### 대표 음식

| 음식 | 주요 재료 |
| --- | --- |
| 징역 찌개 | 탄산수, 햄 |

:::`
        const manager = createMarkdownManager()

        const parsed = manager.parse(markdown)
        const card = parsed.content?.[0]
        const table = card?.content?.find((node) => node.type === 'table')

        expect(card?.type).toBe('wikiHighlightBlock')
        expect(table?.content).toHaveLength(2)
        expect(table?.content?.[0]?.content?.every((cell) => cell.type === 'tableHeader')).toBe(true)
        expect(manager.serialize(parsed)).toContain('| 징역 찌개')

        const reparsed = manager.parse(manager.serialize(parsed))
        expect(reparsed.content?.[0]?.content?.some((node) => node.type === 'table')).toBe(true)
    })

    it('lifts existing nested tables out while preserving card content on both sides', () => {
        const manager = createMarkdownManager()
        const parsed = manager.parse(`:::wiki-highlight {width="75%" variant="panel"}

### 제목

| 항목 | 값 |
| --- | --- |
| A | B |

표 아래 안내

:::`)

        const normalized = liftTablesOutOfHighlightBlocks(parsed)

        expect(normalized.changed).toBe(true)
        expect(normalized.doc.content?.map((node) => node.type)).toEqual([
            'wikiHighlightBlock',
            'table',
            'wikiHighlightBlock'
        ])
        expect(normalized.doc.content?.[0]?.attrs?.width).toBe('75%')
        expect(normalized.doc.content?.[2]?.content?.[0]?.type).toBe('paragraph')
    })

    it('inserts and removes rows and columns around the selected cell', () => {
        const editor = createTableEditor()

        expect(getTableSize(editor)).toEqual([2, 2])
        expect(editor.commands.addRowBefore()).toBe(true)
        expect(editor.commands.addRowAfter()).toBe(true)
        expect(getTableSize(editor)).toEqual([4, 2])
        expect(editor.commands.deleteRow()).toBe(true)
        expect(getTableSize(editor)).toEqual([3, 2])

        expect(editor.commands.addColumnBefore()).toBe(true)
        expect(editor.commands.addColumnAfter()).toBe(true)
        expect(getTableSize(editor)).toEqual([3, 4])
        expect(editor.commands.deleteColumn()).toBe(true)
        expect(getTableSize(editor)).toEqual([3, 3])

        editor.destroy()
    })

    it('toggles the first column as the title column and deletes the table', () => {
        const editor = createTableEditor()

        expect(isTableHeaderColumnActive(editor)).toBe(false)
        expect(editor.commands.toggleHeaderColumn()).toBe(true)
        expect(isTableHeaderColumnActive(editor)).toBe(true)
        expect(editor.commands.toggleHeaderColumn()).toBe(true)
        expect(isTableHeaderColumnActive(editor)).toBe(false)

        expect(editor.commands.deleteTable()).toBe(true)
        expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(false)

        editor.destroy()
    })

    it('deletes an empty table when Backspace is pressed inside it', () => {
        const editor = createTableEditor()

        expect(isActiveTableEmpty(editor)).toBe(true)
        expect(editor.commands.deleteTable()).toBe(true)
        expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(false)

        editor.destroy()
    })

    it('keeps a table containing text when Backspace is pressed', () => {
        const editor = createTableEditor('cell value')

        expect(isActiveTableEmpty(editor)).toBe(false)
        expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(true)

        editor.destroy()
    })

    it('round-trips an image as a top-level document block', () => {
        const manager = createMarkdownManager()
        const markdown = '![교도소 전경](images/prison.png)'

        const parsed = manager.parse(markdown)

        expect(parsed.content?.[0]).toMatchObject({
            type: 'image',
            attrs: {
                src: 'images/prison.png',
                alt: '교도소 전경'
            }
        })
        expect(manager.serialize(parsed)).toContain(markdown)
    })
})
