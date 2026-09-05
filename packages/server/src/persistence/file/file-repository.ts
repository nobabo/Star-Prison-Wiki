import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type {
    PagePermission,
    WikiPageDetailDto,
    WikiPageDto,
    WikiNavigationPreferencesDto,
    WikiSavepointDto,
    WikiSnapshotDto,
    WikiVisibility
} from '@coconut-studio/wiki-contracts'
import { renderMarkdownToHtml } from '@coconut-studio/wiki-markdown'
import { replaceMarkdownYState } from '../../modules/collaboration/markdown-y-state'

import { strongestPermission } from '../../modules/pages/page-policy'
import { normalizePageIcon } from '../../shared/page-normalization'
import type {
    AdminAccountRepository,
    CollaborationStateRepository,
    CreatePageInput,
    NavigationPreferencesRepository,
    PageRepository,
    PermissionRepository,
    UpdatePageAddressInput,
    UpdatePageMetaInput,
    WikiRepositories
} from '../repository'

type StoredPermission = {
    pageId: string
    subjectType: 'user' | 'role'
    subjectId: string
    access: PagePermission
}

type DevStore = {
    version: 1
    adminEmails: string[]
    pages: WikiPageDto[]
    snapshots: WikiSnapshotDto[]
    revisions: WikiSnapshotDto[]
    permissions: StoredPermission[]
    navigationPreferences: StoredNavigationPreferences[]
    yStates: Array<{
        documentName: string
        pageId: string
        stateBase64: string
        storedAt: string
    }>
}

type StoredNavigationPreferences = {
    userId: string
    preferences: WikiNavigationPreferencesDto
    revision: number
    updatedAt: string
}

export type FileRepositoryOptions = {
    filePath: string
    seed: {
        id: string
        slug: string
        title: string
        icon: string | null
        visibility: WikiVisibility
        actorId: string
        markdown: string
        adminEmails?: string[]
    }
}

