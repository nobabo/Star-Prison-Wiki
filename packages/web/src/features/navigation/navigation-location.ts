export type WikiLocation =
    { type: 'page'; slug: string; categoryId?: string | null } | { type: 'category'; categoryId: string }

export function readWikiLocation(defaultSlug: string, pathname = window.location.pathname): WikiLocation {
    const categorizedPageMatch = /^\/wiki\/category\/([^/]+)\/([^/]+)$/.exec(pathname)
    if (categorizedPageMatch?.[1] && categorizedPageMatch[2]) {
        return {
            type: 'page',
            categoryId: decodeURIComponent(categorizedPageMatch[1]),
            slug: decodeURIComponent(categorizedPageMatch[2])
        }
    }

    const categoryMatch = /^\/wiki\/category\/([^/]+)$/.exec(pathname)
    if (categoryMatch?.[1]) {
        return { type: 'category', categoryId: decodeURIComponent(categoryMatch[1]) }
    }

    const pageMatch = /^\/wiki\/([^/]+)$/.exec(pathname)
    return {
        type: 'page',
        slug: pageMatch?.[1] ? decodeURIComponent(pageMatch[1]) : defaultSlug
    }
}

export function pageHref(slug: string, categoryId?: string | null): string {
    return categoryId
        ? `/wiki/category/${encodeURIComponent(categoryId)}/${encodeURIComponent(slug)}`
        : `/wiki/${encodeURIComponent(slug)}`
}

export function categoryHref(categoryId: string): string {
    return `/wiki/category/${encodeURIComponent(categoryId)}`
}

export function pushWikiLocation(location: WikiLocation): void {
    window.history.pushState(
        null,
        '',
        location.type === 'page' ? pageHref(location.slug, location.categoryId) : categoryHref(location.categoryId)
    )
}

export function replaceWikiLocation(location: WikiLocation): void {
    window.history.replaceState(
        null,
        '',
        location.type === 'page' ? pageHref(location.slug, location.categoryId) : categoryHref(location.categoryId)
    )
}
