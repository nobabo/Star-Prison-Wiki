import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
    CreateWikiPageRequest,
    WikiAuthStatusDto,
    WikiPageDetailDto,
    WikiPageDto,
    WikiPageResponse
} from '@coconut-studio/wiki-contracts'

import { googleOAuthStartUrl, initializeAuthToken, writeAuthToken } from '../features/auth/auth-session'
import { AuthPanel } from '../features/auth/components/AuthPanel'
import { WikiSidebar } from '../features/navigation/components/WikiSidebar'
import {
    categoryHref,
    pageHref,
    pushWikiLocation,
    readWikiLocation,
    replaceWikiLocation
} from '../features/navigation/navigation-location'
import {
    LocalNavigationPreferencesStore,
    type NavigationPreferencesStore
} from '../features/navigation/navigation-preferences'
import { buildUniqueSlug, getPageCategoryRouteKey } from '../features/navigation/navigation-utils'
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
    updatePageAddress,
    updatePageMeta,
    WikiApiError,
    type ApiClient
} from '../shared/api/wiki-api'
import type { WikiBrandConfig } from './wiki-brand'

type PageMetadataPatch = Partial<
    Pick<WikiPageDto, 'slug' | 'title' | 'icon' | 'visibility' | 'updatedAt' | 'deletedAt' | 'deletedBy'>
