import { TableKit } from '@tiptap/extension-table'
import { Extension, type Editor } from '@tiptap/react'

import { normalizeTableHeaderBackground } from '@coconut-studio/wiki-markdown'

export const WikiTableKit = TableKit.configure({
    table: {
        resizable: true,
        handleWidth: 8,
        cellMinWidth: 64,
        lastColumnResizable: true
    }
})

export const WikiTableAttributes = Extension.create({
    name: 'wikiTableAttributes',
    addGlobalAttributes() {
        return [
            {
                types: ['table'],
                attributes: {
                    headerBackground: {
                        default: '',
                        parseHTML: (element) =>
                            normalizeTableHeaderBackground(element.getAttribute('data-header-background')),
                        renderHTML: (attributes) => {
                            const color = normalizeTableHeaderBackground(attributes.headerBackground)
                            return color
                                ? {
                                      'data-header-background': color,
                                      style: `--wiki-table-header-color: ${color}`
                                  }
                                : {}
                        }
                    }
                }
            }
        ]
    }
})

export function isActiveTableEmpty(editor: Editor): boolean {
    const { $from } = editor.state.selection

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth)
        if (node.type.name !== 'table') continue

        let empty = true
        node.descendants((descendant) => {
            if ((descendant.isText && descendant.text?.length) || (descendant.isLeaf && !descendant.isText)) {
                empty = false
                return false
            }
            return empty
        })
        return empty
    }

    return false
}

export const DeleteEmptyTableOnBackspace = Extension.create({
    name: 'deleteEmptyTableOnBackspace',
    addKeyboardShortcuts() {
        return {
            Backspace: () => isActiveTableEmpty(this.editor) && this.editor.commands.deleteTable()
        }
    }
})

type CollaborationUndoPluginState = {
    undoManager?: {
        stopCapturing(): void
    }
}

/** Keeps a table resize as its own Ctrl/Cmd+Z step in the collaboration history. */
export function separateTableResizeUndoStep(editor: Editor): boolean {
    for (const plugin of editor.state.plugins) {
        const pluginState = plugin.getState(editor.state) as CollaborationUndoPluginState | undefined
        if (!pluginState?.undoManager || typeof pluginState.undoManager.stopCapturing !== 'function') continue
        pluginState.undoManager.stopCapturing()
        return true
    }

    return false
}
