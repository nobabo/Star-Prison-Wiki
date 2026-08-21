import { Search, ShieldCheck, Shuffle } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { WikiPageDto, WikiPageSearchResultDto, WikiSearchMatch } from '@coconut-studio/wiki-contracts'

import { searchWikiPages, type ApiClient } from '../../../shared/api/wiki-api'
import { CollaborationAvatarStack, type EditorCollaborator } from './EditorPresence'

type EditorTopBarProps = {
    client: ApiClient
    editable: boolean
    pages: WikiPageDto[]
    currentSlug: string
    collaborators?: EditorCollaborator[]
    pageHrefForSlug?: (slug: string) => string
}

const SEARCH_MATCH_LABEL: Record<WikiSearchMatch, string> = {
    'title-exact': '제목 일치',
    'title-contains': '제목 포함',
    'content-exact': '본문 문구 일치',
    'content-contains': '본문 키워드 포함'
}

export function EditorTopBar({
    client,
    editable,
    pages,
    currentSlug,
    collaborators = [],
    pageHrefForSlug = (slug) => `/wiki/${encodeURIComponent(slug)}`
}: EditorTopBarProps) {
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [matchingPages, setMatchingPages] = useState<WikiPageSearchResultDto[]>([])
    const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

    useEffect(() => {
        const query = searchQuery.trim()
        if (!query) {
            setMatchingPages([])
            setSearchStatus('idle')
            return
        }

        const controller = new AbortController()
        setMatchingPages([])
        setSearchStatus('loading')
        const timer = window.setTimeout(() => {
            void searchWikiPages(client, query, controller.signal)
                .then(({ results }) => {
                    setMatchingPages(results)
                    setSearchStatus('ready')
                })
                .catch((error: unknown) => {
                    if (error instanceof Error && error.name === 'AbortError') return
                    console.error(error)
                    setMatchingPages([])
                    setSearchStatus('error')
                })
        }, 180)

        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [client, searchQuery])

    useEffect(() => {
        const focusSearch = (event: globalThis.KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
                event.preventDefault()
                searchInputRef.current?.focus()
            }
        }

        window.addEventListener('keydown', focusSearch)
        return () => window.removeEventListener('keydown', focusSearch)
    }, [])

    function navigateToPage(slug: string) {
        window.history.pushState(null, '', pageHrefForSlug(slug))
        window.dispatchEvent(new PopStateEvent('popstate'))
        setSearchQuery('')
        setSearchFocused(false)
    }

    function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const firstMatch = matchingPages[0]
        if (firstMatch) navigateToPage(firstMatch.page.slug)
    }

    function chooseRandomPage() {
        const candidates = pages.filter((page) => page.slug !== currentSlug)
        const pool = candidates.length > 0 ? candidates : pages
        const randomPage = pool[Math.floor(Math.random() * pool.length)]
        if (randomPage) navigateToPage(randomPage.slug)
    }

    return (
        <div className={`editor-topbar${editable ? '' : ' editor-topbar--readonly'}`}>
            <form
                className="editor-search-form"
                role="search"
                onSubmit={submitSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            >
                <div className="editor-search-control">
                    <Search aria-hidden="true" size={19} />
                    <input
                        ref={searchInputRef}
                        className="editor-search-input"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="검색하기"
                        aria-label="검색하기"
                        aria-controls="editor-search-results"
                        aria-expanded={searchFocused && searchQuery.trim().length > 0}
                        autoComplete="off"
                    />
                    <kbd className="editor-search-shortcut">Ctrl G</kbd>
                </div>
                {searchFocused && searchQuery.trim() ? (
                    <div id="editor-search-results" className="editor-search-results">
                        {searchStatus === 'loading' ? (
                            <p className="editor-search-empty" role="status">
                                검색 중…
                            </p>
                        ) : matchingPages.length > 0 ? (
                            matchingPages.map(({ page, match }) => (
                                <button
                                    key={page.id}
                                    type="button"
                                    className="editor-search-result"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => navigateToPage(page.slug)}
                                >
                                    <span className="editor-search-result-icon">{page.icon || '📄'}</span>
                                    <span className="editor-search-result-copy">
                                        <strong>{page.title}</strong>
                                        <small>
                                            /{page.slug} · {SEARCH_MATCH_LABEL[match]}
                                        </small>
                                    </span>
                                </button>
                            ))
                        ) : (
                            <p className="editor-search-empty" role="status">
                                {searchStatus === 'error' ? '검색 중 오류가 발생했습니다.' : '검색 결과가 없습니다.'}
                            </p>
                        )}
                    </div>
                ) : null}
            </form>

            <div className="editor-topbar-actions">
                <button
                    type="button"
                    className="editor-topbar-action"
                    onClick={chooseRandomPage}
                    disabled={pages.length === 0}
                >
                    <Shuffle aria-hidden="true" size={18} />
                    <span>랜덤 페이지</span>
                </button>
                {editable ? <CollaborationAvatarStack collaborators={collaborators} /> : null}
                {editable ? (
                    <span className="editor-topbar-mode" aria-label="관리자 편집 모드">
                        <ShieldCheck aria-hidden="true" size={18} />
                        <span>편집 모드</span>
                    </span>
                ) : null}
            </div>
        </div>
    )
}
