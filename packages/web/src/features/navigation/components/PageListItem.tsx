import type { DragEvent, MouseEvent } from 'react'
import { FileText, Lock, Star } from 'lucide-react'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

import type { SidebarDragItem, SidebarDropTarget } from '../types'

type PageListItemProps = {
    page: WikiPageDto
    editable: boolean
    active: boolean
    favorite: boolean
    categoryId: string | null
    dragItem: SidebarDragItem | null
    dropTarget: SidebarDropTarget | null
    onNavigate(slug: string): void
    onContextMenu(event: MouseEvent, slug: string): void
    onDragStart(event: DragEvent<HTMLElement>, item: SidebarDragItem): void
    onDragEnd(): void
    onDragOver(event: DragEvent<HTMLElement>, categoryId: string | null, slug: string): void
    onDrop(event: DragEvent<HTMLElement>): void
}

export function PageListItem(props: PageListItemProps) {
    const {
        page,
        editable,
        active,
        favorite,
        categoryId,
        dragItem,
        dropTarget,
        onNavigate,
        onContextMenu,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDrop
    } = props
    const className = [
        active ? 'active' : '',
        favorite ? 'favorite' : '',
        categoryId ? 'page-list-child' : '',
        dragItem?.type === 'page' && dragItem.slug === page.slug ? 'dragging' : '',
        dropTarget?.type === 'page' && dropTarget.slug === page.slug && dropTarget.categoryId === categoryId
            ? `drop-${dropTarget.edge}`
            : ''
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <button
            type="button"
            className={className}
            draggable={editable}
            onDragStart={(event) => onDragStart(event, { type: 'page', slug: page.slug })}
            onDragEnd={onDragEnd}
            onDragOver={(event) => onDragOver(event, categoryId, page.slug)}
            onDrop={onDrop}
            onClick={() => onNavigate(page.slug)}
            onContextMenu={(event) => onContextMenu(event, page.slug)}
        >
            <span className="page-list-doc-icon" aria-hidden="true">
                {page.icon ? <span>{page.icon}</span> : <FileText size={15} />}
            </span>
            <span className="page-list-title">{page.title}</span>
            {favorite ? <Star aria-hidden="true" size={13} /> : null}
            {page.visibility === 'private' ? <Lock aria-hidden="true" size={14} /> : null}
        </button>
    )
}
