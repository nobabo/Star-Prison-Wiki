import type { Editor } from '@tiptap/react'

import { decodeColorHtml, encodeColorDirectives } from '@coconut-studio/wiki-markdown'

type MarkdownEditor = Editor & {
    getMarkdown: () => string
}

export function getEditorMarkdown(editor: Editor): string {
    return decodeColorHtml((editor as MarkdownEditor).getMarkdown())
}

export function setEditorMarkdown(editor: Editor, markdown: string): boolean {
    return editor.commands.setContent(encodeColorDirectives(markdown), {
        contentType: 'markdown'
    })
}
