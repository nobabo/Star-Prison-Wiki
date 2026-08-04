import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
    WikiAuthStatusDto,
    WikiPageDetailDto,
    WikiPageDto,
    WikiPageResponse
} from '@coconut-studio/wiki-contracts'

import { googleOAuthStartUrl, initializeAuthToken, writeAuthToken } from '../features/auth/auth-session'
import { AuthPanel } from '../features/auth/components/AuthPanel'
import { WikiModeTabs, type WikiMode } from '../features/auth/components/WikiModeTabs'
import { WikiSidebar } from '../features/navigation/components/WikiSidebar'
import { pushWikiLocation, readWikiLocation, replaceWikiLocation } from '../features/navigation/navigation-location'
import {
    LocalNavigationPreferencesStore,
    type NavigationPreferencesStore
} from '../features/navigation/navigation-preferences'
import { buildUniqueSlug } from '../features/navigation/navigation-utils'
import {
    useNavigationPreferences,
    type NavigationPreferencesPersistence
} from '../features/navigation/use-navigation-preferences'
import type { SidebarCategory } from '../features/navigation/types'
import { PageContent, type PageLoadStatus } from '../features/page/components/PageContent'
import { TrashView, type TrashLoadStatus } from '../features/trash/components/TrashView'
import {
    createWikiPage,
    fetchAuthMe,
    fetchNavigationPreferences,
    fetchPageBySlug,
    fetchPages,
    fetchTrashedPages,
    purgeWikiPage,
    purgeWikiPages,
    restoreWikiPage,
    saveNavigationPreferences,
    trashWikiPage,
    trashWikiPages,
    updatePageMeta,
    WikiApiError,
    type ApiClient
} from '../shared/api/wiki-api'
import type { WikiBrandConfig } from './wiki-brand'

export type WikiApplicationProps = {
    brand: WikiBrandConfig
    navigationStore?: NavigationPreferencesStore
}

