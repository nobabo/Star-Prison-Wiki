import { describe, expect, it } from 'vitest'

import { categoryHref, pageHref, readWikiLocation } from './navigation-location'

describe('wiki locations', () => {
    it('reads document and category locations', () => {
        expect(readWikiLocation('home', '/wiki/getting-started')).toEqual({
            type: 'page',
            slug: 'getting-started'
        })
        expect(readWikiLocation('home', '/wiki/category/category-abc%20123')).toEqual({
            type: 'category',
            categoryId: 'category-abc 123'
        })
    })

    it('falls back to the default document and creates encoded links', () => {
        expect(readWikiLocation('home', '/')).toEqual({ type: 'page', slug: 'home' })
        expect(pageHref('한글 문서')).toBe('/wiki/%ED%95%9C%EA%B8%80%20%EB%AC%B8%EC%84%9C')
        expect(categoryHref('category/a')).toBe('/wiki/category/category%2Fa')
    })
})
