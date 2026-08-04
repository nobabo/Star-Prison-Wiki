import type { Editor } from '@tiptap/react'

import type { HighlightPreset, SaveState } from '../editor-types'

export function createHighlightBlockContent(
    editor: Editor,
    preset: HighlightPreset,
    range?: { from: number; to: number }
): Array<Record<string, unknown>> {
    const selection = range ?? editor.state.selection
    const selectedText =
        selection.from === selection.to ? '' : editor.state.doc.textBetween(selection.from, selection.to, '\n').trim()
    if (!selectedText) return preset.content
    return selectedText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))
}

export function getEditorSelectionRect(editor: Editor): DOMRect | null {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
    if (!editor.view.dom.contains(selection.anchorNode) || !editor.view.dom.contains(selection.focusNode)) return null
    const range = selection.getRangeAt(0)
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
    return rects[0] ?? range.getBoundingClientRect()
}

export function getCurrentBlockValue(editor: Editor | null): string {
    if (!editor) return 'paragraph'
    if (editor.isActive('heading', { level: 1 })) return 'h1'
    if (editor.isActive('heading', { level: 2 })) return 'h2'
    if (editor.isActive('heading', { level: 3 })) return 'h3'
    return 'paragraph'
}

export function saveLabel(saveState: SaveState): string {
    return {
        idle: '대기',
        saving: '저장 중',
        saved: '저장됨',
        local: '로컬 저장',
        error: '저장 실패'
    }[saveState]
}

export function formatDraftTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '이전'
    return new Intl.DateTimeFormat('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date)
}

export function normalizePageIcon(value: string): string | null {
    const icon = Array.from(value.trim()).slice(0, 2).join('')
    return icon || null
}
