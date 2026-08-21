import type { LucideIcon } from 'lucide-react'

import type { HighlightBlockVariant, QuoteTone } from '@coconut-studio/wiki-markdown'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ColorSwatch = { value: string; className: string; label: string }
export type ContextMenuKind = 'editor' | 'table' | 'quote'
export type ContextMenuState = {
    kind: ContextMenuKind
    x: number
    y: number
    maxHeight: number
} | null
export type ContextSubmenuKind = 'highlight' | 'emoji' | 'more' | 'page-link' | 'table' | 'code-language'
export type ContextSubmenuState = {
    kind: ContextSubmenuKind
    x: number
    y: number
    maxHeight: number
} | null
export type ToolbarAction = {
    id: string
    label: string
    Icon: LucideIcon
    run: () => void
    submenu?: ContextSubmenuKind
    disabled?: boolean
    active?: boolean
}
export type ExtraMenuAction = {
    id: string
    label: string
    Icon: LucideIcon
    run: () => void
    submenu?: ContextSubmenuKind
    disabled?: boolean
    active?: boolean
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
export type CodeLanguageChoice = { label: string; value: string | null }
export type QuoteToneChoice = {
    tone: QuoteTone
    label: string
    className: string
}
export type WikiLinkCategory = {
    id: string
    title: string
    icon: string
    documentSlug?: string
}
