import { describe, expect, it } from 'vitest'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import { navigationReducer, type NavigationState } from './navigation-reducer'
import type { SidebarCategory } from './types'

const page = (slug: string): WikiPageDto => ({
    id: slug,
    slug,
    title: slug,
    icon: null,
    visibility: 'public',
    createdBy: 'test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    deletedBy: null
})

describe('category documents', () => {
    it('keeps a category backing document out of the root page order', () => {
        const category = {
            id: 'guides',
            title: '안내',
            icon: '📚',
            documentSlug: 'category-guides',
            pageSlugs: [],
            collapsed: false
        } as SidebarCategory
        const state: NavigationState = {
            categories: [category],
            rootPageSlugs: ['category-guides', 'welcome'],
            favoriteSlugs: [],
            theme: 'dark'
        }

        const categoryDocument = { ...page('category-guides'), title: '운영 안내', icon: '🧭' }
        const reconciled = navigationReducer(state, {
            type: 'reconcile',
            pages: [categoryDocument, page('welcome')]
        })

        expect(reconciled.rootPageSlugs).toEqual(['welcome'])
        expect(reconciled.categories[0]).toMatchObject({ title: '운영 안내', icon: '🧭' })
    })
})
