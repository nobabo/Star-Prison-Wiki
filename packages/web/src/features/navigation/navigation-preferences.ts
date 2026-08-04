import type { SidebarCategory } from './types'
import { createCategoryId, uniqueSlugs } from './navigation-utils'

export const TOKEN_STORAGE_KEY = 'coconut-studio-wiki-token'
export const CATEGORY_STORAGE_KEY = 'coconut-studio-wiki-categories'
export const ROOT_PAGE_ORDER_STORAGE_KEY = 'coconut-studio-wiki-root-page-order'
export const FAVORITE_STORAGE_KEY = 'coconut-studio-wiki-favorites'
export const THEME_STORAGE_KEY = 'coconut-wiki-theme'

export type NavigationTheme = 'dark' | 'light'

export type NavigationPreferences = {
    categories: SidebarCategory[]
    rootPageSlugs: string[]
    favoriteSlugs: string[]
    theme: NavigationTheme
}

export interface NavigationPreferencesStore {
    load(): NavigationPreferences
    saveCategories(categories: SidebarCategory[]): void
    saveRootPageOrder(slugs: string[]): void
    saveFavorites(slugs: string[]): void
    saveTheme?(theme: NavigationTheme): void
}

export class LocalNavigationPreferencesStore implements NavigationPreferencesStore {
    constructor(private readonly storage: Storage = window.localStorage) {}

    load(): NavigationPreferences {
        return {
            categories: readCategories(this.storage),
            rootPageSlugs: readSlugs(this.storage, ROOT_PAGE_ORDER_STORAGE_KEY),
            favoriteSlugs: readSlugs(this.storage, FAVORITE_STORAGE_KEY),
            theme: readTheme(this.storage)
        }
    }

    saveCategories(categories: SidebarCategory[]): void {
        this.write(CATEGORY_STORAGE_KEY, categories)
    }

    saveRootPageOrder(slugs: string[]): void {
        this.write(ROOT_PAGE_ORDER_STORAGE_KEY, uniqueSlugs(slugs))
    }

    saveFavorites(slugs: string[]): void {
        this.write(FAVORITE_STORAGE_KEY, uniqueSlugs(slugs))
    }

    saveTheme(theme: NavigationTheme): void {
        try {
            this.storage.setItem(THEME_STORAGE_KEY, theme)
        } catch {
            // Preferences are optional when storage is unavailable.
        }
    }

    private write(key: string, value: unknown): void {
        try {
            this.storage.setItem(key, JSON.stringify(value))
        } catch {
            // Preferences are optional when storage is unavailable.
        }
    }
}

function readTheme(storage: Storage): NavigationTheme {
    try {
        return storage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
    } catch {
        return 'dark'
    }
}

function readSlugs(storage: Storage, key: string): string[] {
    try {
        const value = JSON.parse(storage.getItem(key) ?? '[]') as unknown
        return Array.isArray(value) ? uniqueSlugs(value.filter((slug): slug is string => typeof slug === 'string')) : []
    } catch {
        return []
    }
}

function readCategories(storage: Storage): SidebarCategory[] {
    try {
        const value = JSON.parse(storage.getItem(CATEGORY_STORAGE_KEY) ?? '[]') as unknown
        if (!Array.isArray(value)) return []
        return value.flatMap((entry): SidebarCategory[] => {
            if (!entry || typeof entry !== 'object') return []
            const record = entry as Record<string, unknown>
            const title = typeof record.title === 'string' ? record.title.trim() : ''
            if (!title) return []
            const category = {
                id: typeof record.id === 'string' ? record.id : createCategoryId(),
                title,
                icon: typeof record.icon === 'string' ? record.icon : '',
                ...(typeof record.documentSlug === 'string' ? { documentSlug: record.documentSlug } : {}),
                collapsed: Boolean(record.collapsed),
                pageSlugs: Array.isArray(record.pageSlugs)
                    ? uniqueSlugs(record.pageSlugs.filter((slug): slug is string => typeof slug === 'string'))
                    : []
            }
            return [category]
        })
    } catch {
        return []
    }
}
