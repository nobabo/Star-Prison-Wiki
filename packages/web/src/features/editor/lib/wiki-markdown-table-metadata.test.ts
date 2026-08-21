import type { JSONContent } from '@tiptap/react'
import { describe, expect, it } from 'vitest'

import {
    applyWikiTableMetadata,
    collectWikiTableMetadata,
    extractWikiTableMetadata,
    injectWikiTableMetadata
} from './wiki-markdown'

const tableDoc: JSONContent = {
    type: 'doc',
    content: [
        {
            type: 'table',
            attrs: { headerBackground: '#d9f1df' },
            content: [
                {
                    type: 'tableRow',
                    content: [
                        { type: 'tableHeader', attrs: { colwidth: [180] }, content: [{ type: 'paragraph' }] },
                        { type: 'tableHeader', attrs: { colwidth: [320] }, content: [{ type: 'paragraph' }] }
                    ]
                }
            ]
        }
    ]
}

describe('wiki table markdown metadata', () => {
    it('injects and extracts metadata at the matching table', () => {
        const markdown = '| A | B |\n| --- | --- |\n| 1 | 2 |'
        const serialized = injectWikiTableMetadata(markdown, collectWikiTableMetadata(tableDoc))

        expect(serialized).toContain('headerBackground="#d9f1df" widths="180,320"')
        const extracted = extractWikiTableMetadata(serialized)
        expect(extracted.markdown).toBe(markdown)
        expect(extracted.metadata[0]).toEqual({
            headerBackground: '#d9f1df',
            widths: [180, 320]
        })
    })

    it('restores table and cell attributes', () => {
        const plainDoc: JSONContent = JSON.parse(JSON.stringify(tableDoc))
        plainDoc.content![0]!.attrs = {}
        plainDoc.content![0]!.content![0]!.content!.forEach((cell) => {
            cell.attrs = {}
        })

        const restored = applyWikiTableMetadata(plainDoc, [{ headerBackground: '#d9f1df', widths: [180, 320] }])

        expect(restored.changed).toBe(true)
        expect(restored.doc.content?.[0]?.attrs?.headerBackground).toBe('#d9f1df')
        expect(restored.doc.content?.[0]?.content?.[0]?.content?.[1]?.attrs?.colwidth).toEqual([320])
    })
})
