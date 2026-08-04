import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearWikiDraft, loadWikiDraft, storeWikiDraft } from './local-draft'

describe('wiki local drafts', () => {
    let storage: MemoryStorage

    beforeEach(() => {
        storage = new MemoryStorage()
        vi.stubGlobal('window', { localStorage: storage })
    })

    afterEach(() => vi.unstubAllGlobals())

    it('restores, conditionally clears, and discards a draft', () => {
        expect(storeWikiDraft('page-1', 'new', 'old')?.markdown).toBe('new')
        expect(loadWikiDraft('page-1')?.baseMarkdown).toBe('old')
        clearWikiDraft('page-1', 'different')
        expect(loadWikiDraft('page-1')).not.toBeNull()
        clearWikiDraft('page-1', 'new')
        expect(loadWikiDraft('page-1')).toBeNull()
    })

    it('rejects corrupt stored data', () => {
        storage.setItem('cs-wiki:draft:v1:page-1', '{broken')
        expect(loadWikiDraft('page-1')).toBeNull()
    })
})

class MemoryStorage implements Storage {
    private values = new Map<string, string>()
    get length() {
        return this.values.size
    }
    clear() {
        this.values.clear()
    }
    getItem(key: string) {
        return this.values.get(key) ?? null
    }
    key(index: number) {
        return [...this.values.keys()][index] ?? null
    }
    removeItem(key: string) {
        this.values.delete(key)
    }
    setItem(key: string, value: string) {
        this.values.set(key, String(value))
    }
}
