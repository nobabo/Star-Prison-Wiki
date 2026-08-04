import { describe, expect, it } from 'vitest'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import { buildUniqueSlug, moveCategory, movePageInCategories, movePageInRootOrder, slugify } from './navigation-utils'
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

describe('navigation utilities', () => {
    it('normalizes and de-duplicates slugs', () => {
        expect(slugify(' Hello, Wiki! ')).toBe('hello-wiki')
        expect(buildUniqueSlug('Hello Wiki', ['hello-wiki', 'hello-wiki-2'])).toBe('hello-wiki-3')
    })

    it('moves categories and pages while preserving a single assignment', () => {
        const categories: SidebarCategory[] = [
            { id: 'a', title: 'A', icon: '', collapsed: false, pageSlugs: ['one'] },
            { id: 'b', title: 'B', icon: '', collapsed: false, pageSlugs: ['two'] }
        ]
        expect(moveCategory(categories, 'a', 'b', 'after').map((category) => category.id)).toEqual(['b', 'a'])

        const moved = movePageInCategories(categories, 'one', { type: 'page-container', categoryId: 'b' })
        expect(moved[0]?.pageSlugs).toEqual([])
        expect(moved[1]?.pageSlugs).toEqual(['two', 'one'])
        expect(
            movePageInRootOrder(['three'], [page('one'), page('two'), page('three')], moved, 'one', {
                type: 'page-container',
                categoryId: null
            })
        ).toEqual(['three', 'one'])
    })
})
