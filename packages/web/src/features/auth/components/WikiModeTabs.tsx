import { BookOpen, PencilLine } from 'lucide-react'

export type WikiMode = 'read' | 'edit'

type WikiModeTabsProps = {
    mode: WikiMode
    canEdit: boolean
    onChange(mode: WikiMode): void
}

export function WikiModeTabs({ mode, canEdit, onChange }: WikiModeTabsProps) {
    const activeMode = canEdit ? mode : 'read'

    return (
        <nav className="wiki-mode-tabs" aria-label="위키 화면" role="tablist">
            <button
                type="button"
                className={`wiki-mode-tab ${activeMode === 'read' ? 'active' : ''}`}
                role="tab"
                aria-selected={activeMode === 'read'}
                onClick={() => onChange('read')}
            >
                <BookOpen aria-hidden="true" size={16} />
                <span>일반 위키</span>
            </button>
            {canEdit ? (
                <button
                    type="button"
                    className={`wiki-mode-tab ${activeMode === 'edit' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeMode === 'edit'}
                    onClick={() => onChange('edit')}
                >
                    <PencilLine aria-hidden="true" size={16} />
                    <span>수정</span>
                </button>
            ) : null}
        </nav>
    )
}
