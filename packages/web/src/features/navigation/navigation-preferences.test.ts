import { describe, expect, it } from 'vitest'

import {
    CATEGORY_STORAGE_KEY,
    FAVORITE_STORAGE_KEY,
    LocalNavigationPreferencesStore,
    ROOT_PAGE_ORDER_STORAGE_KEY
} from './navigation-preferences'

describe('LocalNavigationPreferencesStore', () => {
    it('keeps legacy keys and recovers from corrupt localStorage values', () => {
        const storage = new MemoryStorage()
        storage.setItem(CATEGORY_STORAGE_KEY, '{broken')
        storage.setItem(ROOT_PAGE_ORDER_STORAGE_KEY, JSON.stringify(['welcome', 'welcome', 3]))
        storage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(['welcome']))

        const store = new LocalNavigationPreferencesStore(storage)
        expect(store.load()).toEqual({
            categories: [],
            rootPageSlugs: ['welcome'],
            favoriteSlugs: ['welcome'],
            theme: 'dark'
        })

        store.saveCategories([{ id: 'guide', title: '안내', icon: '📘', collapsed: false, pageSlugs: ['welcome'] }])
        expect(JSON.parse(storage.getItem(CATEGORY_STORAGE_KEY) ?? '[]')).toHaveLength(1)
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
