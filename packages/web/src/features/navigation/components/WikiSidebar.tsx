import { useEffect, useMemo, useState, type Dispatch, type DragEvent, type MouseEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import type { EmojiClickData } from 'emoji-picker-react'
import {
    ChevronDown,
    Copy,
    Eraser,
    Link as LinkIcon,
    Menu,
    Moon,
    PencilLine,
    Plus,
    SmilePlus,
    Star,
    Sun,
    Trash2,
    X
} from 'lucide-react'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import type { WikiBrandConfig } from '../../../app/wiki-brand'
import { useAsyncAction } from '../../../shared/hooks/use-async-action'
import { LazyEmojiPicker } from '../../editor/components/LazyEmojiPicker'
import { categoryHref, pageHref } from '../navigation-location'
import type { NavigationAction, NavigationState } from '../navigation-reducer'
import { createCategoryId, getPageCategoryRouteKey, getVerticalDropEdge, orderPagesBySlugs } from '../navigation-utils'
import type { SidebarCategory, SidebarDragItem, SidebarDropTarget, SidebarMenu } from '../types'
import { PageListItem } from './PageListItem'

const MENU_WIDTH = 300
const MENU_HEIGHT = 320
const MENU_MARGIN = 8
const CATEGORY_ICON_PICKER_WIDTH = 316
const CATEGORY_ICON_PICKER_HEIGHT = 390
const DEFAULT_PAGE_TITLE = '새 문서'
const DEFAULT_CATEGORY_ICON = '☀️'

type CreateMode = { kind: 'category' }
type CategoryIconPickerState = { categoryId: string; x: number; y: number }

type WikiSidebarProps = {
    brand: WikiBrandConfig
    pages: WikiPageDto[]
    activeSlug: string | null
    activeCategoryId: string | null
    navigation: NavigationState
    dispatch: Dispatch<NavigationAction>
    canEdit: boolean
    trashCount: number
    trashActive: boolean
    onNavigate(slug: string, categoryId?: string | null): void
    onNavigateCategory(categoryId: string): void
    onCreateCategory(category: SidebarCategory): Promise<SidebarCategory>
    onCreatePage(title: string, categoryId: string | null, navigateAfterCreate?: boolean): Promise<WikiPageDto>
    onRenamePage(page: WikiPageDto, title: string): Promise<void>
    onRenamePageAddress(page: WikiPageDto, slug: string): Promise<void>
    onRenameCategory(category: SidebarCategory, title: string): Promise<void>
    onRenameCategoryAddress(category: SidebarCategory, slug: string): Promise<void>
    onSetCategoryIcon(category: SidebarCategory, icon: string): Promise<void>
    onDuplicatePage(page: WikiPageDto): Promise<WikiPageDto>
    onTrashPage(page: WikiPageDto): Promise<void>
    onTrashCategory(category: SidebarCategory): Promise<void>
    onOpenTrash(): void
}

export function WikiSidebar(props: WikiSidebarProps) {
    const {
        brand,
        pages,
        activeSlug,
        activeCategoryId,
        navigation,
        dispatch,
        canEdit,
        trashCount,
        trashActive,
        onNavigate,
        onNavigateCategory,
        onCreateCategory,
        onCreatePage,
        onRenamePage,
        onRenamePageAddress,
        onRenameCategory,
        onRenameCategoryAddress,
        onSetCategoryIcon,
        onDuplicatePage,
        onTrashPage,
        onTrashCategory,
        onOpenTrash
    } = props
    const [createMode, setCreateMode] = useState<CreateMode | null>(null)
    const [newTitle, setNewTitle] = useState('')
    const [dragItem, setDragItem] = useState<SidebarDragItem | null>(null)
    const [dropTarget, setDropTarget] = useState<SidebarDropTarget | null>(null)
    const [menu, setMenu] = useState<SidebarMenu>(null)
    const [categoryIconPicker, setCategoryIconPicker] = useState<CategoryIconPickerState | null>(null)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const { run: runAction, pending: actionPending, error: actionError, clearError } = useAsyncAction()

    const favoriteSlugs = useMemo(() => new Set(navigation.favoriteSlugs), [navigation.favoriteSlugs])
    const pageBySlug = useMemo(() => new Map(pages.map((page) => [page.slug, page])), [pages])
    const assignedSlugs = useMemo(
        () =>
            new Set(
                navigation.categories.flatMap((category) => {
                    const documentSlug = category.documentSlug
                    return documentSlug ? [...category.pageSlugs, documentSlug] : category.pageSlugs
                })
            ),
        [navigation.categories]
    )
    const rootPages = useMemo(
        () =>
            orderPagesBySlugs(
                pages.filter((page) => !assignedSlugs.has(page.slug)),
                navigation.rootPageSlugs
            ),
        [assignedSlugs, navigation.rootPageSlugs, pages]
    )

    useEffect(() => {
        if (!menu) return
        const close = () => setMenu(null)
        window.addEventListener('mousedown', close)
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        return () => {
            window.removeEventListener('mousedown', close)
            window.removeEventListener('resize', close)
            window.removeEventListener('scroll', close, true)
        }
    }, [menu])

    useEffect(() => {
        if (!categoryIconPicker) return
        const close = () => setCategoryIconPicker(null)
        window.addEventListener('mousedown', close)
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        return () => {
            window.removeEventListener('mousedown', close)
            window.removeEventListener('resize', close)
            window.removeEventListener('scroll', close, true)
        }
    }, [categoryIconPicker])

    useEffect(() => {
        document.documentElement.dataset.theme = navigation.theme
    }, [navigation.theme])

    function startCreate(mode: CreateMode) {
        setMenu(null)
        setNewTitle('')
        setCreateMode(mode)
    }

    async function submitCreate() {
        const title = newTitle.trim()
        if (!title || !createMode) return

        const category = await onCreateCategory({
            id: createCategoryId(),
            title,
            icon: DEFAULT_CATEGORY_ICON,
            collapsed: false,
            pageSlugs: []
        })
        flushSync(() => {
            dispatch({ type: 'add-category', category })
        })
        setCreateMode(null)
        setNewTitle('')
        onNavigateCategory(category.documentSlug ?? category.id)
    }

    async function createPageInCategory(categoryId: string) {
        setMenu(null)
        const created = await onCreatePage(DEFAULT_PAGE_TITLE, categoryId, false)
        flushSync(() => {
            dispatch({ type: 'assign-page', slug: created.slug, categoryId })
        })
        navigateFromSidebar(created.slug, categoryId)
    }

    function openPageMenu(event: MouseEvent, slug: string) {
        event.preventDefault()
        setCategoryIconPicker(null)
        setMenu({ type: 'page', slug, ...clampMenu(event.clientX, event.clientY) })
    }

    function openCategoryMenu(event: MouseEvent, categoryId: string) {
        event.preventDefault()
        setCategoryIconPicker(null)
        setMenu({
            type: 'category',
            categoryId,
            ...clampMenu(event.clientX, event.clientY)
        })
    }

    function startDrag(event: DragEvent<HTMLElement>, item: SidebarDragItem) {
        setDragItem(item)
        setCategoryIconPicker(null)
        setMenu(null)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.dropEffect = 'move'
        event.dataTransfer.setData('text/plain', item.type === 'page' ? item.slug : item.categoryId)
    }

    function finishDrag() {
        setDragItem(null)
        setDropTarget(null)
    }

    function pageDragOver(event: DragEvent<HTMLElement>, categoryId: string | null, slug: string) {
        if (dragItem?.type !== 'page') return
        event.preventDefault()
        event.stopPropagation()
        setDropTarget({ type: 'page', categoryId, slug, edge: getDropEdge(event) })
    }

    function categoryDragOver(event: DragEvent<HTMLElement>, categoryId: string) {
        if (!dragItem) return
        event.preventDefault()
        event.stopPropagation()
        setDropTarget(
            dragItem.type === 'category'
                ? { type: 'category', categoryId, edge: getDropEdge(event) }
                : { type: 'page-container', categoryId }
        )
    }

    function categoryContainerDragOver(event: DragEvent<HTMLElement>, categoryId: string) {
        if (dragItem?.type === 'category') {
            event.preventDefault()
            event.stopPropagation()
            setDropTarget({
                type: 'category',
                categoryId,
                edge: getDropEdge(event)
            })
            return
        }
        containerDragOver(event, categoryId)
    }

    function containerDragOver(event: DragEvent<HTMLElement>, categoryId: string | null) {
        if (dragItem?.type !== 'page') return
        event.preventDefault()
        if (categoryId !== null) event.stopPropagation()
        setDropTarget({ type: 'page-container', categoryId })
    }

    function trashDragOver(event: DragEvent<HTMLElement>) {
        if (!dragItem) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        setDropTarget({ type: 'trash' })
    }

    function trashDragLeave(event: DragEvent<HTMLElement>) {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        if (dropTarget?.type === 'trash') setDropTarget(null)
    }

    function drop(event: DragEvent<HTMLElement>) {
        event.preventDefault()
        event.stopPropagation()
        flushSync(() => {
            if (dragItem?.type === 'category' && dropTarget?.type === 'category') {
                dispatch({
                    type: 'move-category',
                    categoryId: dragItem.categoryId,
                    targetId: dropTarget.categoryId,
                    edge: dropTarget.edge
                })
            } else if (
                dragItem?.type === 'page' &&
                (dropTarget?.type === 'page' || dropTarget?.type === 'page-container')
            ) {
                dispatch({
                    type: 'move-page',
                    slug: dragItem.slug,
                    target: dropTarget,
                    pages
                })
            }
        })
        finishDrag()
    }

    function dropOnTrash(event: DragEvent<HTMLElement>) {
        event.preventDefault()
        event.stopPropagation()
        if (!dragItem) return
        const item = dragItem
        finishDrag()
        runAction(() => trashDraggedItem(item))
    }

    async function trashDraggedItem(item: SidebarDragItem) {
        if (item.type === 'page') {
            const page = pageBySlug.get(item.slug)
            if (page) await trashPage(page)
            return
        }

        const category = navigation.categories.find((entry) => entry.id === item.categoryId)
        if (category) await trashCategory(category)
    }

    async function renamePage(page: WikiPageDto) {
        setMenu(null)
        const title = window.prompt('문서 이름', page.title)?.trim()
        if (title && title !== page.title) await onRenamePage(page, title)
    }

    async function renamePageAddress(page: WikiPageDto) {
        setMenu(null)
        const slug = promptForAddress('문서', page.slug)
        if (slug) await onRenamePageAddress(page, slug)
    }

    async function renameCategory(category: SidebarCategory) {
        setMenu(null)
        const title = window.prompt('카테고리 이름', category.title)?.trim()
        if (title && title !== category.title) {
            await onRenameCategory(category, title)
            dispatch({ type: 'rename-category', categoryId: category.id, title })
        }
    }

    async function renameCategoryAddress(category: SidebarCategory) {
        setMenu(null)
        const currentSlug = category.documentSlug
        if (!currentSlug) return

        const slug = promptForAddress('카테고리', currentSlug)
        if (slug) await onRenameCategoryAddress(category, slug)
    }

    function openCategoryIconPicker(category: SidebarCategory) {
        if (!menu || menu.type !== 'category') return
        setMenu(null)
        setCategoryIconPicker({
            categoryId: category.id,
            ...clampCategoryIconPicker(menu.x, menu.y)
        })
    }

    async function selectCategoryIcon(icon: string) {
        if (!categoryIconPicker) return
        const category = navigation.categories.find((entry) => entry.id === categoryIconPicker.categoryId)
        if (!category) return
        await onSetCategoryIcon(category, icon)
        setCategoryIconPicker(null)
    }

    function selectCategoryEmoji(emojiData: EmojiClickData) {
        runAction(() => selectCategoryIcon(emojiData.emoji))
    }

    async function duplicatePage(page: WikiPageDto) {
        setMenu(null)
        const created = await onDuplicatePage(page)
        const categoryId = navigation.categories.find((category) => category.pageSlugs.includes(page.slug))?.id ?? null
        dispatch({ type: 'assign-page', slug: created.slug, categoryId })
    }

    async function trashPage(page: WikiPageDto) {
        setMenu(null)
        if (!window.confirm(`“${page.title}” 문서를 휴지통으로 옮길까요?`)) return
        await onTrashPage(page)
    }

    async function trashCategory(category: SidebarCategory) {
        setMenu(null)
        if (!window.confirm(`“${category.title}” 카테고리와 포함 문서를 휴지통으로 옮길까요?`)) return
        await onTrashCategory(category)
        dispatch({ type: 'remove-category', categoryId: category.id })
    }

    const menuPage = menu?.type === 'page' ? pageBySlug.get(menu.slug) : undefined
    const menuCategory =
        menu?.type === 'category'
            ? navigation.categories.find((category) => category.id === menu.categoryId)
            : undefined

    function navigateFromSidebar(slug: string, nextCategoryId: string | null = null) {
        setMobileMenuOpen(false)
        onNavigate(slug, nextCategoryId)
    }

    function navigateCategoryFromSidebar(nextCategoryId: string) {
        setMobileMenuOpen(false)
        onNavigateCategory(nextCategoryId)
    }

    function openTrashFromSidebar() {
        setMobileMenuOpen(false)
        onOpenTrash()
    }

    function navigateHomeCategory() {
        const homeCategory = navigation.categories.find((category) => category.title.trim() === '대문')
        setMobileMenuOpen(false)
        if (homeCategory) {
            onNavigateCategory(homeCategory.documentSlug ?? homeCategory.id)
            return
        }
        onNavigate(brand.defaultSlug, null)
    }

    return (
        <aside
            className={`wiki-sidebar ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}
            aria-label="위키 문서"
            aria-busy={actionPending}
        >
            <div className="brand">
                <button
                    type="button"
                    className="brand-logo"
                    onClick={navigateHomeCategory}
                    aria-label="대문 카테고리로 이동"
                >
                    <img src={brand.logoUrl} alt={brand.logoAlt} />
                </button>
                <span className="brand-copy">
                    <strong className="brand-text">{brand.brandLabel}</strong>
                </span>
                <button
                    type="button"
                    className="mobile-navigation-toggle"
                    aria-expanded={mobileMenuOpen}
                    aria-controls="wiki-navigation-list"
                    aria-label={mobileMenuOpen ? '문서 메뉴 닫기' : '문서 메뉴 열기'}
                    onClick={() => setMobileMenuOpen((open) => !open)}
                >
                    {mobileMenuOpen ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
                </button>
            </div>

            {actionError ? (
                <div className="wiki-alert-banner" role="alert">
                    <span>{actionError}</span>
                    <div className="wiki-alert-actions">
                        <button type="button" onClick={clearError}>
                            닫기
                        </button>
                    </div>
                </div>
            ) : null}

            <nav
                id="wiki-navigation-list"
                className="page-list"
                aria-label="문서 목록"
                onDragOver={(event) => containerDragOver(event, null)}
                onDrop={drop}
            >
                {navigation.categories.map((category) => {
                    const categoryPages = category.pageSlugs
                        .map((slug) => pageBySlug.get(slug))
                        .filter((page): page is WikiPageDto => Boolean(page))
                    const categoryClass = [
                        'page-category',
                        dragItem?.type === 'category' && dragItem.categoryId === category.id ? 'dragging' : '',
                        dropTarget?.type === 'page-container' && dropTarget.categoryId === category.id
                            ? 'drop-into'
                            : ''
                    ]
                        .filter(Boolean)
                        .join(' ')
                    const headerClass = [
                        'page-category-header',
                        activeCategoryId === category.id ? 'active' : '',
                        category.collapsed ? 'collapsed' : '',
                        dropTarget?.type === 'category' && dropTarget.categoryId === category.id
                            ? `drop-${dropTarget.edge}`
                            : ''
                    ]
                        .filter(Boolean)
                        .join(' ')

                    return (
                        <div
                            className={categoryClass}
                            key={category.id}
                            onDragOver={(event) => categoryContainerDragOver(event, category.id)}
                            onDrop={drop}
                        >
                            <button
                                type="button"
                                className={headerClass}
                                draggable={canEdit}
                                onDragStart={(event) =>
                                    startDrag(event, {
                                        type: 'category',
                                        categoryId: category.id
                                    })
                                }
                                onDragEnd={finishDrag}
                                onDragOver={(event) => categoryDragOver(event, category.id)}
                                onDrop={drop}
                                onClick={() => navigateCategoryFromSidebar(category.documentSlug ?? category.id)}
                                onDoubleClick={(event) => {
                                    if (!canEdit) return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    runAction(() => renameCategory(category))
                                }}
                                onContextMenu={(event) => openCategoryMenu(event, category.id)}
                                aria-expanded={!category.collapsed}
                            >
                                <span className="page-category-icon" aria-hidden="true">
                                    {category.icon}
                                </span>
                                <span className="page-category-title">{category.title}</span>
                                <span
                                    className={`page-category-collapsed-mark ${category.collapsed ? 'collapsed' : 'expanded'}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={
                                        category.collapsed ? `${category.title} 펼치기` : `${category.title} 접기`
                                    }
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        dispatch({ type: 'toggle-category', categoryId: category.id })
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key !== 'Enter' && event.key !== ' ') return
                                        event.preventDefault()
                                        event.stopPropagation()
                                        dispatch({ type: 'toggle-category', categoryId: category.id })
                                    }}
                                >
                                    <ChevronDown aria-hidden="true" size={16} strokeWidth={2.2} />
                                </span>
                                {canEdit ? (
                                    <span
                                        className="page-category-add"
                                        role="button"
                                        title="문서 추가"
                                        aria-label={`${category.title}에 문서 추가`}
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            runAction(() => createPageInCategory(category.id))
                                        }}
                                    >
                                        <Plus aria-hidden="true" size={13} />
                                    </span>
                                ) : null}
                            </button>
                            {!category.collapsed
                                ? categoryPages.map((page) => (
                                      <PageListItem
                                          key={page.id}
                                          page={page}
                                          editable={canEdit}
                                          active={activeSlug === page.slug}
                                          favorite={favoriteSlugs.has(page.slug)}
                                          categoryId={category.id}
                                          dragItem={dragItem}
                                          dropTarget={dropTarget}
                                          onNavigate={navigateFromSidebar}
                                          onRename={() => runAction(() => renamePage(page))}
                                          onContextMenu={openPageMenu}
                                          onDragStart={startDrag}
                                          onDragEnd={finishDrag}
                                          onDragOver={pageDragOver}
                                          onDrop={drop}
                                      />
                                  ))
                                : null}
                        </div>
                    )
                })}

                {rootPages.map((page) => (
                    <PageListItem
                        key={page.id}
                        page={page}
                        editable={canEdit}
                        active={activeSlug === page.slug}
                        favorite={favoriteSlugs.has(page.slug)}
                        categoryId={null}
                        dragItem={dragItem}
                        dropTarget={dropTarget}
                        onNavigate={navigateFromSidebar}
                        onRename={() => runAction(() => renamePage(page))}
                        onContextMenu={openPageMenu}
                        onDragStart={startDrag}
                        onDragEnd={finishDrag}
                        onDragOver={pageDragOver}
                        onDrop={drop}
                    />
                ))}
                {pages.length === 0 && navigation.categories.length === 0 ? (
                    <span className="sidebar-empty">문서 없음</span>
                ) : null}
            </nav>

            {canEdit && createMode ? (
                <form
                    className="sidebar-inline-create"
                    onSubmit={(event) => {
                        event.preventDefault()
                        runAction(submitCreate)
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            setCreateMode(null)
                            setNewTitle('')
                        }
                    }}
                >
                    <input
                        value={newTitle}
                        onChange={(event) => setNewTitle(event.target.value)}
                        placeholder="카테고리 이름"
                        aria-label="카테고리 이름"
                        autoFocus
                    />
                </form>
            ) : canEdit ? (
                <button type="button" className="page-list-add" onClick={() => startCreate({ kind: 'category' })}>
                    <Plus aria-hidden="true" size={16} /> 카테고리 추가
                </button>
            ) : null}

            <div className="theme-switcher" role="group" aria-label="화면 테마">
                <button
                    type="button"
                    className={`theme-button ${navigation.theme === 'light' ? 'active' : ''}`}
                    aria-pressed={navigation.theme === 'light'}
                    onClick={() => dispatch({ type: 'set-theme', theme: 'light' })}
                >
                    <Sun aria-hidden="true" size={14} />
                    화이트
                </button>
                <button
                    type="button"
                    className={`theme-button ${navigation.theme === 'dark' ? 'active' : ''}`}
                    aria-pressed={navigation.theme === 'dark'}
                    onClick={() => dispatch({ type: 'set-theme', theme: 'dark' })}
                >
                    <Moon aria-hidden="true" size={14} />
                    블랙
                </button>
            </div>

            {canEdit ? (
                <button
                    type="button"
                    className={`sidebar-trash ${trashActive ? 'active' : ''} ${dropTarget?.type === 'trash' ? 'drop-target' : ''}`}
                    onClick={openTrashFromSidebar}
                    onDragOver={trashDragOver}
                    onDragLeave={trashDragLeave}
                    onDrop={dropOnTrash}
                    aria-pressed={trashActive}
                >
                    <Trash2 aria-hidden="true" size={16} />
                    <span>휴지통</span>
                    {trashCount > 0 ? <span className="sidebar-trash-count">{trashCount}</span> : null}
                </button>
            ) : null}

            {menu && (menuPage || menuCategory)
                ? createPortal(
                      <div
                          className="sidebar-context-menu"
                          style={{ left: menu.x, top: menu.y }}
                          role="menu"
                          aria-label={menu.type === 'page' ? '문서 작업' : '카테고리 작업'}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                      >
                          {menuPage ? (
                              <>
                                  <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                          dispatch({
                                              type: 'toggle-favorite',
                                              slug: menuPage.slug
                                          })
                                          setMenu(null)
                                      }}
                                  >
                                      <Star aria-hidden="true" size={16} />
                                      <span>
                                          {favoriteSlugs.has(menuPage.slug) ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
                                      </span>
                                  </button>
                                  <div className="sidebar-menu-separator" role="separator" />
                                  <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                          runAction(() =>
                                              navigator.clipboard.writeText(
                                                  `${window.location.origin}${pageHref(
                                                      menuPage.slug,
                                                      getPageCategoryRouteKey(navigation.categories, menuPage.slug)
                                                  )}`
                                              )
                                          )
                                          setMenu(null)
                                      }}
                                  >
                                      <LinkIcon aria-hidden="true" size={16} />
                                      <span>링크 복사</span>
                                  </button>
                                  {canEdit ? (
                                      <>
                                          <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => runAction(() => duplicatePage(menuPage))}
                                          >
                                              <Copy aria-hidden="true" size={16} />
                                              <span>복제</span>
                                          </button>
                                          <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => runAction(() => renamePage(menuPage))}
                                          >
                                              <PencilLine aria-hidden="true" size={16} />
                                              <span>이름 바꾸기</span>
                                          </button>
                                          <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => runAction(() => renamePageAddress(menuPage))}
                                          >
                                              <LinkIcon aria-hidden="true" size={16} />
                                              <span>주소명 바꾸기</span>
                                          </button>
                                          <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => runAction(() => trashPage(menuPage))}
                                          >
                                              <Trash2 aria-hidden="true" size={16} />
                                              <span>휴지통으로 이동</span>
                                          </button>
                                      </>
                                  ) : null}
                              </>
                          ) : menuCategory ? (
                              <>
                                  <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                          runAction(() =>
                                              navigator.clipboard.writeText(
                                                  `${window.location.origin}${categoryHref(menuCategory.documentSlug ?? menuCategory.id)}`
                                              )
                                          )
                                          setMenu(null)
                                      }}
                                  >
                                      <LinkIcon aria-hidden="true" size={16} />
                                      <span>링크 복사</span>
                                  </button>
                                  {canEdit ? (
                                      <>
                                          <div className="sidebar-menu-separator" role="separator" />
                                          <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => openCategoryIconPicker(menuCategory)}
                                          >
                                              <SmilePlus aria-hidden="true" size={16} />
                                              <span>이모지 설정</span>
                                          </button>
                                          <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => runAction(() => renameCategory(menuCategory))}
                                          >
                                              <PencilLine aria-hidden="true" size={16} />
                                              <span>이름 바꾸기</span>
                                          </button>
                                          {menuCategory.documentSlug ? (
                                              <button
                                                  type="button"
                                                  role="menuitem"
                                                  onClick={() => runAction(() => renameCategoryAddress(menuCategory))}
                                              >
                                                  <LinkIcon aria-hidden="true" size={16} />
                                                  <span>주소명 바꾸기</span>
                                              </button>
                                          ) : null}
                                          <div className="sidebar-menu-separator" role="separator" />
                                          <button
                                              type="button"
                                              role="menuitem"
                                              onClick={() => runAction(() => trashCategory(menuCategory))}
                                          >
                                              <Trash2 aria-hidden="true" size={16} />
                                              <span>휴지통으로 이동</span>
                                          </button>
                                      </>
                                  ) : null}
                              </>
                          ) : null}
                      </div>,
                      document.body
                  )
                : null}

            {categoryIconPicker
                ? createPortal(
                      <div
                          className="editor-icon-popover sidebar-category-icon-popover"
                          style={{ left: categoryIconPicker.x, top: categoryIconPicker.y }}
                          role="dialog"
                          aria-label="카테고리 이모지"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                      >
                          <div className="editor-emoji-picker editor-emoji-picker-compact">
                              <LazyEmojiPicker
                                  ariaLabel="카테고리 이모지 선택"
                                  searchPlaceholder="카테고리 이모지 검색"
                                  onEmojiClick={selectCategoryEmoji}
                              />
                          </div>
                          <div className="editor-icon-actions">
                              <button
                                  type="button"
                                  className="icon-clear-button"
                                  onClick={() => runAction(() => selectCategoryIcon(''))}
                                  title="이모지 지우기"
                                  aria-label="이모지 지우기"
                              >
                                  <Eraser aria-hidden="true" size={16} />
                                  <span>지우기</span>
                              </button>
                          </div>
                      </div>,
                      document.body
                  )
                : null}
        </aside>
    )
}

function getDropEdge(event: DragEvent<HTMLElement>): 'before' | 'after' {
    const rect = event.currentTarget.getBoundingClientRect()
    return getVerticalDropEdge(event.clientY, rect.top, rect.height)
}

function promptForAddress(label: string, currentSlug: string): string | null {
    const input = window.prompt(`${label} 주소명 (영문 소문자, 숫자, 하이픈)`, currentSlug)
    if (input === null) return null

    const slug = input.trim().toLowerCase().replace(/\s+/g, '-')
    if (!slug || slug === currentSlug) return null
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        window.alert('주소명은 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.')
        return null
    }
    return slug
}

function clampMenu(x: number, y: number): { x: number; y: number } {
    return {
        x: Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - MENU_WIDTH - MENU_MARGIN)),
        y: Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - MENU_HEIGHT - MENU_MARGIN))
    }
}

function clampCategoryIconPicker(x: number, y: number): { x: number; y: number } {
    return {
        x: Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - CATEGORY_ICON_PICKER_WIDTH - MENU_MARGIN)),
        y: Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - CATEGORY_ICON_PICKER_HEIGHT - MENU_MARGIN))
    }
}
