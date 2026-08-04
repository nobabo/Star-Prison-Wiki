import { describe, expect, it } from 'vitest'

import { getDiamondAttachmentOffset } from './use-card-insert-control'

describe('diamond card attachment layout', () => {
    it('attaches the third card to the upper diagonal', () => {
        const diamondHeight = 132

        expect([
            getDiamondAttachmentOffset(0, diamondHeight),
            getDiamondAttachmentOffset(1, diamondHeight),
            getDiamondAttachmentOffset(2, diamondHeight)
        ]).toEqual([0, 66, 0])
    })
})
