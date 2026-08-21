import type { Editor } from '@tiptap/react'
import { Redo2, Undo2 } from 'lucide-react'

import type { SaveState } from '../editor-types'
import { saveLabel } from '../lib/editor-utils'

type EditorStatusBarProps = {
    editor: Editor | null
    saveState: SaveState
    onUndo(): void
    onRedo(): void
}

export function EditorStatusBar(props: EditorStatusBarProps) {
    const { editor, saveState, onUndo, onRedo } = props
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
        </>
    )
}
