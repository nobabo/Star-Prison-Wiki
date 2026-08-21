import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

import { colorAttrsToStyle, parseColorAttrs } from './color-directive'
import {
    HIGHLIGHT_BLOCK_MARKDOWN_NAME,
    getHighlightBlockHtmlAttrs,
    normalizeHighlightBlockAttrs
} from './highlight-block'
import { parseWikiImageMetadata } from './image-metadata'
import { QUOTE_BLOCK_MARKDOWN_NAME, getQuoteBlockHtmlAttrs, normalizeQuoteBlockAttrs } from './quote-block'
import { parseWikiTableMetadata } from './table-metadata'

type DirectiveNode = {
    type: string
    name?: string
    value?: string
    children?: DirectiveNode[]
    attributes?: Record<string, unknown>
    data?: {
        hName?: string
        hProperties?: Record<string, unknown>
    }
}

const wikiSanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'div'],
    attributes: {
        ...defaultSchema.attributes,
        span: [...(defaultSchema.attributes?.span ?? []), ['className'], ['dataWikiColor'], ['style']],
        blockquote: [
            ...(defaultSchema.attributes?.blockquote ?? []),
            ['className'],
            ['dataWikiQuote'],
            ['dataQuoteTone'],
            ['dataQuoteColor'],
            ['style'],
            ['dataQuoteEmoji']
        ],
        div: [
            ...(defaultSchema.attributes?.div ?? []),
            ['className'],
            ['dataWikiHighlightBlock'],
            ['dataWidth'],
            ['dataHeight'],
            ['dataVariant'],
            ['dataAttached'],
            ['dataRowStart'],
            ['dataShape'],
            ['dataBackgroundColor'],
            ['style']
        ],
        img: [
            ...(defaultSchema.attributes?.img ?? []),
            ['width'],
            ['height'],
            ['dataWikiImageWidth'],
            ['dataWikiImageHeight'],
            ['style']
        ],
        table: [...(defaultSchema.attributes?.table ?? []), ['dataHeaderBackground'], ['style']],
        th: [...(defaultSchema.attributes?.th ?? []), ['style']]
    }
}

const wikiMarkdownProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(liftTablesOutOfHighlightBlocksPlugin)
    .use(imageMetadataPlugin)
    .use(tableMetadataPlugin)
    .use(colorDirectivePlugin)
    .use(quoteBlockDirectivePlugin)
    .use(highlightBlockDirectivePlugin)
    .use(underlineHtmlPlugin)
    .use(remarkRehype)
    .use(rehypeSanitize as never, wikiSanitizeSchema)
    .use(rehypeStringify)

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
    const result = await wikiMarkdownProcessor.process(normalizeBlockDirectiveSyntax(markdown))

    return String(result)
}

