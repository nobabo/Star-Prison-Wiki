import type { MouseEvent } from 'react'

import type { ContextSubmenuKind, ToolbarAction } from '../editor-types'

type ContextMenuButtonProps = {
    action: ToolbarAction
    onToggleSubmenu?(kind: ContextSubmenuKind, event: MouseEvent<HTMLButtonElement>): void
}

export function ContextMenuButton({ action, onToggleSubmenu }: ContextMenuButtonProps) {
    return (
        <button
            type="button"
            role="menuitem"
            className={action.active ? 'active' : ''}
            onClick={(event) =>
                action.submenu && onToggleSubmenu ? onToggleSubmenu(action.submenu, event) : action.run()
            }
            disabled={action.disabled}
            title={action.label}
            aria-label={action.label}
            aria-haspopup={action.submenu ? 'menu' : undefined}
        >
            <action.Icon aria-hidden="true" size={16} />
        </button>
    )
}
