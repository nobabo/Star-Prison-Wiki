export type WikiTheme = 'dark' | 'light'

export type WikiNavigationCategoryDto = {
    id: string
    title: string
    icon: string
    documentSlug?: string
    pageSlugs: string[]
    collapsed: boolean
}

export type WikiNavigationPreferencesDto = {
    categories: WikiNavigationCategoryDto[]
    rootPageSlugs: string[]
    favoriteSlugs: string[]
    theme: WikiTheme
}

export type WikiNavigationPreferencesResponse = {
    preferences: WikiNavigationPreferencesDto
    initialized: boolean
    version: number | null
}

export type SaveWikiNavigationPreferencesRequest = {
    preferences: WikiNavigationPreferencesDto
    baseVersion: number | null
}
