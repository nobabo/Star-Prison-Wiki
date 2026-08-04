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
        div: [
            ...(defaultSchema.attributes?.div ?? []),
            ['className'],
            ['dataWikiHighlightBlock'],
            ['dataWidth'],
            ['dataVariant'],
            ['dataAttached'],
            ['dataShape'],
            ['style']
        ]
    }
}

const wikiMarkdownProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(colorDirectivePlugin)
    .use(highlightBlockDirectivePlugin)
    .use(underlineHtmlPlugin)
    .use(remarkRehype)
    .use(rehypeSanitize as never, wikiSanitizeSchema)
    .use(rehypeStringify)

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
    const result = await wikiMarkdownProcessor.process(markdown)

    return String(result)
}

function highlightBlockDirectivePlugin() {
    return (tree: Parameters<typeof visit>[0]) => {
        visit(tree, 'containerDirective', (node: DirectiveNode) => {
            if (node.name !== HIGHLIGHT_BLOCK_MARKDOWN_NAME && node.name !== 'highlight') {
                return
            }

            const attrs = normalizeHighlightBlockAttrs({
                width: String(node.attributes?.width ?? ''),
                variant: String(node.attributes?.variant ?? ''),
                attached: String(node.attributes?.attached ?? ''),
                shape: String(node.attributes?.shape ?? '')
            })

            node.data = {
                hName: 'div',
                hProperties: getHighlightBlockHtmlAttrs(attrs)
            }
        })
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