function normalizeBlockDirectiveSyntax(markdown: string): string {
    return markdown.replace(
        /^:::(wiki-highlight|highlight|wiki-quote|quote)\s+\{/gm,
        (_match, name: string) => `:::${name}{`
    )
}

function highlightBlockDirectivePlugin() {
    return (tree: Parameters<typeof visit>[0]) => {
        visit(tree, 'containerDirective', (node: DirectiveNode) => {
            if (node.name !== HIGHLIGHT_BLOCK_MARKDOWN_NAME && node.name !== 'highlight') {
                return
            }

            const attrs = normalizeHighlightBlockAttrs({
                width: String(node.attributes?.width ?? ''),
                height: String(node.attributes?.height ?? ''),
                variant: String(node.attributes?.variant ?? ''),
                attached: String(node.attributes?.attached ?? ''),
                rowStart: String(node.attributes?.rowStart ?? ''),
                shape: String(node.attributes?.shape ?? ''),
                backgroundColor: String(node.attributes?.backgroundColor ?? '')
            })

            node.data = {
                hName: 'div',
                hProperties: getHighlightBlockHtmlAttrs(attrs)
            }
        })
    }
}

function liftTablesOutOfHighlightBlocksPlugin() {
    return (tree: DirectiveNode) => {
        if (!Array.isArray(tree.children)) return

        tree.children = tree.children.flatMap((node) => {
            if (
                node.type !== 'containerDirective' ||
                (node.name !== HIGHLIGHT_BLOCK_MARKDOWN_NAME && node.name !== 'highlight') ||
                !node.children?.some((child) => child.type === 'table')
            ) {
                return [node]
            }

            const lifted: DirectiveNode[] = []
            let cardChildren: DirectiveNode[] = []
            const flushCard = () => {
                if (cardChildren.length === 0) return
                lifted.push({ ...node, children: cardChildren })
                cardChildren = []
            }

            for (const child of node.children) {
                if (child.type === 'table') {
                    flushCard()
                    lifted.push(child)
                } else {
                    cardChildren.push(child)
                }
            }
            flushCard()
            return lifted
        })
    }
}

function tableMetadataPlugin() {
    return (tree: DirectiveNode) => {
        if (!Array.isArray(tree.children)) return

        const nextChildren: DirectiveNode[] = []
        let pendingMetadata: ReturnType<typeof parseWikiTableMetadata> = null

        for (const node of tree.children) {
            const metadata = node.type === 'html' ? parseWikiTableMetadata(node.value) : null
            if (metadata) {
                pendingMetadata = metadata
                continue
            }

            if (node.type === 'table' && pendingMetadata) {
                const color = pendingMetadata.headerBackground
                node.data = {
                    ...(node.data ?? {}),
                    hProperties: {
                        ...(node.data?.hProperties ?? {}),
                        dataHeaderBackground: color || undefined,
                        style: color ? `--wiki-table-header-color: ${color}` : undefined
                    }
                }
                const firstRow = node.children?.[0]
                firstRow?.children?.forEach((cell, index) => {
                    const width = pendingMetadata?.widths[index]
                    if (!width) return
                    cell.data = {
                        ...(cell.data ?? {}),
                        hProperties: { ...(cell.data?.hProperties ?? {}), style: `width: ${width}px` }
                    }
                })
                pendingMetadata = null
            }
            nextChildren.push(node)
        }

        tree.children = nextChildren
    }
}

function imageMetadataPlugin() {
    return (tree: DirectiveNode) => {
        if (!Array.isArray(tree.children)) return

        const nextChildren: DirectiveNode[] = []
        let pendingMetadata: ReturnType<typeof parseWikiImageMetadata> = null

        for (const node of tree.children) {
            const metadata = node.type === 'html' ? parseWikiImageMetadata(node.value) : null
            if (metadata) {
                pendingMetadata = metadata
                continue
            }

            const image = node.type === 'paragraph' ? node.children?.find((child) => child.type === 'image') : undefined
            if (image && pendingMetadata) {
                image.data = {
                    ...(image.data ?? {}),
                    hProperties: {
                        ...(image.data?.hProperties ?? {}),
                        width: pendingMetadata.width,
                        height: pendingMetadata.height,
                        dataWikiImageWidth: pendingMetadata.width,
                        dataWikiImageHeight: pendingMetadata.height,
                        style: `width: ${pendingMetadata.width}px; height: auto; max-width: 100%`
                    }
                }
                pendingMetadata = null
            }
            nextChildren.push(node)
        }

        tree.children = nextChildren
    }
}

function colorDirectivePlugin() {
    return (tree: Parameters<typeof visit>[0]) => {
        visit(tree, ['textDirective', 'leafDirective'], (node: DirectiveNode) => {
            if (node.name !== 'color') {
                return
            }

            const attrs = parseColorAttrs(
                Object.entries(node.attributes ?? {})
                    .map(([key, value]) => `${key}="${String(value)}"`)
                    .join(' ')
            )
            const style = colorAttrsToStyle(attrs)

            if (!style) {
                return
            }

            node.data = {
                hName: 'span',
                hProperties: {
                    className: ['wiki-color'],
                    dataWikiColor: 'true',
                    style
                }
            }
        })
    }
}

function underlineHtmlPlugin() {
    return (tree: Parameters<typeof visit>[0]) => {
        visit(tree, 'paragraph', (node: DirectiveNode) => {
            if (!Array.isArray(node.children)) {
                return
            }

            node.children = groupUnderlineHtml(node.children)
        })

        visit(tree, 'html', (node: DirectiveNode) => {
            const match = /^<u>([\s\S]+)<\/u>$/i.exec(node.value ?? '')

            if (!match) {
                return
            }

            node.type = 'textDirective'
            node.name = 'underline'
            node.children = [{ type: 'text', value: stripInlineHtml(match[1] ?? '') }]
            node.data = {
                hName: 'u'
            }
            delete node.value
        })
    }
}

function groupUnderlineHtml(children: DirectiveNode[]): DirectiveNode[] {
    const grouped: DirectiveNode[] = []
    const nextClosingUnderline = new Array<number>(children.length).fill(-1)
    let nearestClosingUnderline = -1

    for (let index = children.length - 1; index >= 0; index -= 1) {
        nextClosingUnderline[index] = nearestClosingUnderline
        const child = children[index]
        if (child && isClosingUnderline(child)) nearestClosingUnderline = index
    }

    for (let index = 0; index < children.length; index += 1) {
        const child = children[index]
        if (!child) continue

        if (!isOpeningUnderline(child)) {
            grouped.push(child)
            continue
        }

        const closeIndex = nextClosingUnderline[index] ?? -1

        if (closeIndex === -1) {
            grouped.push(child)
            continue
        }

        grouped.push({
            type: 'textDirective',
            name: 'underline',
            children: children.slice(index + 1, closeIndex).filter((node): node is DirectiveNode => Boolean(node)),
            data: {
                hName: 'u'
            }
        })
        index = closeIndex
    }

    return grouped
}

function isOpeningUnderline(node: DirectiveNode): boolean {
    return node.type === 'html' && /^<u>$/i.test((node.value ?? '').trim())
}

function isClosingUnderline(node: DirectiveNode): boolean {
    return node.type === 'html' && /^<\/u>$/i.test((node.value ?? '').trim())
}

function stripInlineHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '')
}

function quoteBlockDirectivePlugin() {
    return (tree: Parameters<typeof visit>[0]) => {
        visit(tree, 'containerDirective', (node: DirectiveNode) => {
            if (node.name !== QUOTE_BLOCK_MARKDOWN_NAME && node.name !== 'quote') {
                return
            }

            const attrs = normalizeQuoteBlockAttrs({
                tone: node.attributes?.tone,
                color: node.attributes?.color,
                emoji: node.attributes?.emoji
            })
            const htmlAttrs = getQuoteBlockHtmlAttrs(attrs)

            node.data = {
                hName: 'blockquote',
                hProperties: htmlAttrs
            }
        })
    }
}