export class FileWikiRepository
    implements
        PageRepository,
        PermissionRepository,
        AdminAccountRepository,
        CollaborationStateRepository,
        NavigationPreferencesRepository
{
    private storePromise: Promise<DevStore> | null = null
    private mutationQueue: Promise<void> = Promise.resolve()

    constructor(private readonly options: FileRepositoryOptions) {}

    async listPages(): Promise<WikiPageDto[]> {
        const store = await this.readStableStore()
        return store.pages
            .filter((page) => !page.deletedAt)
            .map((page) => ({ ...page }))
            .sort((left, right) => left.title.localeCompare(right.title))
    }

    async listPageDetails(): Promise<WikiPageDetailDto[]> {
        const store = await this.readStableStore()
        return store.pages
            .filter((page) => !page.deletedAt)
            .map((page) => withSnapshot(page, store))
            .sort((left, right) => left.title.localeCompare(right.title))
    }
    async searchPages(input: import('../../shared/page-search').PageSearchInput) {
        const readable = []
        for (const page of await this.listPageDetails()) {
            const permission = input.userId
                ? await this.resolvePagePermission({ pageId: page.id, userId: input.userId, roles: input.roles })
                : 'none'
            if (page.visibility === 'public' || permission !== 'none') readable.push(page)
        }
        const { searchPageDetails } = await import('../../shared/page-search')
        return searchPageDetails(readable, input)
    }

    async getPageById(pageId: string): Promise<WikiPageDetailDto | null> {
        const store = await this.readStableStore()
        const page = store.pages.find((entry) => entry.id === pageId && !entry.deletedAt)
        return page ? withSnapshot(page, store) : null
    }

    async getPageBySlug(slug: string): Promise<WikiPageDetailDto | null> {
        const store = await this.readStableStore()
        const page = store.pages.find((entry) => entry.slug === slug && !entry.deletedAt)
        return page ? withSnapshot(page, store) : null
    }

    createPage(input: CreatePageInput): Promise<WikiPageDetailDto> {
        return this.mutate(async (store) => {
            assertSlugAvailable(store, input.slug)
            const timestamp = new Date().toISOString()
            const page: WikiPageDto = {
                id: randomUUID(),
                slug: input.slug,
                title: input.title,
                icon: normalizePageIcon(input.icon),
                visibility: input.visibility,
                createdBy: input.actorId,
                createdAt: timestamp,
                updatedAt: timestamp,
                deletedAt: null,
                deletedBy: null
            }
            const snapshot = await buildSnapshot(page.id, input.markdown, input.actorId, timestamp)
            store.pages.push(page)
            store.snapshots.push(snapshot)
            store.revisions.push({ ...snapshot })
            return withSnapshot(page, store)
        })
    }

    updatePageMeta(input: UpdatePageMetaInput): Promise<WikiPageDetailDto | null> {
        return this.mutate(async (store) => {
            const page = store.pages.find((entry) => entry.id === input.pageId && !entry.deletedAt)
            if (!page) return null
            if (input.title !== undefined) page.title = input.title
            if (input.icon !== undefined) page.icon = normalizePageIcon(input.icon)
            if (input.visibility !== undefined) page.visibility = input.visibility
            page.updatedAt = new Date().toISOString()
            return withSnapshot(page, store)
        })
    }

    updatePageAddress(input: UpdatePageAddressInput): Promise<WikiPageDetailDto | null> {
        return this.mutate(async (store) => {
            const page = store.pages.find((entry) => entry.id === input.pageId && !entry.deletedAt)
            if (!page) return null
            assertSlugAvailable(store, input.slug, input.pageId)
            page.slug = input.slug
            page.updatedAt = new Date().toISOString()
            return withSnapshot(page, store)
        })
    }

    saveMarkdownSnapshot(input: {
        pageId: string
        markdown: string
        actorId: string
        expectedUpdatedAt: string
    }): Promise<WikiSnapshotDto> {
        return this.mutate(async (store) => {
            const page = store.pages.find((entry) => entry.id === input.pageId && !entry.deletedAt)
            if (!page) throw new Error('page_not_found')

            const currentSnapshot = store.snapshots.find((entry) => entry.pageId === input.pageId)
            if (currentSnapshot?.updatedAt !== input.expectedUpdatedAt) {
                throw new Error('snapshot_conflict')
            }

            const timestamp = nextTimestamp(currentSnapshot?.updatedAt)
            const snapshot = await buildSnapshot(input.pageId, input.markdown, input.actorId, timestamp)
            const snapshotIndex = store.snapshots.findIndex((entry) => entry.pageId === input.pageId)
            if (snapshotIndex === -1) store.snapshots.push(snapshot)
            else store.snapshots[snapshotIndex] = snapshot
            page.updatedAt = timestamp
            return { ...snapshot }
        })
    }

    async listSavepoints(pageId: string, limit: number): Promise<WikiSavepointDto[]> {
        const store = await this.readStableStore()
        return store.revisions
            .filter((revision) => revision.pageId === pageId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .slice(0, limit)
            .map(toSavepoint)
    }

    createSavepoint(input: { pageId: string; actorId: string }): Promise<WikiSavepointDto | null> {
        return this.mutate(async (store) => {
            const page = store.pages.find((entry) => entry.id === input.pageId && !entry.deletedAt)
            const snapshot = store.snapshots.find((entry) => entry.pageId === input.pageId)
            if (!page || !snapshot) throw new Error('page_not_found')
            const latest = latestRevision(store, input.pageId)
            if (latest?.markdown === snapshot.markdown) return null

            const revision: WikiSnapshotDto = {
                ...snapshot,
                updatedBy: input.actorId,
                updatedAt: nextTimestamp(latest?.updatedAt ?? snapshot.updatedAt)
            }
            store.revisions.push(revision)
            return toSavepoint(revision)
        })
    }

    restoreSavepoint(input: {
        pageId: string
        savepointId: string
        actorId: string
        expectedUpdatedAt: string
    }): Promise<WikiSnapshotDto | null> {
        return this.mutate(async (store) => {
            const page = store.pages.find((entry) => entry.id === input.pageId && !entry.deletedAt)
            if (!page) throw new Error('page_not_found')
            const snapshotIndex = store.snapshots.findIndex((entry) => entry.pageId === input.pageId)
            const current = store.snapshots[snapshotIndex]
            if (!current || current.updatedAt !== input.expectedUpdatedAt) throw new Error('snapshot_conflict')
            const target = store.revisions.find(
                (revision) => revision.pageId === input.pageId && revision.updatedAt === input.savepointId
            )
            if (!target) return null

            const latest = latestRevision(store, input.pageId)
            let previousTimestamp =
                latest && latest.updatedAt > current.updatedAt ? latest.updatedAt : current.updatedAt
            if (latest?.markdown !== current.markdown) {
                const backup = {
                    ...current,
                    updatedBy: input.actorId,
                    updatedAt: nextTimestamp(latest?.updatedAt ?? current.updatedAt)
                }
                store.revisions.push(backup)
                previousTimestamp = backup.updatedAt
            }

            const restored = await buildSnapshot(
                input.pageId,
                target.markdown,
                input.actorId,
                nextTimestamp(previousTimestamp)
            )
            const documentName = `wiki:${input.pageId}`
            const previousState = store.yStates.find((entry) => entry.documentName === documentName)
            const state = await replaceMarkdownYState(
                previousState ? Buffer.from(previousState.stateBase64, 'base64') : null,
                target.markdown
            )
            store.yStates = store.yStates.filter((entry) => entry.documentName !== documentName)
            store.yStates.push({
                documentName,
                pageId: input.pageId,
                stateBase64: Buffer.from(state).toString('base64'),
                storedAt: restored.updatedAt
            })
            store.snapshots[snapshotIndex] = restored
            page.updatedAt = restored.updatedAt
            return { ...restored }
        })
    }

    async getNavigationPreferences(userId: string) {
        const store = await this.readStableStore()
        const entry = store.navigationPreferences.find((preference) => preference.userId === userId)
        return entry ? { preferences: cloneNavigationPreferences(entry.preferences), version: entry.revision } : null
    }

    saveNavigationPreferences(input: {
        userId: string
        preferences: WikiNavigationPreferencesDto
        expectedVersion: number | null
    }) {
        return this.mutate(async (store) => {
            const current = store.navigationPreferences.find((preference) => preference.userId === input.userId)
            if ((current?.revision ?? null) !== input.expectedVersion) throw new Error('preferences_conflict')
            const entry = {
                userId: input.userId,
                preferences: cloneNavigationPreferences(input.preferences),
                revision: (current?.revision ?? 0) + 1,
                updatedAt: nextTimestamp(current?.updatedAt)
            }
            const index = store.navigationPreferences.findIndex((preference) => preference.userId === input.userId)
            if (index === -1) store.navigationPreferences.push(entry)
            else store.navigationPreferences[index] = entry
            return { preferences: cloneNavigationPreferences(entry.preferences), version: entry.revision }
        })
    }

    async listAdminEmails(): Promise<string[]> {
        const store = await this.readStableStore()
        return [...store.adminEmails]
    }

    async isAdminEmail(email: string): Promise<boolean> {
        const normalizedEmail = normalizeAdminEmail(email)
        if (!normalizedEmail) return false
        const store = await this.readStableStore()
        return store.adminEmails.includes(normalizedEmail)
    }

    addAdminEmail(email: string): Promise<void> {
        return this.mutate(async (store) => {
            const normalizedEmail = requireAdminEmail(email)
            if (!store.adminEmails.includes(normalizedEmail)) {
                store.adminEmails = [...store.adminEmails, normalizedEmail].sort()
            }
        })
    }

    removeAdminEmail(email: string): Promise<boolean> {
        return this.mutate(async (store) => {
            const normalizedEmail = normalizeAdminEmail(email)
            const next = store.adminEmails.filter((entry) => entry !== normalizedEmail)
            const removed = next.length !== store.adminEmails.length
            store.adminEmails = next
            return removed
        })
    }

    async listTrashedPages(): Promise<WikiPageDto[]> {
        const store = await this.readStableStore()
        return store.pages
            .filter((page) => Boolean(page.deletedAt))
            .map((page) => ({ ...page }))
            .sort((left, right) => (right.deletedAt ?? '').localeCompare(left.deletedAt ?? ''))
    }

    trashPage(input: { pageId: string; actorId: string }): Promise<WikiPageDto | null> {
        return this.mutate(async (store) => {
            const page = store.pages.find((entry) => entry.id === input.pageId)
            if (!page || page.deletedAt) return null
            page.deletedAt = new Date().toISOString()
            page.deletedBy = input.actorId
            return { ...page }
        })
    }

    trashPages(input: { pageIds: string[]; actorId: string }): Promise<WikiPageDto[]> {
        return this.mutate(async (store) => {
            const pageIds = new Set(input.pageIds)
            const timestamp = new Date().toISOString()
            const trashed: WikiPageDto[] = []
            for (const page of store.pages) {
                if (!pageIds.has(page.id) || page.deletedAt) continue
                page.deletedAt = timestamp
                page.deletedBy = input.actorId
                trashed.push({ ...page })
            }
            return trashed
        })
    }

    restorePage(pageId: string): Promise<WikiPageDto | null> {
        return this.mutate(async (store) => {
            const page = store.pages.find((entry) => entry.id === pageId)
            if (!page || !page.deletedAt) return null
            assertSlugAvailable(store, page.slug, page.id)
            page.deletedAt = null
            page.deletedBy = null
            page.updatedAt = new Date().toISOString()
            return { ...page }
        })
    }

    purgePage(pageId: string): Promise<boolean> {
        return this.mutate(async (store) => {
            const before = store.pages.length
            store.pages = store.pages.filter((entry) => entry.id !== pageId)
            store.snapshots = store.snapshots.filter((entry) => entry.pageId !== pageId)
            store.revisions = store.revisions.filter((entry) => entry.pageId !== pageId)
            store.permissions = store.permissions.filter((entry) => entry.pageId !== pageId)
            store.yStates = store.yStates.filter((entry) => entry.pageId !== pageId)
            return store.pages.length !== before
        })
    }

    purgePages(pageIds: string[]): Promise<number> {
        return this.mutate(async (store) => {
            const ids = new Set(pageIds)
            const before = store.pages.length
            store.pages = store.pages.filter((entry) => !ids.has(entry.id))
            store.snapshots = store.snapshots.filter((entry) => !ids.has(entry.pageId))
            store.revisions = store.revisions.filter((entry) => !ids.has(entry.pageId))
            store.permissions = store.permissions.filter((entry) => !ids.has(entry.pageId))
            store.yStates = store.yStates.filter((entry) => !ids.has(entry.pageId))
            return before - store.pages.length
        })
    }

    async loadYState(documentName: string): Promise<Uint8Array | null> {
        const store = await this.readStableStore()
        const state = store.yStates.find((entry) => entry.documentName === documentName)
        return state ? Uint8Array.from(Buffer.from(state.stateBase64, 'base64')) : null
    }

    saveYState(documentName: string, pageId: string, state: Uint8Array): Promise<void> {
        return this.mutate(async (store) => {
            const value = {
                documentName,
                pageId,
                stateBase64: Buffer.from(state).toString('base64'),
                storedAt: new Date().toISOString()
            }
            const index = store.yStates.findIndex((entry) => entry.documentName === documentName)
            if (index === -1) store.yStates.push(value)
            else store.yStates[index] = value
        })
    }

    async resolvePagePermission(input: { pageId: string; userId: string; roles: string[] }): Promise<PagePermission> {
        if (input.roles.includes('wiki:admin')) return 'admin'
        if (input.roles.includes('wiki:writer')) return 'write'

        const store = await this.readStableStore()
        return store.permissions
            .filter(
                (entry) =>
                    entry.pageId === input.pageId &&
                    ((entry.subjectType === 'user' && entry.subjectId === input.userId) ||
                        (entry.subjectType === 'role' && input.roles.includes(entry.subjectId)))
            )
            .reduce<PagePermission>((strongest, entry) => strongestPermission(strongest, entry.access), 'none')
    }

    async resolvePagePermissions(input: {
        pageIds: string[]
        userId: string
        roles: string[]
    }): Promise<Map<string, PagePermission>> {
        const globalPermission: PagePermission | null = input.roles.includes('wiki:admin')
            ? 'admin'
            : input.roles.includes('wiki:writer')
              ? 'write'
              : null
        if (globalPermission) {
            return new Map(input.pageIds.map((pageId) => [pageId, globalPermission]))
        }

        const pageIds = new Set(input.pageIds)
        const permissions = new Map<string, PagePermission>()
        const store = await this.readStableStore()
        for (const entry of store.permissions) {
            if (!pageIds.has(entry.pageId)) continue
            const applies =
                (entry.subjectType === 'user' && entry.subjectId === input.userId) ||
                (entry.subjectType === 'role' && input.roles.includes(entry.subjectId))
            if (!applies) continue
            permissions.set(entry.pageId, strongestPermission(permissions.get(entry.pageId) ?? 'none', entry.access))
        }
        return permissions
    }

    async close(): Promise<void> {
        await this.mutationQueue
    }

    private async readStableStore(): Promise<DevStore> {
        await this.mutationQueue
        return this.getStore()
    }

    private getStore(): Promise<DevStore> {
        this.storePromise ??= this.loadStore()
        return this.storePromise
    }

    private mutate<T>(operation: (store: DevStore) => Promise<T>): Promise<T> {
        let resolveResult: (value: T | PromiseLike<T>) => void
        let rejectResult: (reason?: unknown) => void
        const result = new Promise<T>((resolve, reject) => {
            resolveResult = resolve
            rejectResult = reject
        })

        this.mutationQueue = this.mutationQueue
            .then(async () => {
                const store = await this.getStore()
                const nextStore = structuredClone(store)
                const value = await operation(nextStore)
                await this.writeStore(nextStore)
                this.storePromise = Promise.resolve(nextStore)
                resolveResult(value)
            })
            .catch((error: unknown) => {
                rejectResult(error)
            })

        return result
    }

    private async loadStore(): Promise<DevStore> {
        try {
            const parsed = JSON.parse(await readFile(this.options.filePath, 'utf8')) as Partial<DevStore>
            return normalizeStore(parsed, this.options.seed.adminEmails ?? [])
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            const store = await createSeedStore(this.options.seed)
            await this.writeStore(store)
            return store
        }
    }

    private async writeStore(store: DevStore): Promise<void> {
        await mkdir(dirname(this.options.filePath), { recursive: true })
        const temporaryPath = `${this.options.filePath}.${process.pid}.${randomUUID()}.tmp`
        try {
            await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
            await rename(temporaryPath, this.options.filePath)
        } catch (error) {
            await unlink(temporaryPath).catch(() => undefined)
            throw error
        }
    }
}

export function createFileRepositories(options: FileRepositoryOptions): WikiRepositories {
    const repository = new FileWikiRepository(options)
    return {
        pages: repository,
        permissions: repository,
        adminAccounts: repository,
        collaboration: repository,
        navigation: repository,
        mode: 'file-dev',
        close: () => repository.close()
    }
}

function normalizeStore(store: Partial<DevStore>, fallbackAdminEmails: string[]): DevStore {
    return {
        version: 1,
        adminEmails: normalizeAdminEmails(store.adminEmails, fallbackAdminEmails),
        pages: Array.isArray(store.pages)
            ? store.pages.map((page) => ({
                  ...page,
                  deletedAt: page.deletedAt ?? null,
                  deletedBy: page.deletedBy ?? null
              }))
            : [],
        snapshots: Array.isArray(store.snapshots) ? store.snapshots : [],
        revisions: Array.isArray(store.revisions) ? store.revisions : [],
        permissions: Array.isArray(store.permissions) ? store.permissions : [],
        navigationPreferences: Array.isArray(store.navigationPreferences)
            ? store.navigationPreferences.flatMap((entry) => {
                  if (!entry || typeof entry !== 'object' || typeof entry.userId !== 'string') return []
                  return [
                      {
                          userId: entry.userId,
                          preferences: normalizeNavigationPreferences(entry.preferences),
                          revision:
                              typeof entry.revision === 'number' && Number.isSafeInteger(entry.revision)
                                  ? Math.max(1, entry.revision)
                                  : 1,
                          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString()
                      }
                  ]
              })
            : [],
        yStates: Array.isArray(store.yStates) ? store.yStates : []
    }
}

async function createSeedStore(seed: FileRepositoryOptions['seed']): Promise<DevStore> {
    const timestamp = new Date().toISOString()
    const page: WikiPageDto = {
        id: seed.id,
        slug: seed.slug,
        title: seed.title,
        icon: seed.icon,
        visibility: seed.visibility,
        createdBy: seed.actorId,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        deletedBy: null
    }
    const snapshot = await buildSnapshot(page.id, seed.markdown, seed.actorId, timestamp)
    return {
        version: 1,
        adminEmails: normalizeAdminEmails(undefined, seed.adminEmails ?? []),
        pages: [page],
        snapshots: [snapshot],
        revisions: [{ ...snapshot }],
        permissions: [],
        navigationPreferences: [],
        yStates: []
    }
}

function normalizeAdminEmails(value: unknown, fallback: string[]): string[] {
    const source = Array.isArray(value) ? value : fallback
    return [...new Set(source.flatMap((entry) => (typeof entry === 'string' ? [normalizeAdminEmail(entry)] : [])))]
        .filter(Boolean)
        .sort()
}

function normalizeAdminEmail(email: string): string {
    return email.trim().toLowerCase()
}

function requireAdminEmail(email: string): string {
    const normalizedEmail = normalizeAdminEmail(email)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('invalid_admin_email')
    return normalizedEmail
}

async function buildSnapshot(
    pageId: string,
    markdown: string,
    updatedBy: string,
    updatedAt: string
): Promise<WikiSnapshotDto> {
    return { pageId, markdown, renderedHtml: await renderMarkdownToHtml(markdown), updatedBy, updatedAt }
}

function withSnapshot(page: WikiPageDto, store: DevStore): WikiPageDetailDto {
    const snapshot = store.snapshots.find((entry) => entry.pageId === page.id)
    return {
        ...page,
        markdown: snapshot?.markdown ?? '',
        renderedHtml: snapshot?.renderedHtml ?? '',
        updatedBy: snapshot?.updatedBy ?? page.createdBy,
        snapshotUpdatedAt: snapshot?.updatedAt ?? page.updatedAt
    }
}

function assertSlugAvailable(store: DevStore, slug: string, excludingPageId?: string): void {
    if (store.pages.some((page) => page.slug === slug && !page.deletedAt && page.id !== excludingPageId)) {
        throw new Error('slug_conflict')
    }
}

function cloneNavigationPreferences(preferences: WikiNavigationPreferencesDto): WikiNavigationPreferencesDto {
    return {
        categories: preferences.categories.map((category) => ({
            ...category,
            pageSlugs: [...category.pageSlugs]
        })),
        rootPageSlugs: [...preferences.rootPageSlugs],
        favoriteSlugs: [...preferences.favoriteSlugs],
        theme: preferences.theme
    }
}

function normalizeNavigationPreferences(value: unknown): WikiNavigationPreferencesDto {
    if (!value || typeof value !== 'object') return defaultNavigationPreferences()
    const record = value as Record<string, unknown>
    const categories = Array.isArray(record.categories)
        ? record.categories.flatMap((entry): WikiNavigationPreferencesDto['categories'] => {
              if (!entry || typeof entry !== 'object') return []
              const category = entry as Record<string, unknown>
              if (
                  typeof category.id !== 'string' ||
                  typeof category.title !== 'string' ||
                  typeof category.icon !== 'string'
              ) {
                  return []
              }
              return [
                  {
                      id: category.id,
                      title: category.title,
                      icon: category.icon,
                      ...(typeof category.documentSlug === 'string' ? { documentSlug: category.documentSlug } : {}),
                      pageSlugs: Array.isArray(category.pageSlugs)
                          ? category.pageSlugs.filter((slug): slug is string => typeof slug === 'string')
                          : [],
                      collapsed: category.collapsed === true
                  }
              ]
          })
        : []
    return {
        categories,
        rootPageSlugs: asStringArray(record.rootPageSlugs),
        favoriteSlugs: asStringArray(record.favoriteSlugs),
        theme: record.theme === 'light' ? 'light' : 'dark'
    }
}

function defaultNavigationPreferences(): WikiNavigationPreferencesDto {
    return { categories: [], rootPageSlugs: [], favoriteSlugs: [], theme: 'dark' }
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function nextTimestamp(previous?: string): string {
    const previousTime = previous ? Date.parse(previous) : Number.NaN
    return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString()
}

function latestRevision(store: DevStore, pageId: string): WikiSnapshotDto | undefined {
    return store.revisions
        .filter((revision) => revision.pageId === pageId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function toSavepoint(revision: WikiSnapshotDto): WikiSavepointDto {
    return {
        id: revision.updatedAt,
        pageId: revision.pageId,
        createdBy: revision.updatedBy,
        createdAt: revision.updatedAt,
        markdown: revision.markdown
    }
}
