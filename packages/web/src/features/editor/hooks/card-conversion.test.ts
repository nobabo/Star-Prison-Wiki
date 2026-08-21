import { describe, expect, it } from 'vitest'

import { createCardConversionContent } from './use-card-insert-control'

const blocks = [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '제목' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '내용' }] }
]

describe('card block conversion', () => {
    it('preserves card blocks as table rows', () => {
        const result = createCardConversionContent(blocks, '제목\n내용', 'table')
        expect(result).toMatchObject({
            type: 'table',
            content: [
                { type: 'tableRow', content: [{ type: 'tableHeader', content: [blocks[0]] }] },
                { type: 'tableRow', content: [{ type: 'tableCell', content: [blocks[1]] }] }
            ]
        })
    })

    it('converts card text into code, quote, and paragraph blocks', () => {
        expect(createCardConversionContent(blocks, '제목\n내용', 'code')).toMatchObject({
            type: 'codeBlock',
            content: [{ type: 'text', text: '제목\n내용' }]
        })
        expect(createCardConversionContent(blocks, '제목\n내용', 'quote')).toMatchObject({
            type: 'blockquote',
            content: blocks
        })
        expect(createCardConversionContent(blocks, '제목\n내용', 'paragraph')).toMatchObject({
            type: 'paragraph',
            content: [{ type: 'text', text: '제목\n내용' }]
        })
    })
})
