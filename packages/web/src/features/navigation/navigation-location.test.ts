import { describe, expect, it, vi } from 'vitest'

import { categoryHref, pageHref, pushWikiLocation, readWikiLocation, replaceWikiLocation } from './navigation-location'

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
        expect(readWikiLocation('home', '/wiki/category/work/release%20notes')).toEqual({
            type: 'page',
            categoryId: 'work',
            slug: 'release notes'
        })
    })

    it('falls back to the default document and creates encoded links', () => {
        expect(readWikiLocation('home', '/')).toEqual({ type: 'page', slug: 'home' })
        expect(pageHref('한글 문서')).toBe('/wiki/%ED%95%9C%EA%B8%80%20%EB%AC%B8%EC%84%9C')
        expect(pageHref('문서명', 'work')).toBe('/wiki/category/work/%EB%AC%B8%EC%84%9C%EB%AA%85')
        expect(categoryHref('category/a')).toBe('/wiki/category/category%2Fa')
    })

    it('writes a renamed category address to browser history', () => {
        const pushState = vi.fn()
        const replaceState = vi.fn()
        vi.stubGlobal('window', { history: { pushState, replaceState } })

        try {
            pushWikiLocation({ type: 'category', categoryId: 'new address' })
            replaceWikiLocation({ type: 'category', categoryId: 'current-address' })
            replaceWikiLocation({ type: 'page', categoryId: 'work', slug: 'release notes' })

            expect(pushState).toHaveBeenCalledWith(null, '', '/wiki/category/new%20address')
            expect(replaceState).toHaveBeenCalledWith(null, '', '/wiki/category/current-address')
            expect(replaceState).toHaveBeenLastCalledWith(null, '', '/wiki/category/work/release%20notes')
        } finally {
            vi.unstubAllGlobals()
        }
    })
})
