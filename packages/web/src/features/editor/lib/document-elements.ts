import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'

export const DOCUMENT_ELEMENT_NODE_NAMES = new Set([
    'wikiHighlightBlock',
    'blockquote',
    'table',
    'image',
    'codeBlock',
    'horizontalRule',
    'bulletList',
    'orderedList'
])

export type EditorRange = { from: number; to: number }

export function isDocumentElementNode(node: ProseMirrorNode): boolean {
    return DOCUMENT_ELEMENT_NODE_NAMES.has(node.type.name)
}

/**
 * Returns the position immediately after the outer document block when the
 * selection is inside an independent element. Callers can insert there rather
 * than letting ProseMirror place another element inside the current one.
 */
export function getContainingDocumentElementEnd(editor: Editor, requestedRange?: EditorRange): number | null {
    const selection = editor.state.selection
    const range = requestedRange ?? selection
    const docSize = editor.state.doc.content.size
    const positions = [range.from]
    if (range.to > range.from) positions.push(range.to - 1)

    let boundary: number | null = null
    for (const requestedPosition of positions) {
        const position = Math.max(0, Math.min(requestedPosition, docSize))
        const resolved = editor.state.doc.resolve(position)
        const isInsideElement = Array.from({ length: resolved.depth }, (_, index) => index + 1).some((depth) =>
            isDocumentElementNode(resolved.node(depth))
        )
        if (isInsideElement) boundary = Math.max(boundary ?? 0, resolved.after(1))
    }

    if (
        boundary === null &&
        selection instanceof NodeSelection &&
        range.from === selection.from &&
        range.to === selection.to &&
        isDocumentElementNode(selection.node)
    ) {
        boundary = selection.to
    }

    return boundary
}

export function countNestedDocumentElements(doc: ProseMirrorNode): number {
    let nestedCount = 0

    const visit = (node: ProseMirrorNode, insideElement: boolean) => {
        const isElement = isDocumentElementNode(node)
        if (insideElement && isElement) nestedCount += 1
        node.forEach((child) => visit(child, insideElement || isElement))
    }

    visit(doc, false)
    return nestedCount
}