>

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
    const [initialLocation] = useState(() => readWikiLocation(brand.defaultSlug))
    const [slug, setSlug] = useState(() => (initialLocation.type === 'page' ? initialLocation.slug : brand.defaultSlug))
    const [categoryId, setCategoryId] = useState<string | null>(() =>
        initialLocation.type === 'category' ? initialLocation.categoryId : null
    )
    const [pages, setPages] = useState<WikiPageDto[]>([])
    const [pageIndexClientKey, setPageIndexClientKey] = useState<string | null>(null)
    const [pageResponse, setPageResponse] = useState<WikiPageResponse | null>(null)
    const [status, setStatus] = useState<PageLoadStatus>('loading')
    const [pageIndexError, setPageIndexError] = useState(false)
    const [categoryResponse, setCategoryResponse] = useState<WikiPageResponse | null>(null)
    const [categoryStatus, setCategoryStatus] = useState<PageLoadStatus>('loading')
    const [view, setView] = useState<'page' | 'category' | 'trash'>(() => initialLocation.type)
    const [trashedPages, setTrashedPages] = useState<WikiPageDto[]>([])
    const [trashStatus, setTrashStatus] = useState<TrashLoadStatus>('loading')
    const client = useMemo<ApiClient>(() => ({ token, basePath: brand.apiBasePath }), [brand.apiBasePath, token])
    const clientKey = JSON.stringify([brand.apiBasePath ?? '', token])
    const canEdit = authStatus?.user?.roles.includes('wiki:admin') ?? false
    const navigationPersistence = useMemo<NavigationPreferencesPersistence>(() => {
        let baseVersion: number | null = null
        return {
            key: 'wiki:global-navigation',
            load: async () => {
                const response = await fetchNavigationPreferences(client)
                baseVersion = response.version
                return response
            },
            save: async (preferences) => {
                if (!canEdit) return
                for (let attempt = 0; attempt < 2; attempt += 1) {
                    try {
                        const response = await saveNavigationPreferences(client, preferences, baseVersion)
                        baseVersion = response.version
                        return
                    } catch (error) {
                        if (!(error instanceof WikiApiError) || error.status !== 409 || attempt > 0) throw error
                        const current = await fetchNavigationPreferences(client)
                        baseVersion = current.version
                    }
                }
            }
        }
    }, [canEdit, client])
    const { navigation, dispatch, persistenceState, retryPersistence } = useNavigationPreferences(
        store,
        pages,
        navigationPersistence,
        pageIndexClientKey === clientKey
    )
    const navigationRef = useRef(navigation)
    const pageLoadSequence = useRef(0)
    const categoryLoadSequence = useRef(0)
    const pageRefreshSequence = useRef(0)
    const trashLoadSequence = useRef(0)
    const prefetchedResponses = useRef(new Map<string, WikiPageResponse>())
    const livePageMetadata = useRef(new Map<string, PageMetadataPatch>())
    const activeCategory = findCategoryByRouteKey(navigation.categories, categoryId)
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
            setPageIndexClientKey(clientKey)
            setPageIndexError(false)
        }
        return response.pages
    }, [client, clientKey])

    const loadPage = useCallback(
        async (requestedSlug: string) => {
            const loadId = ++pageLoadSequence.current
            const pageKey = requestedSlug || brand.defaultSlug
            const prefetchedResponse = prefetchedResponses.current.get(pageKey)
            if (prefetchedResponse) {
                prefetchedResponses.current.delete(pageKey)
                setPageResponse(applyLivePageMetadata(prefetchedResponse, livePageMetadata.current))
                setSlug(prefetchedResponse.page.slug)
                replacePageLocation(prefetchedResponse.page.slug, navigationRef.current.categories)
                setStatus('ready')
                return
            }
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
                response = applyLivePageMetadata(response, livePageMetadata.current)

                void pageListResult.then(({ error }) => {
                    if (!error || loadId !== pageLoadSequence.current) return
                    console.error(error)
                    setPageIndexError(true)
                })

                setPageResponse(response)
                setSlug(response.page.slug)
                replacePageLocation(response.page.slug, navigationRef.current.categories)
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
            try {
                const category = findCategoryByRouteKey(navigationRef.current.categories, requestedCategoryId)
                if (!category) {
                    setCategoryResponse(null)
                    setCategoryStatus('error')
                    return
                }

                const documentSlug = getCategoryDocumentSlug(category)
                if (!documentSlug) throw new Error('category_document_missing')
                const prefetchedResponse = prefetchedResponses.current.get(documentSlug)
                if (prefetchedResponse) {
                    prefetchedResponses.current.delete(documentSlug)
                    setCategoryResponse(applyLivePageMetadata(prefetchedResponse, livePageMetadata.current))
                    if (requestedCategoryId !== documentSlug) {
                        replaceWikiLocation({ type: 'category', categoryId: documentSlug })
                    }
                    setCategoryStatus('ready')
                    return
                }
                if (categoryResponse?.page.slug === documentSlug) return

                setCategoryStatus('loading')
                const response = await fetchPageBySlug(client, documentSlug)

                if (loadId !== categoryLoadSequence.current) return
                setCategoryResponse(applyLivePageMetadata(response, livePageMetadata.current))
                if (requestedCategoryId !== documentSlug) {
                    replaceWikiLocation({ type: 'category', categoryId: documentSlug })
                }
                setCategoryStatus('ready')
            } catch (error) {
                if (loadId !== categoryLoadSequence.current) return
                console.error(error)
                setCategoryResponse(null)
                setCategoryStatus('error')
            }
        },
        [categoryResponse, client]
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
        if (view !== 'page' || status !== 'ready' || !pageResponse) return
        replacePageLocation(pageResponse.page.slug, navigation.categories)
    }, [navigation.categories, pageResponse, status, view])

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

    function navigate(nextSlug: string, nextCategoryId?: string | null) {
        const destinationChanged = view !== 'page' || nextSlug !== slug
        const categoryRouteKey = nextCategoryId
            ? (findCategoryByRouteKey(navigation.categories, nextCategoryId)?.documentSlug ?? nextCategoryId)
            : nextCategoryId === null
              ? undefined
              : getPageCategoryRouteKey(navigation.categories, nextSlug)
        setView('page')
        setCategoryId(null)
        if (destinationChanged) pushWikiLocation({ type: 'page', slug: nextSlug, categoryId: categoryRouteKey })
        if (nextSlug === slug) void loadPage(nextSlug)
        else setSlug(nextSlug)
    }

    function navigateCategory(nextCategoryId: string) {
        const destinationChanged = view !== 'category' || nextCategoryId !== categoryId
        setView('category')
        setCategoryId(nextCategoryId)
        if (destinationChanged) pushWikiLocation({ type: 'category', categoryId: nextCategoryId })
    }

    function acceptCreatedPage(createdPage: WikiPageDto): void {
        // Ignore page-index responses started before this local mutation.
        pageRefreshSequence.current += 1
        rememberLivePageMetadata(livePageMetadata.current, createdPage)
        setPages((current) => {
            const existingIndex = current.findIndex((page) => page.id === createdPage.id)
            if (existingIndex === -1) return [...current, createdPage]
            return current.map((page, index) => (index === existingIndex ? createdPage : page))
        })
        setPageResponse((current) =>
            current && current.page.id === createdPage.id
                ? { ...current, page: mergePageMetadata(current.page, createdPage) }
                : current
        )
        setCategoryResponse((current) =>
            current && current.page.id === createdPage.id
                ? { ...current, page: mergePageMetadata(current.page, createdPage) }
                : current
        )
    }

    async function createCategory(category: SidebarCategory): Promise<SidebarCategory> {
        const result = await createWikiPageWithUniqueSlug(client, `category-${category.title}`, pages, {
            title: category.title,
            icon: category.icon || null,
            visibility: 'public',
            markdown: ''
        })
        const response: WikiPageResponse = {
            page: result.page,
            permissions: { read: true, write: canEdit }
        }
        prefetchedResponses.current.set(result.page.slug, response)
        acceptCreatedPage(result.page)
        setCategoryResponse(response)
        setCategoryStatus('ready')
        return { ...category, documentSlug: result.page.slug }
    }

    async function createPage(
        title: string,
        categoryId: string | null,
        navigateAfterCreate = true
    ): Promise<WikiPageDto> {
        const category = findCategoryByRouteKey(navigation.categories, categoryId)
        const result = await createWikiPageWithUniqueSlug(
            client,
            category ? `${category.title}-${title}` : title,
            pages,
            {
                title,
                icon: null,
                visibility: 'public',
                markdown: `# ${title}\n`
            }
        )
        prefetchedResponses.current.set(result.page.slug, {
            page: result.page,
            permissions: { read: true, write: canEdit }
        })
        acceptCreatedPage(result.page)
        if (navigateAfterCreate) {
            navigate(result.page.slug)
        }
        return result.page
    }

    async function renamePage(page: WikiPageDto, title: string): Promise<void> {
        const result = await updatePageMeta(client, page.id, { title })
        acceptCreatedPage(result.page)
    }

    async function renamePageAddress(page: WikiPageDto, nextSlug: string): Promise<void> {
        const result = await updatePageAddress(client, page.id, { slug: nextSlug })
        acceptPageAddressUpdate(page.slug, result.page)
    }

    async function renameCategory(category: SidebarCategory, title: string): Promise<void> {
        await updateCategoryDocumentMeta(category, { title })
    }

    async function renameCategoryAddress(category: SidebarCategory, slug: string): Promise<void> {
        const result = await updateCategoryDocumentMeta(category, { slug })
        showCategoryAtUpdatedAddress(category.id, result.page.slug)
    }

    async function setCategoryIcon(category: SidebarCategory, icon: string): Promise<void> {
        const previousIcon = category.icon
        applyCategoryIconLocally(category, icon)
        try {
            await updateCategoryDocumentMeta(category, { icon: icon || null })
        } catch (error) {
            applyCategoryIconLocally(category, previousIcon)
            throw error
        }
    }

    function applyCategoryIconLocally(category: SidebarCategory, icon: string): void {
        const documentSlug = getCategoryDocumentSlug(category)
        dispatch({ type: 'set-category-icon', categoryId: category.id, icon })
        if (!documentSlug) return
        setLivePageMetadata(livePageMetadata.current, documentSlug, { icon: icon || null })
        setPages((current) =>
            current.map((page) => (page.slug === documentSlug ? { ...page, icon: icon || null } : page))
        )
        setPageResponse((current) =>
            current && current.page.slug === documentSlug
                ? { ...current, page: { ...current.page, icon: icon || null } }
                : current
        )
        setCategoryResponse((current) =>
            current?.page.slug === documentSlug
                ? { ...current, page: { ...current.page, icon: icon || null } }
                : current
        )
    }

    async function updateCategoryDocumentMeta(
        category: SidebarCategory,
        changes: { title?: string; icon?: string | null; slug?: string }
    ): Promise<{ page: WikiPageDetailDto }> {
        const documentSlug = getCategoryDocumentSlug(category)
        if (!documentSlug) throw new Error('category_document_missing')
        const page =
            pages.find((candidate) => candidate.slug === documentSlug) ??
            (categoryResponse?.page.slug === documentSlug
                ? categoryResponse.page
                : (await fetchPageBySlug(client, documentSlug)).page)
        const result = changes.slug
            ? await updatePageAddress(client, page.id, { slug: changes.slug })
            : await updatePageMeta(client, page.id, {
                  ...(changes.title === undefined ? {} : { title: changes.title }),
                  ...(changes.icon === undefined ? {} : { icon: changes.icon })
              })
        acceptCategoryPageUpdate(category.id, result.page)
        return result
    }

    function acceptCategoryPageUpdate(nextCategoryId: string, updatedPage: WikiPageResponse['page']) {
        const previousCategory = navigationRef.current.categories.find((category) => category.id === nextCategoryId)
        const previousDocumentSlug = getCategoryDocumentSlug(previousCategory)
        if (previousDocumentSlug && previousDocumentSlug !== updatedPage.slug) {
            livePageMetadata.current.delete(previousDocumentSlug)
        }
        acceptCreatedPage(updatedPage)
        dispatch({
            type: 'update-category-document',
            categoryId: nextCategoryId,
            previousSlug: previousDocumentSlug ?? updatedPage.slug,
            nextSlug: updatedPage.slug,
            title: updatedPage.title,
            icon: updatedPage.icon ?? ''
        })
    }

    function showCategoryAtUpdatedAddress(nextCategoryId: string, nextDocumentSlug: string): void {
        const currentCategory = findCategoryByRouteKey(navigationRef.current.categories, categoryId)
        const targetWasActive = view === 'category' && currentCategory?.id === nextCategoryId
        setView('category')
        setCategoryId(nextDocumentSlug)
        if (targetWasActive) replaceWikiLocation({ type: 'category', categoryId: nextDocumentSlug })
        else pushWikiLocation({ type: 'category', categoryId: nextDocumentSlug })
    }

    function acceptPageAddressUpdate(previousSlug: string, updatedPage: WikiPageResponse['page']) {
        dispatch({ type: 'replace-page-slug', previousSlug, nextSlug: updatedPage.slug })
        livePageMetadata.current.delete(previousSlug)
        acceptCreatedPage(updatedPage)
        if (view === 'page' && pageResponse?.page.id === updatedPage.id) {
            setSlug(updatedPage.slug)
            replacePageLocation(updatedPage.slug, navigationRef.current.categories)
        }
    }

    async function duplicatePage(page: WikiPageDto): Promise<WikiPageDto> {
        const source = await fetchPageBySlug(client, page.slug)
        const title = `${source.page.title} 복사본`
        const result = await createWikiPageWithUniqueSlug(client, `${source.page.slug}-copy`, pages, {
            title,
            icon: source.page.icon,
            visibility: source.page.visibility,
            markdown: source.page.markdown || `# ${title}\n`
        })
        prefetchedResponses.current.set(result.page.slug, {
            page: result.page,
            permissions: { read: true, write: canEdit }
        })
        acceptCreatedPage(result.page)
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
        } else if (view === 'category' && activeCategory?.id === category.id) {
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

    return (
        <main className="wiki-shell">
            <AuthPanel status={authStatus} loading={authLoading} onLogin={login} onLogout={logout} />
            {authError ? (
                <div className="wiki-alert-banner" role="alert">
                    <strong>인증 서버 상태를 확인하지 못했습니다. 로그인 상태를 임의로 변경하지 않았습니다.</strong>
                    <div className="wiki-alert-actions">
                        <button type="button" onClick={() => setAuthRetryGeneration((generation) => generation + 1)}>
                            다시 시도
                        </button>
                    </div>
                </div>
            ) : null}
            {persistenceState === 'error' ? (
                <div className="wiki-alert-banner" role="alert">
                    <strong>화면 설정을 서버에 저장하지 못했습니다. 이 브라우저에 임시 보관합니다.</strong>
                    <div className="wiki-alert-actions">
                        <button type="button" onClick={retryPersistence}>
                            다시 시도
                        </button>
                    </div>
                </div>
            ) : null}
            {pageIndexError ? (
                <div className="wiki-alert-banner" role="alert">
                    <strong>문서 목록을 새로고침하지 못했습니다. 현재 문서는 계속 편집할 수 있습니다.</strong>
                    <div className="wiki-alert-actions">
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
                activeCategoryId={view === 'category' ? (activeCategory?.id ?? null) : null}
                navigation={navigation}
                dispatch={dispatch}
                canEdit={canEdit}
                trashCount={trashedPages.length}
                trashActive={view === 'trash'}
                onNavigate={navigate}
                onNavigateCategory={navigateCategory}
                onCreateCategory={createCategory}
                onCreatePage={createPage}
                onRenamePage={renamePage}
                onRenamePageAddress={renamePageAddress}
                onRenameCategory={renameCategory}
                onRenameCategoryAddress={renameCategoryAddress}
                onSetCategoryIcon={setCategoryIcon}
                onDuplicatePage={duplicatePage}
                onTrashPage={trashPage}
                onTrashCategory={trashCategory}
                onOpenTrash={openTrash}
            />

            <section className="wiki-main">
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
                        categories={navigation.categories}
                        canEdit={canEdit}
                        currentUser={authStatus?.user ?? null}
                        onCreatePage={async (title) => {
                            const targetCategoryId = activeCategory?.id ?? null
                            const created = await createPage(title, targetCategoryId, false)
                            if (targetCategoryId)
                                dispatch({ type: 'assign-page', slug: created.slug, categoryId: targetCategoryId })
                            return created
                        }}
                        onPageUpdated={(updatedPage) => {
                            if (activeCategory) acceptCategoryPageUpdate(activeCategory.id, updatedPage)
                        }}
                        pageHrefForSlug={(pageSlug) =>
                            pageHref(pageSlug, getPageCategoryRouteKey(navigation.categories, pageSlug))
                        }
                        categoryHrefForKey={categoryHref}
                    />
                ) : (
                    <PageContent
                        status={status}
                        response={pageResponse}
                        client={client}
                        brand={brand}
                        pages={visiblePages}
                        categories={navigation.categories}
                        canEdit={canEdit}
                        currentUser={authStatus?.user ?? null}
                        onCreatePage={(title) => createPage(title, null, false)}
                        onPageUpdated={(updatedPage) => {
                            acceptCreatedPage(updatedPage)
                        }}
                        pageHrefForSlug={(pageSlug) =>
                            pageHref(pageSlug, getPageCategoryRouteKey(navigation.categories, pageSlug))
                        }
                        categoryHrefForKey={categoryHref}
                    />
                )}
            </section>
        </main>
    )
}

