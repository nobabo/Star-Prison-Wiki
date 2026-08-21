import { FileText, RotateCcw, Trash2 } from 'lucide-react'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import { useAsyncAction } from '../../../shared/hooks/use-async-action'

export type TrashLoadStatus = 'loading' | 'ready' | 'error'

type TrashViewProps = {
    status: TrashLoadStatus
    pages: WikiPageDto[]
    onRestore(pageId: string): Promise<void>
    onPurge(page: WikiPageDto): Promise<void>
    onPurgeAll(): Promise<void>
    onClose(): void
}

export function TrashView({ status, pages, onRestore, onPurge, onPurgeAll, onClose }: TrashViewProps) {
    const { run, pending, error, clearError } = useAsyncAction()
    return (
        <div className="trash-view" aria-busy={pending}>
            <header className="trash-header">
                <div className="trash-title">
                    <Trash2 aria-hidden="true" size={20} />
                    <h1>휴지통</h1>
                </div>
                <div className="trash-header-actions">
                    <button
                        type="button"
                        className="trash-action purge purge-all"
                        onClick={() => run(onPurgeAll)}
                        disabled={pending || status !== 'ready' || pages.length === 0}
                    >
                        <Trash2 aria-hidden="true" size={14} />
                        <span>전체 삭제</span>
                    </button>
                    <button type="button" className="trash-close" onClick={onClose} aria-label="휴지통 닫기">
                        닫기
                    </button>
                </div>
            </header>

            {error ? (
                <div className="wiki-alert-banner" role="alert">
                    <span>{error}</span>
                    <div className="wiki-alert-actions">
                        <button type="button" onClick={clearError}>
                            닫기
                        </button>
                    </div>
                </div>
            ) : null}

            {status === 'loading' ? <div className="state-panel">불러오는 중</div> : null}
            {status === 'error' ? <div className="state-panel">휴지통을 불러오지 못했습니다.</div> : null}
            {status === 'ready' && pages.length === 0 ? (
                <div className="state-panel">휴지통이 비어 있습니다.</div>
            ) : null}

            {status === 'ready' && pages.length > 0 ? (
                <ul className="trash-list">
                    {pages.map((page) => (
                        <li key={page.id} className="trash-item">
                            <div className="trash-item-main">
                                <span className="trash-item-icon" aria-hidden="true">
                                    {page.icon ? <span>{page.icon}</span> : <FileText size={16} />}
                                </span>
                                <div className="trash-item-text">
                                    <span className="trash-item-title">{page.title}</span>
                                    <span className="trash-item-meta">
                                        {page.deletedAt ? `삭제됨 ${formatTrashDate(page.deletedAt)}` : ''}
                                    </span>
                                </div>
                            </div>
                            <div className="trash-item-actions">
                                <button
                                    type="button"
                                    className="trash-action restore"
                                    disabled={pending}
                                    onClick={() => run(() => onRestore(page.id))}
                                >
                                    <RotateCcw aria-hidden="true" size={14} />
                                    <span>복원</span>
                                </button>
                                <button
                                    type="button"
                                    className="trash-action purge"
                                    disabled={pending}
                                    onClick={() => run(() => onPurge(page))}
                                >
                                    <Trash2 aria-hidden="true" size={14} />
                                    <span>완전 삭제</span>
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

function formatTrashDate(iso: string): string {
    const date = new Date(iso)
    return Number.isNaN(date.valueOf())
        ? iso
        : date.toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
          })
}
