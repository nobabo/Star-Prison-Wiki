import { Extension } from '@tiptap/react'

const EDITOR_TAB_SPACES = '\u00a0'.repeat(4)

export const InsertSpacesOnTab = Extension.create({
    name: 'insertSpacesOnTab',
    addKeyboardShortcuts() {
        return { Tab: () => this.editor.commands.insertContent(EDITOR_TAB_SPACES) }
    }
})

type ParagraphFirstSelectAllStorage = { paragraphFrom: number | null; paragraphTo: number | null }

export const ParagraphFirstSelectAll = Extension.create<Record<string, never>, ParagraphFirstSelectAllStorage>({
    name: 'paragraphFirstSelectAll',
    addStorage: () => ({ paragraphFrom: null, paragraphTo: null }),
    addKeyboardShortcuts() {
        return {
            'Mod-a': () => {
                const { selection } = this.editor.state
                const { $from } = selection
                let depth = $from.depth
                while (depth > 0 && !$from.node(depth).isTextblock) depth -= 1
                if (depth === 0) {
                    this.storage.paragraphFrom = null
                    this.storage.paragraphTo = null
                    return this.editor.commands.selectAll()
                }
                const from = $from.start(depth)
                const to = $from.end(depth)
                const secondPress =
                    this.storage.paragraphFrom === from &&
                    this.storage.paragraphTo === to &&
                    selection.from === from &&
                    selection.to === to
                if (secondPress) {
                    this.storage.paragraphFrom = null
                    this.storage.paragraphTo = null
                    return this.editor.commands.selectAll()
                }
                this.storage.paragraphFrom = from
                this.storage.paragraphTo = to
                return this.editor.commands.setTextSelection({ from, to })
            }
        }
    }
})