export async function createWikiPageWithUniqueSlug(
    client: ApiClient,
    slugSeed: string,
    knownPages: WikiPageDto[],
    input: Omit<CreateWikiPageRequest, 'slug'>
): Promise<{ page: WikiPageDetailDto }> {
    const takenSlugs = new Set(knownPages.map((page) => page.slug))

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const slug = buildUniqueSlug(slugSeed, [...takenSlugs])
        takenSlugs.add(slug)
        try {
            return await createWikiPage(client, { ...input, slug })
        } catch (error) {
            if (!(error instanceof WikiApiError) || error.status !== 409 || error.code !== 'conflict') throw error
            const latest = await fetchPages(client)
            for (const page of latest.pages) takenSlugs.add(page.slug)
        }
    }

    throw new WikiApiError(409, 'conflict', 'Could not allocate a unique wiki slug')
}

function findCategoryByRouteKey(categories: SidebarCategory[], routeKey: string | null): SidebarCategory | undefined {
    if (!routeKey) return undefined
    return categories.find((category) => category.id === routeKey || category.documentSlug === routeKey)
}

function mergePageMetadata(current: WikiPageDetailDto, updated: WikiPageDto): WikiPageDetailDto {
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

function rememberLivePageMetadata(metadata: Map<string, PageMetadataPatch>, page: WikiPageDto): void {
    setLivePageMetadata(metadata, page.slug, {
        slug: page.slug,
        title: page.title,
        icon: page.icon,
        visibility: page.visibility,
        updatedAt: page.updatedAt,
        deletedAt: page.deletedAt,
        deletedBy: page.deletedBy
    })
}

function setLivePageMetadata(metadata: Map<string, PageMetadataPatch>, slug: string, patch: PageMetadataPatch): void {
    metadata.set(slug, { ...metadata.get(slug), ...patch })
}

function applyLivePageMetadata(response: WikiPageResponse, metadata: Map<string, PageMetadataPatch>): WikiPageResponse {
    const patch = metadata.get(response.page.slug)
    if (!patch) return response

    if (pageMetadataMatches(response.page, patch)) {
        metadata.delete(response.page.slug)
        return response
    }

    return { ...response, page: { ...response.page, ...patch } }
}

function pageMetadataMatches(page: WikiPageDto, patch: PageMetadataPatch): boolean {
    const current = page as unknown as Record<string, unknown>
    return Object.entries(patch).every(([key, value]) => current[key] === value)
}
function getCategoryDocumentSlug(category: SidebarCategory | undefined): string | undefined {
    return category?.documentSlug
}

function replacePageLocation(slug: string, categories: SidebarCategory[]): void {
    replaceWikiLocation({ type: 'page', slug, categoryId: getPageCategoryRouteKey(categories, slug) })
}
