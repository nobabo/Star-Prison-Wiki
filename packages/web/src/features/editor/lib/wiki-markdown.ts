import type { Editor, JSONContent } from '@tiptap/react'

import {
    decodeColorHtml,
    encodeColorDirectives,
    normalizeImageDimension,
    parseWikiImageMetadata,
    parseWikiTableMetadata,
    serializeWikiImageMetadata,
    serializeWikiTableMetadata,
    type WikiImageMetadata,
    type WikiTableMetadata
} from '@coconut-studio/wiki-markdown'

type MarkdownEditor = Editor & {
    getMarkdown: () => string
}

export function getEditorMarkdown(editor: Editor): string {
    const markdown = decodeColorHtml((editor as MarkdownEditor).getMarkdown())
    const withTableMetadata = injectWikiTableMetadata(markdown, collectWikiTableMetadata(editor.getJSON()))
    return injectWikiImageMetadata(withTableMetadata, collectWikiImageMetadata(editor.getJSON()))
}

export function setEditorMarkdown(editor: Editor, markdown: string): boolean {
    const extractedImages = extractWikiImageMetadata(markdown)
    const extracted = extractWikiTableMetadata(extractedImages.markdown)
    const updated = editor.commands.setContent(encodeColorDirectives(extracted.markdown), {
        contentType: 'markdown',
        emitUpdate: false
    })
    const restoredTables = applyWikiTableMetadata(editor.getJSON(), extracted.metadata)
    const restoredImages = applyWikiImageMetadata(restoredTables.doc, extractedImages.metadata)
    if (restoredTables.changed || restoredImages.changed) editor.commands.setContent(restoredImages.doc)
    liftNestedTablesFromEditor(editor)
    return updated
}

export function collectWikiImageMetadata(doc: JSONContent): Array<WikiImageMetadata | null> {
    const metadata: Array<WikiImageMetadata | null> = []
    visitJson(doc, (node) => {
        if (node.type !== 'image') return
        const width = normalizeImageDimension(node.attrs?.width)
        const height = normalizeImageDimension(node.attrs?.height)
        metadata.push(width && height ? { width, height } : null)
    })
    return metadata
}

export function injectWikiImageMetadata(markdown: string, metadata: Array<WikiImageMetadata | null>): string {
    const output: string[] = []
    let imageIndex = 0
    for (const line of markdown.split('\n')) {
        if (isMarkdownImageLine(line)) {
            const imageMetadata = metadata[imageIndex++]
            if (imageMetadata) output.push(serializeWikiImageMetadata(imageMetadata))
        }
        output.push(line)
    }
    return output.join('\n')
}

export function extractWikiImageMetadata(markdown: string): {
    markdown: string
    metadata: Array<WikiImageMetadata | null>
} {
    const cleanLines: string[] = []
    const metadata: Array<WikiImageMetadata | null> = []
    let pending: WikiImageMetadata | null = null

    for (const line of markdown.split('\n')) {
        const parsed = parseWikiImageMetadata(line)
        if (parsed) {
            pending = parsed
            continue
        }
        if (isMarkdownImageLine(line)) {
            metadata.push(pending)
            pending = null
        }
        cleanLines.push(line)
    }
    return { markdown: cleanLines.join('\n'), metadata }
}

export function applyWikiImageMetadata(
    doc: JSONContent,
    metadata: Array<WikiImageMetadata | null>
): { doc: JSONContent; changed: boolean } {
    let imageIndex = 0
    let changed = false
    const update = (node: JSONContent): JSONContent => {
        let next = node
        if (node.type === 'image') {
            const imageMetadata = metadata[imageIndex++]
            if (imageMetadata) {
                changed = true
                next = { ...node, attrs: { ...(node.attrs ?? {}), ...imageMetadata } }
            }
        }
        if (next.content) next = { ...next, content: next.content.map(update) }
        return next
    }
    const updated = update(doc)
    return { doc: updated, changed }
}

function isMarkdownImageLine(line: string): boolean {
    return /^\s*!\[[^\]]*\]\(/.test(line)
}

export function collectWikiTableMetadata(doc: JSONContent): Array<WikiTableMetadata | null> {
    const metadata: Array<WikiTableMetadata | null> = []
    visitJson(doc, (node) => {
        if (node.type !== 'table') return
        const firstRow = node.content?.[0]
        const widths = (firstRow?.content ?? []).map((cell) => {
            const colwidth = cell.attrs?.colwidth
            return Array.isArray(colwidth) ? Number(colwidth[0] ?? 0) : 0
        })
        const headerBackground = String(node.attrs?.headerBackground ?? '')
        metadata.push(headerBackground || widths.some(Boolean) ? { headerBackground, widths } : null)
    })
    return metadata
}

