import { describe, expect, it } from 'vitest'

import {
    getCardDropRowIndex,
    getCardHorizontalDropIndex,
    getCardNodeAncestorDepth,
    getReorderedCardRows,
    getCardRowAttachmentFlags,
    getDiamondAttachmentOffset,
    getDocumentBlockDropIndex,
    getResizedCardHeight,
    isStandaloneCard,
    isVerticalCardDrag
} from './use-card-insert-control'

describe('card drag layout', () => {
    it('keeps the greeting div on its own row so it can move above or below other rows', () => {
        expect(isStandaloneCard('lead')).toBe(true)
        expect(isStandaloneCard('panel')).toBe(false)
        expect(isStandaloneCard(undefined)).toBe(false)
    })

    it('uses vertical dragging to move every card between document rows', () => {
        expect(isVerticalCardDrag(5, -80)).toBe(true)
        expect(isVerticalCardDrag(5, 80)).toBe(true)
        expect(isVerticalCardDrag(80, 5)).toBe(false)
        expect(isVerticalCardDrag(20, 20)).toBe(false)
    })

    it('drops to the left or right of an existing card', () => {
        const cards = [{ left: 100, right: 300 }]

        expect(getCardHorizontalDropIndex(cards, 150)).toBe(0)
        expect(getCardHorizontalDropIndex(cards, 250)).toBe(1)
    })

    it('resolves the outer card node instead of nesting inside its content', () => {
        expect(getCardNodeAncestorDepth(['doc', 'wikiHighlightBlock', 'heading'])).toBe(1)
        expect(getCardNodeAncestorDepth(['doc', 'wikiHighlightBlock', 'paragraph', 'text'])).toBe(1)
        expect(getCardNodeAncestorDepth(['doc', 'paragraph'])).toBe(-1)
    })

    it('adds a moved card to the left or right of a card in another row', () => {
        const rows = [['a', 'b', 'c'], ['d']]

        expect(getReorderedCardRows(rows, 'b', rows[1]!, 0)).toEqual([
            ['a', 'c'],
            ['b', 'd']
        ])
        expect(getReorderedCardRows(rows, 'b', rows[1]!, 1)).toEqual([
            ['a', 'c'],
            ['d', 'b']
        ])
    })

    it('selects a card row from the vertical drop position', () => {
        const rows = [
            { top: 100, bottom: 220 },
            { top: 260, bottom: 380 }
        ]

        expect(getCardDropRowIndex(rows, 170)).toBe(0)
        expect(getCardDropRowIndex(rows, 240)).toBe(0)
        expect(getCardDropRowIndex(rows, 245)).toBe(1)
        expect(getCardDropRowIndex(rows, 300)).toBe(1)
        expect(getCardDropRowIndex(rows, 380)).toBe(1)
        expect(getCardDropRowIndex(rows, 381)).toBe(2)
        expect(getCardDropRowIndex(rows, 500)).toBe(2)
    })
})

describe('quote block drag layout', () => {
    const blocks = [
        { top: 0, bottom: 64 },
        { top: 80, bottom: 144 },
        { top: 160, bottom: 224 }
    ]

    it('moves a quote before or after the nearest top-level block', () => {
        expect(getDocumentBlockDropIndex(blocks, 1, 10)).toBe(0)
        expect(getDocumentBlockDropIndex(blocks, 1, 210)).toBe(2)
        expect(getDocumentBlockDropIndex(blocks, 1, 90)).toBe(1)
    })
})

describe('card height resize', () => {
    it('tracks vertical pointer movement within the supported height range', () => {
        expect(getResizedCardHeight(240, 60)).toBe(300)
        expect(getResizedCardHeight(240, -200)).toBe(132)
        expect(getResizedCardHeight(1100, 200)).toBe(1200)
    })
})

describe('diamond card attachment layout', () => {
    it('attaches the third card to the upper diagonal', () => {
        const diamondHeight = 132

        expect([
            getDiamondAttachmentOffset(0, diamondHeight),
            getDiamondAttachmentOffset(1, diamondHeight),
            getDiamondAttachmentOffset(2, diamondHeight)
        ]).toEqual([0, 66, 0])
    })

    it('uses the same consecutive-diamond attachment pattern in every view mode', () => {
        expect(getCardRowAttachmentFlags(['diamond', 'diamond', 'diamond'])).toEqual([false, true, true])
        expect(getCardRowAttachmentFlags(['diamond', 'diamond', 'rectangle', 'diamond'])).toEqual([
            false,
            true,
            false,
            false
        ])
        expect(getCardRowAttachmentFlags(['diamond', 'diamond', 'diamond'], [false, true, false])).toEqual([
            false,
            true,
            false
        ])
    })
})
