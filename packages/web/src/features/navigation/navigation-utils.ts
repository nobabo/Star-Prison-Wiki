import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import type { SidebarCategory, SidebarDropTarget } from './types'

export function readSlugFromLocation(defaultSlug: string): string {
    const match = /^\/wiki\/([^/]+)$/.exec(window.location.pathname)
    return match?.[1] ? decodeURIComponent(match[1]) : defaultSlug
}

export function replaceWikiUrl(slug: string): void {
    window.history.replaceState(null, '', `/wiki/${encodeURIComponent(slug)}`)
}

export function buildUniqueSlug(seed: string, takenSlugs: string[]): string {
    const base = slugify(seed)
    const taken = new Set(takenSlugs)
    if (!taken.has(base)) return base
    let index = 2
    while (taken.has(`${base}-${index}`)) index += 1
    return `${base}-${index}`
}

export function slugify(value: string): string {
    const slug = value
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return slug || `page-${Date.now().toString(36)}`
}

export function createCategoryId(): string {
    return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function moveCategory(
    categories: SidebarCategory[],
    sourceCategoryId: string,
    targetCategoryId: string,
    edge: 'before' | 'after'
): SidebarCategory[] {
    if (sourceCategoryId === targetCategoryId) return categories
    const sourceIndex = categories.findIndex((category) => category.id === sourceCategoryId)
    const targetIndex = categories.findIndex((category) => category.id === targetCategoryId)
    if (sourceIndex === -1 || targetIndex === -1) return categories
    const next = [...categories]
    const [source] = next.splice(sourceIndex, 1)
    if (!source) return categories
    const destination = next.findIndex((category) => category.id === targetCategoryId)
    next.splice(destination + (edge === 'after' ? 1 : 0), 0, source)
    return next
}

export function movePageInCategories(
    categories: SidebarCategory[],
    sourceSlug: string,
    target: Extract<SidebarDropTarget, { type: 'page' | 'page-container' }>
): SidebarCategory[] {
    return categories.map((category) => {
        const withoutSource = category.pageSlugs.filter((slug) => slug !== sourceSlug)
        if (category.id !== target.categoryId) {
            return withoutSource.length === category.pageSlugs.length
                ? category
                : { ...category, pageSlugs: withoutSource }
        }
        return { ...category, pageSlugs: insertPageSlug(withoutSource, sourceSlug, target), collapsed: false }
    })
}

export function movePageInRootOrder(
    rootPageSlugs: string[],
    pages: WikiPageDto[],
    categories: SidebarCategory[],
    sourceSlug: string,
    target: Extract<SidebarDropTarget, { type: 'page' | 'page-container' }>
): string[] {
    const assigned = new Set(categories.flatMap((category) => category.pageSlugs))
    const visible = orderPagesBySlugs(
        pages.filter((page) => !assigned.has(page.slug)),
        rootPageSlugs
    ).map((page) => page.slug)
    const withoutSource = uniqueSlugs([...visible, ...rootPageSlugs].filter((slug) => slug !== sourceSlug))
    return target.categoryId === null ? insertPageSlug(withoutSource, sourceSlug, target) : withoutSource
}

export function orderPagesBySlugs(pages: WikiPageDto[], orderedSlugs: string[]): WikiPageDto[] {
    const bySlug = new Map(pages.map((page) => [page.slug, page]))
    const ordered = orderedSlugs.map((slug) => bySlug.get(slug)).filter((page): page is WikiPageDto => Boolean(page))
    const used = new Set(ordered.map((page) => page.slug))
    return [...ordered, ...pages.filter((page) => !used.has(page.slug))]
}

export function uniqueSlugs(slugs: string[]): string[] {
    return Array.from(new Set(slugs))
}

function insertPageSlug(
    slugs: string[],
    sourceSlug: string,
    target: Extract<SidebarDropTarget, { type: 'page' | 'page-container' }>
): string[] {
    if (target.type === 'page-container') return uniqueSlugs([...slugs, sourceSlug])
    const targetIndex = slugs.indexOf(target.slug)
    if (targetIndex === -1) return uniqueSlugs([...slugs, sourceSlug])
    const next = [...slugs]
    next.splice(targetIndex + (target.edge === 'after' ? 1 : 0), 0, sourceSlug)
    return uniqueSlugs(next)
}
