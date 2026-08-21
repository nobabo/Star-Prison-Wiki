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

    it('immediately places a newly created page in its target category', () => {
        const state: NavigationState = {
            categories: [
                { id: 'a', title: 'A', icon: '', collapsed: false, pageSlugs: [] },
                { id: 'b', title: 'B', icon: '', collapsed: false, pageSlugs: [] }
            ],
            rootPageSlugs: ['new-page'],
            favoriteSlugs: [],
            theme: 'dark'
        }

        const moved = navigationReducer(state, {
            type: 'move-page',
            slug: 'new-page',
            target: { type: 'page-container', categoryId: 'b' },
            pages: [page('new-page')]
        })

        expect(moved.categories[1]?.pageSlugs).toEqual(['new-page'])
        expect(moved.rootPageSlugs).toEqual([])
    })

    it('immediately reorders a newly created category', () => {
        const state: NavigationState = {
            categories: [
                { id: 'a', title: 'A', icon: '', collapsed: false, pageSlugs: [] },
                { id: 'new', title: 'New', icon: '', collapsed: false, pageSlugs: [] },
                { id: 'b', title: 'B', icon: '', collapsed: false, pageSlugs: [] }
            ],
            rootPageSlugs: [],
            favoriteSlugs: [],
            theme: 'dark'
        }

        const moved = navigationReducer(state, {
            type: 'move-category',
            categoryId: 'new',
            targetId: 'a',
            edge: 'before'
        })

        expect(moved.categories.map((category) => category.id)).toEqual(['new', 'a', 'b'])
    })

    it('replaces every persisted navigation reference when a page address changes', () => {
        const state: NavigationState = {
            categories: [
                {
                    id: 'guides',
                    title: '안내',
                    icon: '📚',
                    documentSlug: 'old-address',
                    collapsed: false,
                    pageSlugs: ['old-address', 'other-page']
                }
            ],
            rootPageSlugs: ['old-address'],
            favoriteSlugs: ['old-address'],
            theme: 'dark'
        }

        const renamed = navigationReducer(state, {
            type: 'replace-page-slug',
            previousSlug: 'old-address',
            nextSlug: 'new-address'
        })

        expect(renamed.categories[0]).toMatchObject({
            documentSlug: 'new-address',
            pageSlugs: ['new-address', 'other-page']
        })
        expect(renamed.rootPageSlugs).toEqual(['new-address'])
        expect(renamed.favoriteSlugs).toEqual(['new-address'])
    })

    it('atomically applies a category document address and metadata update', () => {
        const state: NavigationState = {
            categories: [
                {
                    id: 'guides',
                    title: '안내',
                    icon: '📚',
                    documentSlug: 'old-address',
                    collapsed: false,
                    pageSlugs: ['child-page']
                }
            ],
            rootPageSlugs: ['old-address', 'root-page'],
            favoriteSlugs: ['old-address'],
            theme: 'dark'
        }

        const updated = navigationReducer(state, {
            type: 'update-category-document',
            categoryId: 'guides',
            previousSlug: 'old-address',
            nextSlug: 'new-address',
            title: '새 안내',
            icon: '🧭'
        })

        expect(updated.categories[0]).toMatchObject({
            title: '새 안내',
            icon: '🧭',
            documentSlug: 'new-address',
            pageSlugs: ['child-page']
        })
        expect(updated.rootPageSlugs).toEqual(['root-page'])
        expect(updated.favoriteSlugs).toEqual(['new-address'])
    })
})
