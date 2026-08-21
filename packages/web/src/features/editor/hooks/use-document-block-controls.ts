import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'

export type BlockMoveDirection = 'up' | 'down'

export function moveTopLevelBlock(editor: Editor, blockIndex: number, direction: BlockMoveDirection): boolean {
    if (direction === 'up') return moveTopLevelBlockTo(editor, blockIndex, blockIndex - 1)
    return moveTopLevelBlockTo(editor, blockIndex, blockIndex + 1)
}

export function moveTopLevelBlockTo(editor: Editor, blockIndex: number, targetIndex: number): boolean {
    const { doc } = editor.state
    if (
        blockIndex < 0 ||
        blockIndex >= doc.childCount ||
        targetIndex < 0 ||
        targetIndex >= doc.childCount ||
        blockIndex === targetIndex
    ) {
        return false
    }

    const block = doc.child(blockIndex)
    let blockPosition = 0
    for (let index = 0; index < blockIndex; index += 1) blockPosition += doc.child(index).nodeSize

    const transaction = editor.state.tr.delete(blockPosition, blockPosition + block.nodeSize)
    let insertionPosition = 0
    for (let index = 0; index < targetIndex; index += 1) insertionPosition += transaction.doc.child(index).nodeSize
    transaction.insert(insertionPosition, block)
    transaction.setMeta('cardUserEdit', true)
    editor.view.dispatch(transaction)
    return true
}

export function selectTopLevelTable(editor: Editor, blockIndex: number): boolean {
    const { doc } = editor.state
    if (blockIndex < 0 || blockIndex >= doc.childCount || doc.child(blockIndex).type.name !== 'table') {
        return false
    }

    let blockPosition = 0
    for (let index = 0; index < blockIndex; index += 1) blockPosition += doc.child(index).nodeSize

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(doc, blockPosition)))
    return true
}

export function setTopLevelTableHeaderBackground(editor: Editor, blockIndex: number, color: string): boolean {
    const { doc } = editor.state
    if (blockIndex < 0 || blockIndex >= doc.childCount) return false
    const block = doc.child(blockIndex)
    if (block.type.name !== 'table') return false

    let blockPosition = 0
    for (let index = 0; index < blockIndex; index += 1) blockPosition += doc.child(index).nodeSize

    const transaction = editor.state.tr.setNodeMarkup(blockPosition, undefined, {
        ...block.attrs,
        headerBackground: color
    })
    transaction.setMeta('cardUserEdit', true)
    editor.view.dispatch(transaction)
    return true
}