export function WikiApplication({ brand, navigationStore }: WikiApplicationProps) {
    const store = useMemo(() => navigationStore ?? new LocalNavigationPreferencesStore(), [navigationStore])
    const [token, setToken] = useState(initializeAuthToken)
    const [authStatus, setAuthStatus] = useState<WikiAuthStatusDto | null>(null)
    const [authLoading, setAuthLoading] = useState(true)
    const [authError, setAuthError] = useState(false)
    const [authRetryGeneration, setAuthRetryGeneration] = useState(0)
    const [wikiMode, setWikiMode] = useState<WikiMode>('edit')
    const [initialLocation] = useState(() => readWikiLocation(brand.defaultSlug))
    const [slug, setSlug] = useState(() => (initialLocation.type === 'page' ? initialLocation.slug : brand.defaultSlug))
    const [categoryId, setCategoryId] = useState<string | null>(() =>
        initialLocation.type === 'category' ? initialLocation.categoryId : null
    )
    const [pages, setPages] = useState<WikiPageDto[]>([])
    const [pageResponse, setPageResponse] = useState<WikiPageResponse | null>(null)
    const [status, setStatus] = useState<PageLoadStatus>('loading')
    const [pageIndexError, setPageIndexError] = useState(false)
    const [categoryResponse, setCategoryResponse] = useState<WikiPageResponse | null>(null)
    const [categoryStatus, setCategoryStatus] = useState<PageLoadStatus>('loading')
    const [view, setView] = useState<'page' | 'category' | 'trash'>(() => initialLocation.type)
    const [trashedPages, setTrashedPages] = useState<WikiPageDto[]>([])
    const [trashStatus, setTrashStatus] = useState<TrashLoadStatus>('loading')
    const client = useMemo<ApiClient>(() => ({ token, basePath: brand.apiBasePath }), [brand.apiBasePath, token])
    const navigationPersistence = useMemo<NavigationPreferencesPersistence | undefined>(() => {
        if (!authStatus?.user) return undefined
        let baseVersion: number | null = null
        return {
            key: authStatus.user.userId,
            load: async () => {
                const response = await fetchNavigationPreferences(client)
                baseVersion = response.version
                return response
            },
            save: async (preferences) => {
                try {
                    const response = await saveNavigationPreferences(client, preferences, baseVersion)
                    baseVersion = response.version
                } catch (error) {
                    if (error instanceof WikiApiError && error.status === 409) {
                        const current = await fetchNavigationPreferences(client)
                        baseVersion = current.version
                    }
                    throw error
                }
            }
        }
    }, [authStatus?.user, client])
    const { navigation, dispatch, persistenceState, retryPersistence } = useNavigationPreferences(
        store,
        pages,
        navigationPersistence
    )
    const canEdit = authStatus?.user?.roles.includes('wiki:admin') ?? false
    const isEditMode = canEdit && wikiMode === 'edit'
    const navigationRef = useRef(navigation)
    const pageLoadSequence = useRef(0)
    const categoryLoadSequence = useRef(0)
    const pageRefreshSequence = useRef(0)
    const trashLoadSequence = useRef(0)
    const activeCategory = navigation.categories.find((category) => category.id === categoryId)
    const activeCategoryExists = Boolean(activeCategory)
    const activeCategoryDocumentSlug = getCategoryDocumentSlug(activeCategory)
    const categoryDocumentSlugs = useMemo(
        () =>
            new Set(
                navigation.categories
                    .map((category) => getCategoryDocumentSlug(category))
                    .filter((documentSlug): documentSlug is string => Boolean(documentSlug))
            ),
        [navigation.categories]
    )
    const visiblePages = useMemo(
        () => pages.filter((page) => !categoryDocumentSlugs.has(page.slug)),
        [categoryDocumentSlugs, pages]
    )

    const refreshPages = useCallback(async () => {
        const refreshId = ++pageRefreshSequence.current
        const response = await fetchPages(client)
        if (refreshId === pageRefreshSequence.current) {
            setPages(response.pages)
            setPageIndexError(false)
        }
        return response.pages
    }, [client])

    const loadPage = useCallback(
        async (requestedSlug: string) => {
            const loadId = ++pageLoadSequence.current
            setStatus('loading')
            try {
                const pageListResult = refreshPages().then(
                    (nextPages) => ({ nextPages, error: null }),
                    (error: unknown) => ({ nextPages: [], error })
                )
                let response: WikiPageResponse
                try {
                    response = await fetchPageBySlug(client, requestedSlug || brand.defaultSlug)
                } catch (error) {
                    if (!(error instanceof WikiApiError) || error.status !== 404) throw error
                    const { nextPages, error: pageListError } = await pageListResult
                    if (pageListError) throw pageListError
                    if (nextPages.length === 0) {
                        if (loadId !== pageLoadSequence.current) return
                        setPageResponse(null)
                        setStatus('empty')
                        return
                    }
                    const fallbackSlug = nextPages[0]?.slug ?? brand.defaultSlug
                    response = await fetchPageBySlug(client, fallbackSlug)
                }

                if (loadId !== pageLoadSequence.current) return

                void pageListResult.then(({ error }) => {
                    if (!error || loadId !== pageLoadSequence.current) return
                    console.error(error)
                    setPageIndexError(true)
                })

                setPageResponse(response)
                setSlug(response.page.slug)
                replaceWikiLocation({ type: 'page', slug: response.page.slug })
                setStatus('ready')
            } catch (error) {
                if (loadId !== pageLoadSequence.current) return
                console.error(error)
                setPageResponse(null)
                setStatus('error')
            }
        },
        [brand.defaultSlug, client, refreshPages]
    )

    const loadCategory = useCallback(
        async (requestedCategoryId: string) => {
            const loadId = ++categoryLoadSequence.current
            setCategoryStatus('loading')
            try {
                const category = navigationRef.current.categories.find((entry) => entry.id === requestedCategoryId)
                if (!category) {
                    setCategoryResponse(null)
                    setCategoryStatus('error')
                    return
                }

                const documentSlug = getCategoryDocumentSlug(category)
                if (!documentSlug) throw new Error('category_document_missing')
                const response = await fetchPageBySlug(client, documentSlug)

                if (loadId !== categoryLoadSequence.current) return
                setCategoryResponse(response)
                setCategoryStatus('ready')
            } catch (error) {
                if (loadId !== categoryLoadSequence.current) return
                console.error(error)
                setCategoryResponse(null)
                setCategoryStatus('error')
            }
        },
        [client]
    )

    const refreshTrash = useCallback(async () => {
        const loadId = ++trashLoadSequence.current
        setTrashStatus('loading')
        try {
            const response = await fetchTrashedPages(client)
            if (loadId !== trashLoadSequence.current) return
            setTrashedPages(response.pages)
            setTrashStatus('ready')
        } catch (error) {
            if (loadId !== trashLoadSequence.current) return
            console.error(error)
            setTrashStatus('error')
        }
    }, [client])

    useEffect(() => writeAuthToken(token), [token])

    useEffect(() => {
        navigationRef.current = navigation
    }, [navigation])

    useEffect(() => {
        let active = true
        setAuthLoading(true)
        void fetchAuthMe(client)
            .then((nextStatus) => {
                if (!active) return
                setAuthError(false)
                if (token && !nextStatus.user) {
                    setToken('')
                    return
                }
                setAuthStatus(nextStatus)
            })
            .catch((error: unknown) => {
                if (!active) return
                console.error(error)
                setAuthError(true)
            })
            .finally(() => {
                if (active) setAuthLoading(false)
            })
        return () => {
            active = false
        }
    }, [authRetryGeneration, client, token])

    useEffect(() => {
        if (view === 'page') void loadPage(slug)
    }, [loadPage, slug, view])

    useEffect(() => {
        if (view !== 'category' || !categoryId || !activeCategoryExists) return
        void loadCategory(categoryId)
    }, [activeCategoryDocumentSlug, activeCategoryExists, categoryId, loadCategory, view])

    useEffect(() => {
        const navigateFromHistory = () => {
            const location = readWikiLocation(brand.defaultSlug)
            if (location.type === 'page') {
                setSlug(location.slug)
                setCategoryId(null)
            } else {
                setCategoryId(location.categoryId)
            }
            setView(location.type)
        }
        window.addEventListener('popstate', navigateFromHistory)
        return () => window.removeEventListener('popstate', navigateFromHistory)
    }, [brand.defaultSlug])

    function navigate(nextSlug: string) {
        const destinationChanged = view !== 'page' || nextSlug !== slug
        setView('page')
        setCategoryId(null)
        if (destinationChanged) pushWikiLocation({ type: 'page', slug: nextSlug })
        if (nextSlug === slug) void loadPage(nextSlug)
        else setSlug(nextSlug)
    }

    function navigateCategory(nextCategoryId: string) {
        const destinationChanged = view !== 'category' || nextCategoryId !== categoryId
        setView('category')
        setCategoryId(nextCategoryId)
        if (destinationChanged) pushWikiLocation({ type: 'category', categoryId: nextCategoryId })
    }

    async function createCategory(category: SidebarCategory): Promise<SidebarCategory> {
        const result = await createWikiPage(client, {
            title: category.title,
            icon: category.icon || null,
            slug: buildUniqueSlug(
                `category-${category.title}`,
                pages.map((page) => page.slug)
            ),
            visibility: 'public',
            markdown: ''
        })
        await refreshPages()
        return { ...category, documentSlug: result.page.slug }
    }

    async function createPage(
        title: string,
        categoryId: string | null,
        navigateAfterCreate = true
    ): Promise<WikiPageDto> {
        const category = navigation.categories.find((entry) => entry.id === categoryId)
        const pageSlug = buildUniqueSlug(
            category ? `${category.title}-${title}` : title,
            pages.map((page) => page.slug)
        )
        const result = await createWikiPage(client, {
            title,
            icon: null,
            slug: pageSlug,
            visibility: 'public',
            markdown: `# ${title}\n`
        })
        await refreshPages()
        if (navigateAfterCreate) {
            navigate(result.page.slug)
        }
        return result.page
    }

    async function renamePage(page: WikiPageDto, title: string): Promise<void> {
        await updatePageMeta(client, page.id, {
            title,
            icon: page.icon,
            slug: page.slug,
            visibility: page.visibility
        })
        await refreshPages()
        if (pageResponse?.page.id === page.id) {
            setPageResponse((current) => (current ? { ...current, page: { ...current.page, title } } : null))
        }
    }

    async function renameCategory(category: SidebarCategory, title: string): Promise<void> {
        await updateCategoryDocumentMeta(category, { title })
    }

    async function setCategoryIcon(category: SidebarCategory, icon: string): Promise<void> {
        await updateCategoryDocumentMeta(category, { icon: icon || null })
    }

    async function updateCategoryDocumentMeta(
        category: SidebarCategory,
        changes: { title?: string; icon?: string | null }
    ): Promise<void> {
        const documentSlug = getCategoryDocumentSlug(category)
        const page = pages.find((candidate) => candidate.slug === documentSlug)
        if (!page) return
        const result = await updatePageMeta(client, page.id, {
            title: changes.title ?? page.title,
            icon: changes.icon === undefined ? page.icon : changes.icon,
            slug: page.slug,
            visibility: page.visibility
        })
        acceptCategoryPageUpdate(category.id, result.page)
    }

    function acceptCategoryPageUpdate(nextCategoryId: string, updatedPage: WikiPageResponse['page']) {
        setPages((current) => current.map((page) => (page.id === updatedPage.id ? updatedPage : page)))
        setCategoryResponse((current) =>
            current && current.page.id === updatedPage.id
                ? { ...current, page: mergePageMetadata(current.page, updatedPage) }
                : current
        )
        dispatch({ type: 'rename-category', categoryId: nextCategoryId, title: updatedPage.title })
        dispatch({ type: 'set-category-icon', categoryId: nextCategoryId, icon: updatedPage.icon ?? '' })
    }

    async function duplicatePage(page: WikiPageDto): Promise<WikiPageDto> {
        const source = await fetchPageBySlug(client, page.slug)
        const title = `${source.page.title} 복사본`
        const copySlug = buildUniqueSlug(
            `${source.page.slug}-copy`,
            pages.map((candidate) => candidate.slug)
        )
        const result = await createWikiPage(client, {
            title,
            icon: source.page.icon,
            slug: copySlug,
            visibility: source.page.visibility,
            markdown: source.page.markdown || `# ${title}\n`
        })
        await refreshPages()
        navigate(result.page.slug)
        return result.page
    }

    async function trashPage(page: WikiPageDto): Promise<void> {
        await trashWikiPage(client, page.id)
        const nextPages = await refreshPages()
        await refreshTrash()
        if (pageResponse?.page.id === page.id) {
            const nextSlug = nextPages[0]?.slug
            if (nextSlug) navigate(nextSlug)
            else {
                setPageResponse(null)
                setStatus('empty')
            }
        }
    }

    async function trashCategory(category: SidebarCategory): Promise<void> {
        const documentSlug = getCategoryDocumentSlug(category)
        const pagesBySlug = new Map(pages.map((page) => [page.slug, page]))
        const categoryPages = [...new Set([...category.pageSlugs, ...(documentSlug ? [documentSlug] : [])])]
            .map((pageSlug) => pagesBySlug.get(pageSlug))
            .filter((page): page is WikiPageDto => Boolean(page))
        if (categoryPages.length > 0)
            await trashWikiPages(
                client,
                categoryPages.map((page) => page.id)
            )
        const nextPages = await refreshPages()
        await refreshTrash()
        if (pageResponse && category.pageSlugs.includes(pageResponse.page.slug)) {
            const nextSlug = nextPages[0]?.slug
            if (nextSlug) navigate(nextSlug)
            else {
                setPageResponse(null)
                setStatus('empty')
            }
        } else if (view === 'category' && categoryId === category.id) {
            const nextSlug = nextPages[0]?.slug
            if (nextSlug) navigate(nextSlug)
            else {
                setView('page')
                setCategoryId(null)
                setPageResponse(null)
                setStatus('empty')
                replaceWikiLocation({ type: 'page', slug: brand.defaultSlug })
            }
        }
    }

    async function restorePage(pageId: string): Promise<void> {
        const result = await restoreWikiPage(client, pageId)
        await Promise.all([refreshPages(), refreshTrash()])
        navigate(result.page.slug)
    }

    async function purgePage(page: WikiPageDto): Promise<void> {
        if (!window.confirm(`“${page.title}” 문서를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return
        await purgeWikiPage(client, page.id)
        await refreshTrash()
    }

    async function purgeAllPages(): Promise<void> {
        if (trashedPages.length === 0) return
        if (!window.confirm('휴지통의 모든 문서를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return
        await purgeWikiPages(
            client,
            trashedPages.map((page) => page.id)
        )
        await refreshTrash()
    }

    function openTrash() {
        setView('trash')
        void refreshTrash()
    }

    function login() {
        if (authStatus?.authMode === 'dev') {
            setToken('dev-admin')
            return
        }
        if (authStatus?.authMode !== 'google' || !authStatus.google.enabled) return
        window.location.assign(googleOAuthStartUrl(brand.apiBasePath, window.location.pathname))
    }

    function logout() {
        trashLoadSequence.current += 1
        setToken('')
        setAuthStatus((current) => (current ? { ...current, user: null } : current))
        setTrashedPages([])
        if (view === 'trash') navigate(pageResponse?.page.slug ?? pages[0]?.slug ?? brand.defaultSlug)
    }

    function changeWikiMode(nextMode: WikiMode) {
        if (nextMode === 'edit' && !canEdit) return
        setWikiMode(nextMode)
        if (nextMode === 'read' && view === 'trash') {
            navigate(pageResponse?.page.slug ?? pages[0]?.slug ?? brand.defaultSlug)
        }
    }

    return (
        <main className="wiki-shell">
            <AuthPanel status={authStatus} loading={authLoading} onLogin={login} onLogout={logout} />
            {authError ? (
                <div className="local-draft-banner" role="alert">
                    <strong>인증 서버 상태를 확인하지 못했습니다. 로그인 상태를 임의로 변경하지 않았습니다.</strong>
                    <div className="local-draft-actions">
                        <button type="button" onClick={() => setAuthRetryGeneration((generation) => generation + 1)}>
                            다시 시도
                        </button>
                    </div>
                </div>
            ) : null}
            {persistenceState === 'error' ? (
                <div className="local-draft-banner" role="alert">
                    <strong>화면 설정을 서버에 저장하지 못했습니다. 이 브라우저에 임시 보관합니다.</strong>
                    <div className="local-draft-actions">
                        <button type="button" onClick={retryPersistence}>
                            다시 시도
                        </button>
                    </div>
                </div>
            ) : null}
            {pageIndexError ? (
                <div className="local-draft-banner" role="alert">
                    <strong>문서 목록을 새로고침하지 못했습니다. 현재 문서는 계속 편집할 수 있습니다.</strong>
                    <div className="local-draft-actions">
                        <button
                            type="button"
                            onClick={() =>
                                void refreshPages().catch((error: unknown) => {
                                    console.error(error)
                                    setPageIndexError(true)
                                })
                            }
                        >
                            다시 시도
                        </button>
                    </div>
                </div>
            ) : null}
            <WikiSidebar
                brand={brand}
                pages={visiblePages}
                activeSlug={view === 'page' ? (pageResponse?.page.slug ?? null) : null}
                activeCategoryId={view === 'category' ? categoryId : null}
                navigation={navigation}
                dispatch={dispatch}
                canEdit={isEditMode}
                trashCount={trashedPages.length}
                trashActive={view === 'trash'}
                onNavigate={navigate}
                onNavigateCategory={navigateCategory}
                onCreateCategory={createCategory}
                onCreatePage={createPage}
                onRenamePage={renamePage}
                onRenameCategory={renameCategory}
                onSetCategoryIcon={setCategoryIcon}
                onDuplicatePage={duplicatePage}
                onTrashPage={trashPage}
                onTrashCategory={trashCategory}
                onOpenTrash={openTrash}
            />

            <section className="wiki-main">
                <WikiModeTabs mode={wikiMode} canEdit={canEdit} onChange={changeWikiMode} />
                {view === 'trash' ? (
                    <TrashView
                        status={trashStatus}
                        pages={trashedPages}
                        onRestore={restorePage}
                        onPurge={purgePage}
                        onPurgeAll={purgeAllPages}
                        onClose={() => navigate(pageResponse?.page.slug ?? pages[0]?.slug ?? brand.defaultSlug)}
                    />
                ) : view === 'category' ? (
                    <PageContent
                        status={categoryStatus}
                        response={categoryResponse}
                        client={client}
                        brand={brand}
                        pages={visiblePages}
                        canEdit={isEditMode}
                        onCreatePage={async (title) => {
                            const created = await createPage(title, categoryId, false)
                            if (categoryId) dispatch({ type: 'assign-page', slug: created.slug, categoryId })
                            return created
                        }}
                        onPageUpdated={(updatedPage) => {
                            if (categoryId) acceptCategoryPageUpdate(categoryId, updatedPage)
                        }}
                    />
                ) : (
                    <PageContent
                        status={status}
                        response={pageResponse}
                        client={client}
                        brand={brand}
                        pages={visiblePages}
                        canEdit={isEditMode}
                        onCreatePage={(title) => createPage(title, null, false)}
                        onPageUpdated={(updatedPage) => {
                            setPages((current) =>
                                current.map((page) => (page.id === updatedPage.id ? updatedPage : page))
                            )
                            setPageResponse((current) =>
                                current && current.page.id === updatedPage.id
                                    ? { ...current, page: mergePageMetadata(current.page, updatedPage) }
                                    : current
                            )
                        }}
                    />
                )}
            </section>
        </main>
    )
}

function mergePageMetadata(current: WikiPageDetailDto, updated: WikiPageDetailDto): WikiPageDetailDto {
    return {
        ...current,
        slug: updated.slug,
        title: updated.title,
        icon: updated.icon,
        visibility: updated.visibility,
        updatedAt: updated.updatedAt,
        deletedAt: updated.deletedAt,
        deletedBy: updated.deletedBy
    }
}

function getCategoryDocumentSlug(category: SidebarCategory | undefined): string | undefined {
    return category?.documentSlug
}
