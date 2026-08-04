import type { WikiSavepointDto } from '@coconut-studio/wiki-contracts'

import type { SavepointState } from '../hooks/use-savepoints'

type SavepointPanelProps = {
    savepoints: WikiSavepointDto[]
    state: SavepointState
    onCreate(): Promise<void>
    onRestore(savepointId: string): Promise<void>
    onRetry(): Promise<void>
}

export function SavepointPanel({ savepoints, state, onCreate, onRestore, onRetry }: SavepointPanelProps) {
    const busy = state === 'loading' || state === 'saving' || state === 'restoring'
    return (
        <details className="local-draft-banner">
            <summary>세이브포인트 · 10분 자동 저장</summary>
            <div>
                {state === 'error' ? (
                    <div className="local-draft-actions">
                        <strong>세이브포인트 작업에 실패했습니다.</strong>
                        <button type="button" onClick={() => void onRetry()}>
                            다시 시도
                        </button>
                    </div>
                ) : null}
                <div className="local-draft-actions">
                    <button type="button" disabled={busy} onClick={() => void onCreate()}>
                        지금 저장
                    </button>
                </div>
                {savepoints.length === 0 && state !== 'loading' ? <p>저장된 세이브포인트가 없습니다.</p> : null}
                {savepoints.map((savepoint) => (
                    <div key={savepoint.id} className="local-draft-actions">
                        <span>
                            {formatDate(savepoint.createdAt)} · {savepoint.createdBy}
                        </span>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                if (
                                    window.confirm('이 세이브포인트로 문서를 복원할까요? 현재 내용도 먼저 보존됩니다.')
                                ) {
                                    void onRestore(savepoint.id)
                                }
                            }}
                        >
                            복원
                        </button>
                    </div>
                ))}
            </div>
        </details>
    )
}

function formatDate(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('ko-KR')
}
