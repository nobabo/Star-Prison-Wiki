import { Search, ShieldCheck, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

type EditorTopBarProps = {
    pages: WikiPageDto[]
    currentSlug: string
}

export function EditorTopBar({ pages, currentSlug }: EditorTopBarProps) {
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const matchingPages = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
        if (!normalizedQuery) return []

        return pages
            .filter((page) => `${page.title} ${page.slug}`.toLocaleLowerCase().includes(normalizedQuery))
            .slice(0, 6)
    }, [pages, searchQuery])

    useEffect(() => {
        const focusSearch = (event: globalThis.KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault()
                searchInputRef.current?.focus()
            }
        }

        window.addEventListener('keydown', focusSearch)
        return () => window.removeEventListener('keydown', focusSearch)
    }, [])

    function navigateToPage(slug: string) {
        window.history.pushState(null, '', `/wiki/${encodeURIComponent(slug)}`)
        window.dispatchEvent(new PopStateEvent('popstate'))
        setSearchQuery('')
        setSearchFocused(false)
    }

    function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const firstMatch = matchingPages[0]
        if (firstMatch) navigateToPage(firstMatch.slug)
    }

    function chooseRandomPage() {
        const candidates = pages.filter((page) => page.slug !== currentSlug)
        const pool = candidates.length > 0 ? candidates : pages
        const randomPage = pool[Math.floor(Math.random() * pool.length)]
        if (randomPage) navigateToPage(randomPage.slug)
    }

    return (
        <div className="editor-topbar">
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
                    <kbd className="editor-search-shortcut">Ctrl K</kbd>
                </div>
                {searchFocused && searchQuery.trim() ? (
                    <div id="editor-search-results" className="editor-search-results">
                        {matchingPages.length > 0 ? (
                            matchingPages.map((page) => (
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
                                        <small>/{page.slug}</small>
                                    </span>
                                </button>
                            ))
                        ) : (
                            <p className="editor-search-empty">검색 결과가 없습니다.</p>
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
                <span className="editor-topbar-mode" aria-label="관리자 편집 모드">
                    <ShieldCheck aria-hidden="true" size={18} />
                    <span>편집 모드</span>
                </span>
            </div>
        </div>
    )
}
