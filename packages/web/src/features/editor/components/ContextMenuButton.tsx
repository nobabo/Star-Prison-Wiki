import type { ToolbarAction } from '../editor-types'

export function ContextMenuButton({ action }: { action: ToolbarAction }) {
    return (
        <button
            type="button"
            role="menuitem"
            className={action.active ? 'active' : ''}
            onClick={action.run}
            title={action.label}
            aria-label={action.label}
        >
            <action.Icon aria-hidden="true" size={16} />
        </button>
    )
}
