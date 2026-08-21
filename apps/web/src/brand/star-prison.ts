import type { WikiBrandConfig } from '@coconut-studio/wiki-web'

export const starPrisonBrand: WikiBrandConfig = {
    productName: '별도소 공식 위키',
    brandLabel: '별도소',
    logoUrl: '/logo.png',
    logoAlt: '별도소 로고',
    defaultSlug: 'welcome',
    apiBasePath: import.meta.env.VITE_WIKI_API_BASE_PATH ?? '/api/wiki',
    collaborationUrl(pageId) {
        return buildStarPrisonCollaborationUrl(
            pageId,
            window.location,
            import.meta.env.VITE_WIKI_SYNC_URL,
            import.meta.env.VITE_WIKI_SYNC_PORT
        )
    }
}

type CollaborationLocation = Pick<Location, 'protocol' | 'host' | 'hostname'>

export function buildStarPrisonCollaborationUrl(
    pageId: string,
    location: CollaborationLocation,
    explicitBase?: string,
    syncPort = '2234'
): string {
    const path = `/collab/wiki/${encodeURIComponent(pageId)}`
    const normalizedBase = explicitBase?.replace(/\/$/, '')

    if (normalizedBase) {
        return `${normalizedBase}${path}`
    }

    if (location.protocol === 'https:') {
        return `wss://${location.host}${path}`
    }

    return `ws://${location.hostname}:${syncPort}${path}`
}