export function injectWikiTableMetadata(markdown: string, metadata: Array<WikiTableMetadata | null>): string {
    const lines = markdown.split('\n')
    const output: string[] = []
    let tableIndex = 0

    for (let index = 0; index < lines.length; index += 1) {
        const currentLine = lines[index] ?? ''
        const nextLine = lines[index + 1] ?? ''
        const isTableStart =
            currentLine.includes('|') &&
            index + 1 < lines.length &&
            /^[ \t|:]*-[ \t|:-]*$/.test(nextLine) &&
            nextLine.includes('|')
        if (isTableStart) {
            const tableMetadata = metadata[tableIndex]
            if (tableMetadata) output.push(serializeWikiTableMetadata(tableMetadata))
            tableIndex += 1
        }
        output.push(currentLine)
    }

    return output.join('\n')
}

export function extractWikiTableMetadata(markdown: string): {
    markdown: string
    metadata: Array<WikiTableMetadata | null>
} {
    const cleanLines: string[] = []
    const metadata: Array<WikiTableMetadata | null> = []
    let pending: WikiTableMetadata | null = null
    const lines = markdown.split('\n')

    for (let index = 0; index < lines.length; index += 1) {
        const currentLine = lines[index] ?? ''
        const nextLine = lines[index + 1] ?? ''
        const parsed = parseWikiTableMetadata(currentLine)
        if (parsed) {
            pending = parsed
            continue
        }
        const isTableStart =
            currentLine.includes('|') &&
            index + 1 < lines.length &&
            /^[ \t|:]*-[ \t|:-]*$/.test(nextLine) &&
            nextLine.includes('|')
        if (isTableStart) {
            metadata.push(pending)
            pending = null
        }
        cleanLines.push(currentLine)
    }

    return { markdown: cleanLines.join('\n'), metadata }
}

export function applyWikiTableMetadata(
    doc: JSONContent,
    metadata: Array<WikiTableMetadata | null>
): { doc: JSONContent; changed: boolean } {
    let tableIndex = 0
    let changed = false

    const update = (node: JSONContent): JSONContent => {
        let next = node
        if (node.type === 'table') {
            const tableMetadata = metadata[tableIndex++]
            if (tableMetadata) {
                changed = true
                next = {
                    ...node,
                    attrs: { ...(node.attrs ?? {}), headerBackground: tableMetadata.headerBackground },
                    content: node.content?.map((row) => ({
                        ...row,
                        content: row.content?.map((cell, columnIndex) => ({
                            ...cell,
                            attrs: {
                                ...(cell.attrs ?? {}),
                                colwidth: tableMetadata.widths[columnIndex] ? [tableMetadata.widths[columnIndex]] : null
                            }
                        }))
                    }))
                }
            }
        }
        if (next.type !== 'table' && next.content) {
            next = { ...next, content: next.content.map(update) }
        }
        return next
    }

    return { doc: update(doc), changed }
}

function visitJson(node: JSONContent, visitor: (node: JSONContent) => void) {
    visitor(node)
    node.content?.forEach((child) => visitJson(child, visitor))
}

export function liftNestedTablesFromEditor(editor: Editor): boolean {
    const normalized = liftTablesOutOfHighlightBlocks(editor.getJSON())
    if (!normalized.changed) return false

    editor.commands.setContent(normalized.doc)
    return true
}

export function liftTablesOutOfHighlightBlocks(doc: JSONContent): { doc: JSONContent; changed: boolean } {
    if (doc.type !== 'doc' || !doc.content) return { doc, changed: false }

    let changed = false
    const content = doc.content.flatMap((node) => {
        if (node.type !== 'wikiHighlightBlock' || !node.content?.some((child) => child.type === 'table')) {
            return [node]
        }

        changed = true
        const lifted: JSONContent[] = []
        let cardContent: JSONContent[] = []
        const flushCard = () => {
            if (cardContent.length === 0) return
            lifted.push({ ...node, content: cardContent })
            cardContent = []
        }

        for (const child of node.content) {
            if (child.type === 'table') {
                flushCard()
                lifted.push(child)
            } else {
                cardContent.push(child)
            }
        }
        flushCard()
        return lifted
    })

    return changed ? { doc: { ...doc, content }, changed } : { doc, changed }
}
