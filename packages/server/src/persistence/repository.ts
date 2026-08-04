import type {
    PagePermission,
    WikiPageDetailDto,
    WikiPageDto,
    WikiNavigationPreferencesDto,
    WikiSavepointDto,
    WikiSnapshotDto,
    WikiVisibility
} from '@coconut-studio/wiki-contracts'

export type CreatePageInput = {
    title: string
    icon?: string | null
    slug: string
    visibility: WikiVisibility
    markdown: string
    actorId: string
}

export type UpdatePageMetaInput = {
    pageId: string
    title: string
    icon?: string | null
    slug: string
    visibility: WikiVisibility
}

export type SaveNavigationPreferencesInput = {
    userId: string
    preferences: WikiNavigationPreferencesDto
    expectedVersion: number | null
}

export type NavigationPreferencesRecord = {
    preferences: WikiNavigationPreferencesDto
    version: number
}

export interface PageRepository {
    listPages(): Promise<WikiPageDto[]>
    getPageById(pageId: string): Promise<WikiPageDetailDto | null>
    getPageBySlug(slug: string): Promise<WikiPageDetailDto | null>
    createPage(input: CreatePageInput): Promise<WikiPageDetailDto>
    updatePageMeta(input: UpdatePageMetaInput): Promise<WikiPageDetailDto | null>
    saveMarkdownSnapshot(input: {
        pageId: string
        markdown: string
        actorId: string
        expectedUpdatedAt: string
    }): Promise<WikiSnapshotDto>
    listSavepoints(pageId: string, limit: number): Promise<WikiSavepointDto[]>
    createSavepoint(input: { pageId: string; actorId: string }): Promise<WikiSavepointDto | null>
    restoreSavepoint(input: {
        pageId: string
        savepointId: string
        actorId: string
        expectedUpdatedAt: string
    }): Promise<WikiSnapshotDto | null>
    listTrashedPages(): Promise<WikiPageDto[]>
    trashPage(input: { pageId: string; actorId: string }): Promise<WikiPageDto | null>
    trashPages(input: { pageIds: string[]; actorId: string }): Promise<WikiPageDto[]>
    restorePage(pageId: string): Promise<WikiPageDto | null>
    purgePage(pageId: string): Promise<boolean>
    purgePages(pageIds: string[]): Promise<number>
}

export interface NavigationPreferencesRepository {
    getNavigationPreferences(userId: string): Promise<NavigationPreferencesRecord | null>
    saveNavigationPreferences(input: SaveNavigationPreferencesInput): Promise<NavigationPreferencesRecord>
}

export interface PermissionRepository {
    resolvePagePermission(input: { pageId: string; userId: string; roles: string[] }): Promise<PagePermission>
    resolvePagePermissions(input: {
        pageIds: string[]
        userId: string
        roles: string[]
    }): Promise<Map<string, PagePermission>>
}

export interface AdminAccountRepository {
    listAdminEmails(): Promise<string[]>
    isAdminEmail(email: string): Promise<boolean>
    addAdminEmail(email: string): Promise<void>
    removeAdminEmail(email: string): Promise<boolean>
}

export interface CollaborationStateRepository {
    loadYState(documentName: string): Promise<Uint8Array | null>
    saveYState(documentName: string, pageId: string, state: Uint8Array): Promise<void>
}

export type WikiRepositories = {
    pages: PageRepository
    permissions: PermissionRepository
    adminAccounts: AdminAccountRepository
    collaboration: CollaborationStateRepository
    navigation: NavigationPreferencesRepository
    mode: 'postgres' | 'file-dev'
    close(): Promise<void>
}
