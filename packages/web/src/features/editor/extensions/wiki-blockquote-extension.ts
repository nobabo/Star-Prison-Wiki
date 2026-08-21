import { Blockquote } from '@tiptap/extension-blockquote'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { createBlockMarkdownSpec, mergeAttributes } from '@tiptap/react'

import {
    QUOTE_BLOCK_DEFAULT_EMOJI,
    QUOTE_BLOCK_DEFAULT_TONE,
    QUOTE_BLOCK_MARKDOWN_NAME,
    getQuoteBlockHtmlAttrs,
    normalizeQuoteBlockAttrs,
    normalizeQuoteColor,
    normalizeQuoteEmoji,
    normalizeQuoteTone,
    parseQuoteBlockMarkdownAttrs,
    serializeQuoteBlockMarkdownAttrs
} from '@coconut-studio/wiki-markdown'

const quoteMoveHandlePluginKey = new PluginKey('wikiQuoteMoveHandle')

function createQuoteEmojiControl(emoji: unknown): HTMLSpanElement {
    const button = document.createElement('span')
    const normalizedEmoji = normalizeQuoteEmoji(emoji)
    button.className = 'wiki-quote-emoji-control'
    if (!normalizedEmoji) button.classList.add('is-empty')
    button.dataset.quoteEmojiControl = 'true'
    button.contentEditable = 'false'
    button.setAttribute('aria-label', '인용문 이모지 변경')
    button.title = '인용문 이모지 변경'
    button.textContent = normalizedEmoji
    return button
}

function createQuoteMoveHandle(): HTMLElement {
    const handle = document.createElement('span')
    handle.className = 'wiki-quote-move-handle'
    handle.dataset.quoteMoveHandle = 'true'
    handle.contentEditable = 'false'
    handle.title = '인용문 이동'
    return handle
}

const quoteMarkdownSpec = createBlockMarkdownSpec({
    nodeName: 'blockquote',
    name: QUOTE_BLOCK_MARKDOWN_NAME,
    defaultAttributes: {
        tone: QUOTE_BLOCK_DEFAULT_TONE,
        color: '',
        emoji: QUOTE_BLOCK_DEFAULT_EMOJI
    },
    allowedAttributes: ['tone', 'color', 'emoji'],
    parseAttributes: parseQuoteBlockMarkdownAttrs,
    serializeAttributes: serializeQuoteBlockMarkdownAttrs,
    content: 'block'
})

export const WikiBlockquote = Blockquote.extend({
    ...quoteMarkdownSpec,

    addAttributes() {
        return {
            tone: {
                default: QUOTE_BLOCK_DEFAULT_TONE,
                parseHTML: (element: HTMLElement) =>
                    normalizeQuoteTone(
                        element.getAttribute('data-quote-tone') ?? element.getAttribute('data-quote-color')
                    ),
                renderHTML: () => ({})
            },
            color: {
                default: '',
                parseHTML: (element: HTMLElement) => normalizeQuoteColor(element.getAttribute('data-quote-color')),
                renderHTML: () => ({})
            },
            emoji: {
                default: QUOTE_BLOCK_DEFAULT_EMOJI,
                parseHTML: (element: HTMLElement) => normalizeQuoteEmoji(element.getAttribute('data-quote-emoji')),
                renderHTML: () => ({})
            }
        }
    },

    addProseMirrorPlugins() {
        const nodeName = this.name
        return [
            new Plugin({
                key: quoteMoveHandlePluginKey,
                props: {
                    decorations(state) {
                        const decorations: Decoration[] = []
                        state.doc.descendants((node, position, parent) => {
                            if (node.type.name !== nodeName || parent !== state.doc) return
                            const emoji = normalizeQuoteEmoji(node.attrs.emoji)
                            decorations.push(
                                Decoration.widget(position + 1, () => createQuoteEmojiControl(emoji), {
                                    key: `quote-emoji-control-${position}-${emoji}`,
                                    side: -1
                                }),
                                Decoration.widget(position + node.nodeSize - 1, createQuoteMoveHandle, {
                                    key: `quote-move-handle-${position}`,
                                    side: -1
                                })
                            )
                            return false
                        })
                        return DecorationSet.create(state.doc, decorations)
                    }
                }
            })
        ]
    },

    renderHTML({ node, HTMLAttributes }) {
        const attrs = normalizeQuoteBlockAttrs(node.attrs)
        const htmlAttrs = getQuoteBlockHtmlAttrs(attrs)

        return [
            'blockquote',
            mergeAttributes(HTMLAttributes, {
                class: htmlAttrs.className.join(' '),
                'data-wiki-quote': htmlAttrs.dataWikiQuote,
                'data-quote-tone': htmlAttrs.dataQuoteTone,
                'data-quote-color': htmlAttrs.dataQuoteColor,
                style: htmlAttrs.style,
                'data-quote-emoji': htmlAttrs.dataQuoteEmoji
            }),
            0
        ]
    },

    renderMarkdown(node, h) {
        const attrs = normalizeQuoteBlockAttrs(node.attrs ?? {})
        const renderedContent = h.renderChildren(node.content || [], '\n\n')

        if (attrs.tone === QUOTE_BLOCK_DEFAULT_TONE && !attrs.color && !attrs.emoji) {
            return renderedContent
                .split('\n')
                .map((line) => (line.trim() ? `> ${line}` : '>'))
                .join('\n')
        }

        const serializedAttrs = serializeQuoteBlockMarkdownAttrs(attrs)
        const attrString = serializedAttrs ? ` {${serializedAttrs}}` : ''

        return `:::${QUOTE_BLOCK_MARKDOWN_NAME}${attrString}\n\n${renderedContent}\n\n:::`
    }
})
