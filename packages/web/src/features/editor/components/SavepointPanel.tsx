import { History, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { WikiSavepointDto } from '@coconut-studio/wiki-contracts'

import type { SavepointState } from '../hooks/use-savepoints'

type SavepointPanelProps = {
    pageId: string
    savepoints: WikiSavepointDto[]
    state: SavepointState
    onCreate(): Promise<void>
    onRestore(savepointId: string): Promise<void>
    onRetry(): Promise<void>
}

export function SavepointPanel({ pageId, savepoints, state, onCreate, onRestore, onRetry }: SavepointPanelProps) {
    const [open, setOpen] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const busy = state === 'loading' || state === 'saving' || state === 'restoring'
    const selectedIndex = savepoints.findIndex((savepoint) => savepoint.id === selectedId)
    const selected = selectedIndex >= 0 ? savepoints[selectedIndex] : null
    const beforeMarkdown = selectedIndex >= 0 ? (savepoints[selectedIndex + 1]?.markdown ?? '') : ''
    const afterMarkdown = selected?.markdown ?? ''
    const uploadedImages = useMemo(
        () => findAddedImages(beforeMarkdown, afterMarkdown),
        [afterMarkdown, beforeMarkdown]
    )
    const changeSummary = useMemo(
        () => summarizeChanges(beforeMarkdown, afterMarkdown),
        [afterMarkdown, beforeMarkdown]
    )

    useEffect(() => {
        setOpen(false)
        setSelectedId(null)
    }, [pageId])

    useEffect(() => {
        if (!open || selectedId || !savepoints[0]) return
        setSelectedId(savepoints[0].id)
    }, [open, savepoints, selectedId])

    useEffect(() => {
        if (!open) return

        const closeOnPointerDown = (event: PointerEvent) => {
            if (panelRef.current?.contains(event.target as Node)) return
            setOpen(false)
        }
        const closeOnKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            setOpen(false)
        }

        window.addEventListener('pointerdown', closeOnPointerDown)
        window.addEventListener('keydown', closeOnKeyDown)
        return () => {
            window.removeEventListener('pointerdown', closeOnPointerDown)
            window.removeEventListener('keydown', closeOnKeyDown)
        }
    }, [open])

    return (
        <div className="savepoint-panel" ref={panelRef}>
            <button
                type="button"
                className="savepoint-toggle"
                aria-label="히스토리 열람"
                aria-controls="savepoint-popover"
                aria-expanded={open}
                title="히스토리 열람"
                onClick={() => setOpen((value) => !value)}
            >
                <History aria-hidden="true" size={27} strokeWidth={1.8} />
            </button>
            {open ? (
                <aside id="savepoint-popover" className="savepoint-popover" aria-label="문서 히스토리">
                    <div className="savepoint-popover-header">
                        <h2>히스토리</h2>
                        <button
                            type="button"
                            className="savepoint-close"
                            aria-label="히스토리 닫기"
                            title="닫기"
                            onClick={() => setOpen(false)}
                        >
                            <X aria-hidden="true" size={16} />
                        </button>
                    </div>
                    {state === 'error' ? (
                        <div className="savepoint-error" role="alert">
                            <strong>히스토리 작업에 실패했습니다.</strong>
                            <button type="button" onClick={() => void onRetry()}>
                                다시 시도
                            </button>
                        </div>
                    ) : null}
                    <div className="savepoint-actions">
                        <button type="button" disabled={busy} onClick={() => void onCreate()}>
                            지금 저장
                        </button>
                    </div>
                    {state === 'loading' ? <p className="savepoint-empty">불러오는 중...</p> : null}
                    {savepoints.length === 0 && state !== 'loading' ? (
                        <p className="savepoint-empty">저장된 히스토리가 없습니다.</p>
                    ) : null}
                    {savepoints.length > 0 ? (
                        <div className="savepoint-history-layout">
                            <div className="savepoint-list" aria-label="수정 시점">
                                {savepoints.map((savepoint) => {
                                    const title = formatSavepointTitle(savepoint.createdAt)
                                    return (
                                        <button
                                            key={savepoint.id}
                                            type="button"
                                            className={
                                                'savepoint-entry ' + (selectedId === savepoint.id ? 'is-selected' : '')
                                            }
                                            disabled={busy}
                                            aria-pressed={selectedId === savepoint.id}
                                            onClick={() => setSelectedId(savepoint.id)}
                                        >
                                            <time dateTime={savepoint.createdAt}>{title}</time>
                                            <small>{savepoint.createdBy}</small>
                                        </button>
                                    )
                                })}
                            </div>
                            {selected ? (
                                <section className="savepoint-detail" aria-label="수정 전후 비교">
                                    <div className="savepoint-detail-meta">
                                        <div>
                                            <strong>{selected.createdBy}</strong>
                                            <span>{formatSavepointTitle(selected.createdAt)} 수정</span>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                                if (
                                                    window.confirm(
                                                        '이 시점으로 문서를 복원할까요? 현재 내용도 먼저 보존됩니다.'
                                                    )
                                                ) {
                                                    void onRestore(selected.id)
                                                }
                                            }}
                                        >
                                            <RotateCcw aria-hidden="true" size={14} />
                                            복원
                                        </button>
                                    </div>
                                    <p className="savepoint-change-summary">
                                        추가 {changeSummary.added}줄 · 삭제 {changeSummary.removed}줄
                                    </p>
                                    {uploadedImages.length > 0 ? (
                                        <div className="savepoint-uploaded-images">
                                            <h3>이 계정이 추가한 사진</h3>
                                            <div>
                                                {uploadedImages.map((source) => (
                                                    <figure key={source}>
                                                        <img
                                                            src={source}
                                                            alt="히스토리에 추가된 이미지"
                                                            loading="lazy"
                                                        />
                                                        <figcaption>{source}</figcaption>
                                                    </figure>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="savepoint-no-images">이 수정에서 추가된 사진이 없습니다.</p>
                                    )}
                                    <div className="savepoint-diff">
                                        <section>
                                            <h3>Before</h3>
                                            <pre>{beforeMarkdown || '(이전 내용 없음)'}</pre>
                                        </section>
                                        <section>
                                            <h3>After</h3>
                                            <pre>{afterMarkdown || '(내용 없음)'}</pre>
                                        </section>
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    ) : null}
                </aside>
            ) : null}
        </div>
    )
}

function findAddedImages(before: string, after: string): string[] {
    const previous = new Set(extractMarkdownImages(before))
    return [...new Set(extractMarkdownImages(after).filter((source) => !previous.has(source)))]
}

function extractMarkdownImages(markdown: string): string[] {
    const sources: string[] = []
    const pattern = /!\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\)/g
    for (const match of markdown.matchAll(pattern)) {
        const source = match[1] ?? match[2]
        if (source) sources.push(source)
    }
    return sources
}

function summarizeChanges(before: string, after: string): { added: number; removed: number } {
    const beforeLines = before ? before.split('\n') : []
    const afterLines = after ? after.split('\n') : []
    let prefix = 0
    while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
        prefix += 1
    }
    let suffix = 0
    while (
        suffix < beforeLines.length - prefix &&
        suffix < afterLines.length - prefix &&
        beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
    ) {
        suffix += 1
    }
    return {
        added: Math.max(0, afterLines.length - prefix - suffix),
        removed: Math.max(0, beforeLines.length - prefix - suffix)
    }
}

function formatSavepointTitle(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.valueOf())) return value

    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const time = date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })
    return `${month}/${day} ${time}`
}
