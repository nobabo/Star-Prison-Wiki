import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import {
    moveCategory,
    movePageInCategories,
    movePageInRootOrder,
    orderPagesBySlugs,
    uniqueSlugs
} from './navigation-utils'
import type { NavigationPreferences } from './navigation-preferences'
import type { SidebarCategory, SidebarDropTarget } from './types'

export type NavigationState = NavigationPreferences

export type NavigationAction =
    | { type: 'reconcile'; pages: WikiPageDto[] }
    | { type: 'hydrate'; preferences: NavigationPreferences }
    | { type: 'set-theme'; theme: NavigationPreferences['theme'] }
    | { type: 'add-category'; category: SidebarCategory }
    | { type: 'rename-category'; categoryId: string; title: string }
    | { type: 'set-category-icon'; categoryId: string; icon: string }
    | { type: 'set-category-document'; categoryId: string; documentSlug: string }
    | { type: 'toggle-category'; categoryId: string }
    | { type: 'remove-category'; categoryId: string }
    | { type: 'toggle-favorite'; slug: string }
    | { type: 'assign-page'; slug: string; categoryId: string | null }
    | { type: 'move-category'; categoryId: string; targetId: string; edge: 'before' | 'after' }
    | {
          type: 'move-page'
          slug: string
          target: Extract<SidebarDropTarget, { type: 'page' | 'page-container' }>
          pages: WikiPageDto[]
      }

export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
    switch (action.type) {
        case 'hydrate':
            return {
                categories: action.preferences.categories.map((category) => ({
                    ...category,
                    pageSlugs: [...category.pageSlugs]
                })),
                rootPageSlugs: [...action.preferences.rootPageSlugs],
                favoriteSlugs: [...action.preferences.favoriteSlugs],
                theme: action.preferences.theme
            }
        case 'set-theme':
            return { ...state, theme: action.theme }
        case 'reconcile': {
            const liveSlugs = new Set(action.pages.map((page) => page.slug))
            const pageBySlug = new Map(action.pages.map((page) => [page.slug, page]))
            const categories = state.categories.map((category) => {
                const documentPage = category.documentSlug ? pageBySlug.get(category.documentSlug) : undefined
                return {
                    ...category,
                    title: documentPage?.title ?? category.title,
                    icon: documentPage?.icon ?? category.icon,
                    pageSlugs: category.pageSlugs.filter((slug) => liveSlugs.has(slug))
                }
            })
            const assigned = new Set(
                categories.flatMap((category) => {
                    const documentSlug = category.documentSlug
                    return documentSlug ? [...category.pageSlugs, documentSlug] : category.pageSlugs
                })
            )
            const rootPages = action.pages.filter((page) => !assigned.has(page.slug))
            const rootPageSlugs = orderPagesBySlugs(rootPages, state.rootPageSlugs).map((page) => page.slug)

            return {
                categories,
                rootPageSlugs,
                favoriteSlugs: state.favoriteSlugs.filter((slug) => liveSlugs.has(slug)),
                theme: state.theme
            }
        }
        case 'add-category':
            return {
                ...state,
                categories: [...state.categories, action.category],
                rootPageSlugs: state.rootPageSlugs.filter((slug) => slug !== action.category.documentSlug)
            }
        case 'rename-category':
            return {
                ...state,
                categories: state.categories.map((category) =>
                    category.id === action.categoryId ? { ...category, title: action.title } : category
                )
            }
        case 'set-category-icon':
            return {
                ...state,
                categories: state.categories.map((category) =>
                    category.id === action.categoryId ? { ...category, icon: action.icon } : category
                )
            }
        case 'set-category-document':
            return {
                ...state,
                categories: state.categories.map((category) =>
                    category.id === action.categoryId ? { ...category, documentSlug: action.documentSlug } : category
                ),
                rootPageSlugs: state.rootPageSlugs.filter((slug) => slug !== action.documentSlug)
            }
        case 'toggle-category':
            return {
                ...state,
                categories: state.categories.map((category) =>
                    category.id === action.categoryId ? { ...category, collapsed: !category.collapsed } : category
                )
            }
        case 'remove-category': {
            const removed = state.categories.find((category) => category.id === action.categoryId)
            return {
                ...state,
                categories: state.categories.filter((category) => category.id !== action.categoryId),
                rootPageSlugs: uniqueSlugs([...state.rootPageSlugs, ...(removed?.pageSlugs ?? [])])
            }
        }
        case 'toggle-favorite': {
            const favorites = new Set(state.favoriteSlugs)
            if (favorites.has(action.slug)) favorites.delete(action.slug)
            else favorites.add(action.slug)
            return { ...state, favoriteSlugs: [...favorites] }
        }
        case 'assign-page': {
            const categories = state.categories.map((category) => {
                const pageSlugs = category.pageSlugs.filter((slug) => slug !== action.slug)
                return category.id === action.categoryId
                    ? { ...category, collapsed: false, pageSlugs: [...pageSlugs, action.slug] }
                    : { ...category, pageSlugs }
            })
            return {
                ...state,
                categories,
                rootPageSlugs:
                    action.categoryId === null
                        ? uniqueSlugs([...state.rootPageSlugs, action.slug])
                        : state.rootPageSlugs.filter((slug) => slug !== action.slug)
            }
        }
        case 'move-category':
            return {
                ...state,
                categories: moveCategory(state.categories, action.categoryId, action.targetId, action.edge)
            }
        case 'move-page': {
            const categories = movePageInCategories(state.categories, action.slug, action.target)
            return {
                ...state,
                categories,
                rootPageSlugs: movePageInRootOrder(
                    state.rootPageSlugs,
                    action.pages,
                    categories,
                    action.slug,
                    action.target
                )
            }
        }
    }
}
