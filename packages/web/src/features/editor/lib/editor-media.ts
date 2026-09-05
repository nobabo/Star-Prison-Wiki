import type { Editor, JSONContent } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'

import { getImageUploadMimeType, uploadWikiImage, type ApiClient } from '../../../shared/api/wiki-api'

export const EDITOR_IMAGE_FILES_EVENT = 'wiki-editor:image-files'
export const TABLE_CLIPBOARD_TYPE = 'application/x-star-prison-table+json'

export type EditorImageFilesDetail = {
    files: File[]
    position?: number
}

export function getImageFiles(items: DataTransferItemList | null, files: FileList | null): File[] {
    const itemFiles = Array.from(items ?? [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))
    return (itemFiles.length > 0 ? itemFiles : Array.from(files ?? [])).filter(
        (file) => getImageUploadMimeType(file) !== null
    )
}

export function getDroppedImageFiles(
    editor: Pick<Editor, 'view'>,
    items: DataTransferItemList | null,
    files: FileList | null
): File[] {
    if (editor.view.dragging) return []
    return getImageFiles(items, files)
}

export function deleteSelectedImage(editor: Editor): boolean {
    const { selection } = editor.state
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return false
    return editor.commands.deleteSelection()
}

export function deleteEmptyParagraphAfterImage(editor: Editor): boolean {
    const { selection } = editor.state
    if (!selection.empty || selection.$from.depth !== 1) return false

    const { $from } = selection
    if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0 || $from.parentOffset !== 0) {
        return false
    }

    const paragraphIndex = $from.index(0)
    if (paragraphIndex === 0) return false
    const previousNode = $from.node(0).child(paragraphIndex - 1)
    if (previousNode.type.name !== 'image') return false

    const paragraphPosition = $from.before(1)
    const imagePosition = paragraphPosition - previousNode.nodeSize
    const transaction = editor.state.tr.delete(paragraphPosition, paragraphPosition + $from.parent.nodeSize)
    transaction.setSelection(NodeSelection.create(transaction.doc, imagePosition))
    editor.view.dispatch(transaction)
    return true
}

export async function uploadAndInsertImages(
    editor: Editor,
    client: ApiClient,
    files: File[],
    pageId: string,
    requestedPosition?: number
): Promise<void> {
    const images: JSONContent[] = []
    for (const file of files) {
        const { url } = await uploadWikiImage(client, file, pageId)
        images.push({ type: 'image', attrs: { src: url, alt: file.name } })
    }
    if (images.length === 0) return

    insertImageBlocks(editor, images, requestedPosition)
}

export function imageBlocksWithTrailingParagraphs(images: JSONContent[]): JSONContent[] {
    return images.flatMap((image) => [image, { type: 'paragraph' }])
}

export function insertImageBlocks(editor: Editor, images: JSONContent[], requestedPosition?: number): void {
    const position = topLevelPosition(editor, requestedPosition ?? editor.state.selection.from)
    editor.chain().focus().insertContentAt(position, imageBlocksWithTrailingParagraphs(images)).run()
}

export function copyActiveTable(editor: Editor, clipboard: DataTransfer, cut: boolean): boolean {
    const active = getActiveTable(editor)
    if (!active) return false

    clipboard.setData(TABLE_CLIPBOARD_TYPE, JSON.stringify(active.node.toJSON()))
    clipboard.setData('text/plain', tableAsTsv(active.node.toJSON()))
    if (cut) {
        const transaction = editor.state.tr
            .delete(active.position, active.position + active.node.nodeSize)
            .setMeta('cardUserEdit', true)
        editor.view.dispatch(transaction)
    }
    return true
}

export function pasteCopiedTable(editor: Editor, clipboard: DataTransfer): boolean {
    const encoded = clipboard.getData(TABLE_CLIPBOARD_TYPE)
    if (!encoded) return false

    try {
        const table = JSON.parse(encoded) as JSONContent
        if (table.type !== 'table') return false
        editor.chain().focus().insertContentAt(topLevelPosition(editor, editor.state.selection.from), table).run()
        return true
    } catch {
        return false
    }
}

function getActiveTable(editor: Editor) {
    const { selection } = editor.state
    if (selection instanceof NodeSelection && selection.node.type.name === 'table') {
        return { node: selection.node, position: selection.from }
    }
    if (!selection.empty) return null

    const { $from } = selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth)
        if (node.type.name === 'table') return { node, position: $from.before(depth) }
    }
    return null
}

function topLevelPosition(editor: Editor, requestedPosition: number): number {
    const position = Math.max(0, Math.min(requestedPosition, editor.state.doc.content.size))
    const resolved = editor.state.doc.resolve(position)
    return resolved.depth === 0 ? position : resolved.after(1)
}

function tableAsTsv(table: JSONContent): string {
    return (table.content ?? [])
        .map((row) => (row.content ?? []).map((cell) => textContent(cell)).join('\t'))
        .join('\n')
}

function textContent(node: JSONContent): string {
    if (typeof node.text === 'string') return node.text
    return (node.content ?? []).map(textContent).join('')
}
