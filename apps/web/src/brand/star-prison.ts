import type { WikiBrandConfig } from '@coconut-studio/wiki-web'

export const starPrisonBrand: WikiBrandConfig = {
    productName: '별도소 공식 위키',
    brandLabel: '별도소',
    logoUrl: '/logo.png',
    logoAlt: '별도소 로고',
    defaultSlug: 'welcome',
    apiBasePath: import.meta.env.VITE_WIKI_API_BASE_PATH ?? '/api/wiki',
    collaborationUrl(pageId) {
        const explicitBase = import.meta.env.VITE_WIKI_SYNC_URL?.replace(/\/$/, '')
        if (explicitBase) return `${explicitBase}/collab/wiki/${encodeURIComponent(pageId)}`
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const port = import.meta.env.VITE_WIKI_SYNC_PORT ?? '2234'
        return `${protocol}://${window.location.hostname}:${port}/collab/wiki/${encodeURIComponent(pageId)}`
    }
}
