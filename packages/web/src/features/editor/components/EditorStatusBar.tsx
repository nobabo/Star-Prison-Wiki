import type { Editor } from '@tiptap/react'
import { Redo2, Undo2 } from 'lucide-react'

import type { WikiLocalDraft } from '../../../shared/storage/local-draft'
import type { SaveState } from '../editor-types'
import { formatDraftTime, saveLabel } from '../lib/editor-utils'

type EditorStatusBarProps = {
    editor: Editor | null
    saveState: SaveState
    pendingDraft: WikiLocalDraft | null
    onUndo(): void
    onRedo(): void
    onRestoreDraft(): void
    onDiscardDraft(): void
}

export function EditorStatusBar(props: EditorStatusBarProps) {
    const { editor, saveState, pendingDraft, onUndo, onRedo, onRestoreDraft, onDiscardDraft } = props
    return (
        <>
            <div className="editor-status-actions">
                <div className="editor-history-actions" aria-label="편집 기록">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!editor?.can().undo()}
                        title="실행 취소 (Ctrl+Z)"
                        aria-label="실행 취소"
                    >
                        <Undo2 aria-hidden="true" size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!editor?.can().redo()}
                        title="다시 실행 (Ctrl+Y)"
                        aria-label="다시 실행"
                    >
                        <Redo2 aria-hidden="true" size={15} />
                    </button>
                </div>
                <div
                    className={`save-indicator ${saveState}`}
                    role="status"
                    aria-live="polite"
                    title={saveLabel(saveState)}
                >
                    <span className="save-dot" />
                    <span>{saveLabel(saveState)}</span>
                </div>
            </div>
            {pendingDraft ? (
                <div className="local-draft-banner" role="status">
                    <div>
                        <strong>로컬 임시 초안이 있습니다.</strong>
                        <span>{formatDraftTime(pendingDraft.updatedAt)}에 저장된 내용을 복구할 수 있습니다.</span>
                    </div>
                    <div className="local-draft-actions">
                        <button type="button" onClick={onRestoreDraft}>
                            복구
                        </button>
                        <button type="button" onClick={onDiscardDraft}>
                            삭제
                        </button>
                    </div>
                </div>
            ) : null}
        </>
    )
}
