import { describe, expect, it } from 'vitest'

import { OrderedSnapshotTracker } from './ordered-snapshot-save'

describe('OrderedSnapshotTracker', () => {
    it('ignores an older response that arrives after the newest response', () => {
        const tracker = new OrderedSnapshotTracker()
        const older = tracker.begin()
        const newest = tracker.begin()

        expect(tracker.accept(newest)).toBe(true)
        expect(tracker.accept(older)).toBe(false)
    })
})
