export type SidebarMenu =
    | { type: 'page'; slug: string; x: number; y: number }
    | { type: 'category'; categoryId: string; x: number; y: number }
    | null

export type SidebarCategory = {
    id: string
    title: string
    icon: string
    documentSlug?: string
    pageSlugs: string[]
    collapsed: boolean
}

export type SidebarDragItem = { type: 'page'; slug: string } | { type: 'category'; categoryId: string }
export type SidebarDropTarget =
    | { type: 'page'; slug: string; categoryId: string | null; edge: 'before' | 'after' }
    | { type: 'page-container'; categoryId: string | null }
    | { type: 'category'; categoryId: string; edge: 'before' | 'after' }
    | { type: 'trash' }
