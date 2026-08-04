import type { LucideIcon } from 'lucide-react'

import type { HighlightBlockVariant } from '@coconut-studio/wiki-markdown'

export type SaveState = 'idle' | 'saving' | 'saved' | 'local' | 'error'
export type ColorSwatch = { value: string; className: string; label: string }
export type ContextMenuState = { x: number; y: number; maxHeight: number } | null
export type ContextSubmenuKind = 'highlight' | 'emoji' | 'more' | 'page-link'
export type ContextSubmenuState = { kind: ContextSubmenuKind; x: number; y: number; maxHeight: number } | null
export type ToolbarAction = { id: string; label: string; Icon: LucideIcon; run: () => void; active?: boolean }
export type ExtraMenuAction = {
    id: string
    label: string
    Icon: LucideIcon
    run: () => void
    submenu?: ContextSubmenuKind
    disabled?: boolean
}
export type HighlightPreset = {
    id: string
    label: string
    description: string
    variant: HighlightBlockVariant
    Icon: LucideIcon
    content: Array<Record<string, unknown>>
}
export type HighlightWidthChoice = { label: string; width: string }
