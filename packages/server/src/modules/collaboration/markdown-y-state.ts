import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import * as Y from 'yjs'
import { renderMarkdownToHtml } from '@coconut-studio/wiki-markdown'

type HtmlNode = DefaultTreeAdapterMap['childNode']
type Marks = Record<string, Record<string, unknown>>
type XmlNode = Y.XmlElement | Y.XmlText

/** Rebuild editor content on the server, retaining old Yjs tombstones for reconnecting clients. */
export async function replaceMarkdownYState(previous: Uint8Array | null, markdown: string): Promise<Uint8Array> {
    const document = new Y.Doc()
    try {
        if (previous) Y.applyUpdate(document, previous)
        const html = parseFragment(await renderMarkdownToHtml(markdown))
        const content = blocks(html.childNodes)
        const fragment = document.getXmlFragment('default')
        document.transact(() => {
            fragment.delete(0, fragment.length)
            fragment.insert(0, content.length ? content : [element('paragraph')])
        })
        return Y.encodeStateAsUpdate(document)
    } finally {
        document.destroy()
    }
}

function element(name: string, attrs: Record<string, unknown> = {}, children: XmlNode[] = []): Y.XmlElement {
    const node = new Y.XmlElement(name)
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined) node.setAttribute(key, value as string)
    if (children.length) node.insert(0, children)
    return node
}

function blocks(nodes: HtmlNode[]): XmlNode[] {
    return nodes.flatMap((node) => {
        if (!('tagName' in node)) return []
        const attrs = Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value]))
        const tag = node.tagName
        const children = node.childNodes
        if (tag === 'p') {
            const result: XmlNode[] = []
            let paragraph: HtmlNode[] = []
            const flush = () => {
                if (paragraph.length) result.push(element('paragraph', {}, inline(paragraph)))
                paragraph = []
            }
            for (const child of children) {
                if ('tagName' in child && child.tagName === 'img') {
                    flush()
                    result.push(...blocks([child]))
                } else paragraph.push(child)
            }
            flush()
            return result.length ? result : [element('paragraph')]
        }
        if (/^h[1-6]$/.test(tag)) return [element('heading', { level: Number(tag[1]) }, inline(children))]
        if (tag === 'img')
            return [
                element('image', {
                    src: attrs.src ?? '',
                    alt: attrs.alt ?? null,
                    title: attrs.title ?? null,
                    width: dimension(attrs['data-wiki-image-width'] ?? attrs.width),
                    height: dimension(attrs['data-wiki-image-height'] ?? attrs.height)
                })
            ]
        if (tag === 'hr') return [element('horizontalRule')]
        if (tag === 'pre') {
            const code = children.find((child) => 'tagName' in child && child.tagName === 'code')
            const language =
                code && 'attrs' in code
                    ? code.attrs.find((attr) => attr.name === 'class')?.value.replace(/^language-/, '')
                    : null
            const content = code && 'childNodes' in code ? code.childNodes : children
            return [element('codeBlock', { language: language || null }, inline(content))]
        }
        if (tag === 'blockquote')
            return [
                element(
                    'blockquote',
                    {
                        tone: attrs['data-quote-tone'] ?? 'info',
                        color: attrs['data-quote-color'] ?? '',
                        emoji: attrs['data-quote-emoji'] ?? ''
                    },
                    blocks(children)
                )
            ]
        if (tag === 'ul' || tag === 'ol')
            return [
                element(
                    tag === 'ul' ? 'bulletList' : 'orderedList',
                    tag === 'ol' ? { start: Number(attrs.start ?? 1) } : {},
                    blocks(children)
                )
            ]
        if (tag === 'li') {
            const nested: XmlNode[] = []
            let text: HtmlNode[] = []
            const flush = () => {
                if (text.some((child) => child.nodeName !== '#text' || ('value' in child && child.value.trim())))
                    nested.push(element('paragraph', {}, inline(text)))
                text = []
            }
            for (const child of children) {
                if ('tagName' in child && ['p', 'ul', 'ol', 'blockquote'].includes(child.tagName)) {
                    flush()
                    nested.push(...blocks([child]))
                } else text.push(child)
            }
            flush()
            return [element('listItem', {}, nested.length ? nested : [element('paragraph')])]
        }
        if (tag === 'div' && attrs['data-wiki-highlight-block'])
            return [
                element(
                    'wikiHighlightBlock',
                    {
                        width: attrs['data-width'],
                        height: attrs['data-height'] ?? '',
                        variant: attrs['data-variant'],
                        attached: attrs['data-attached'] === 'true',
                        rowStart: attrs['data-row-start'] === 'true',
                        shape: attrs['data-shape'],
                        backgroundColor: attrs['data-background-color'] ?? ''
                    },
                    blocks(children)
                )
            ]
        if (tag === 'table')
            return [element('table', { headerBackground: attrs['data-header-background'] ?? '' }, blocks(children))]
        if (tag === 'tr') return [element('tableRow', {}, blocks(children))]
        if (tag === 'th' || tag === 'td') {
            const width = /(?:^|;)\s*width:\s*(\d+)px/.exec(attrs.style ?? '')?.[1]
            return [
                element(
                    tag === 'th' ? 'tableHeader' : 'tableCell',
                    {
                        colspan: Number(attrs.colspan ?? 1),
                        rowspan: Number(attrs.rowspan ?? 1),
                        colwidth: width ? [Number(width)] : null
                    },
                    [element('paragraph', {}, inline(children))]
                )
            ]
        }
        return blocks(children)
    })
}

function inline(nodes: HtmlNode[], marks: Marks = {}): XmlNode[] {
    const result: XmlNode[] = []
    const deltas: Array<{ insert: string; attributes: Marks }> = []
    const flush = () => {
        if (!deltas.length) return
        const text = new Y.XmlText()
        text.applyDelta(deltas.splice(0))
        result.push(text)
    }
    for (const node of nodes) {
        if ('value' in node && node.nodeName === '#text') {
            deltas.push({ insert: node.value, attributes: marks })
            continue
        }
        if (!('tagName' in node)) continue
        const attrs = Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value]))
        const names: Record<string, string> = {
            strong: 'bold',
            b: 'bold',
            em: 'italic',
            i: 'italic',
            del: 'strike',
            s: 'strike',
            u: 'underline',
            code: 'code'
        }
        if (node.tagName === 'br') {
            flush()
            result.push(element('hardBreak'))
            continue
        }
        const next = { ...marks }
        const mark = names[node.tagName]
        if (mark) next[mark] = {}
        if (node.tagName === 'a')
            next.link = { href: attrs.href ?? '', target: '_blank', rel: 'noopener noreferrer nofollow' }
        if (node.tagName === 'span' && attrs.style) {
            const color = /(?:^|;)\s*color:\s*([^;]+)/.exec(attrs.style)?.[1]
            const backgroundColor = /(?:^|;)\s*background-color:\s*([^;]+)/.exec(attrs.style)?.[1]
            next.textStyle = { ...(color ? { color } : {}), ...(backgroundColor ? { backgroundColor } : {}) }
        }
        flush()
        result.push(...inline(node.childNodes, next))
    }
    flush()
    return result
}

function dimension(value: string | undefined): number | null {
    const parsed = Number.parseFloat(value ?? '')
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
