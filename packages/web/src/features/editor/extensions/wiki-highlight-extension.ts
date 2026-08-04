import { createBlockMarkdownSpec, mergeAttributes, Node as TiptapNode, ReactNodeViewRenderer } from '@tiptap/react'

import {
    HIGHLIGHT_BLOCK_DEFAULT_VARIANT,
    HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
    HIGHLIGHT_BLOCK_DEFAULT_ATTACHED,
    HIGHLIGHT_BLOCK_DEFAULT_SHAPE,
    HIGHLIGHT_BLOCK_MARKDOWN_NAME,
    normalizeHighlightBlockAttrs,
    normalizeHighlightBlockAttached,
    normalizeHighlightBlockShape,
    normalizeHighlightBlockVariant,
    normalizeHighlightBlockWidth,
    parseHighlightBlockMarkdownAttrs,
    serializeHighlightBlockMarkdownAttrs
} from '@coconut-studio/wiki-markdown'

import { WikiHighlightBlockView } from '../components/WikiHighlightBlockView'

export const WikiHighlightBlock = TiptapNode.create({
    name: 'wikiHighlightBlock',
    group: 'block',
    content: 'block+',
    defining: true,
    isolating: true,
    addAttributes() {
        return {
            width: {
                default: HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
                parseHTML: (element) =>
                    normalizeHighlightBlockWidth(
                        element.getAttribute('data-width') ?? (element as HTMLElement).style.width
                    ),
                renderHTML: () => ({})
            },
            variant: {
                default: HIGHLIGHT_BLOCK_DEFAULT_VARIANT,
                parseHTML: (element) => normalizeHighlightBlockVariant(element.getAttribute('data-variant')),
                renderHTML: () => ({})
            },
            attached: {
                default: HIGHLIGHT_BLOCK_DEFAULT_ATTACHED,
                parseHTML: (element) => normalizeHighlightBlockAttached(element.getAttribute('data-attached')),
                renderHTML: () => ({})
            },
            shape: {
                default: HIGHLIGHT_BLOCK_DEFAULT_SHAPE,
                parseHTML: (element) => normalizeHighlightBlockShape(element.getAttribute('data-shape')),
                renderHTML: () => ({})
            }
        }
    },
    parseHTML: () => [{ tag: 'div[data-wiki-highlight-block]' }],
    renderHTML({ node, HTMLAttributes }) {
        const attrs = normalizeHighlightBlockAttrs(node.attrs)
        return [
            'div',
            mergeAttributes(HTMLAttributes, {
                class: `wiki-highlight-block wiki-highlight-block-${attrs.variant}`,
                'data-wiki-highlight-block': 'true',
                'data-width': attrs.width,
                'data-variant': attrs.variant,
                'data-attached': String(attrs.attached),
                'data-shape': attrs.shape,
                style: `width: ${attrs.width}`
            }),
            0
        ]
    },
    ...createBlockMarkdownSpec({
        nodeName: 'wikiHighlightBlock',
        name: HIGHLIGHT_BLOCK_MARKDOWN_NAME,
        defaultAttributes: {
            width: HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
            variant: HIGHLIGHT_BLOCK_DEFAULT_VARIANT,
            attached: HIGHLIGHT_BLOCK_DEFAULT_ATTACHED,
            shape: HIGHLIGHT_BLOCK_DEFAULT_SHAPE
        },
        content: 'block',
        allowedAttributes: ['width', 'variant', 'attached', 'shape'],
        parseAttributes: parseHighlightBlockMarkdownAttrs,
        serializeAttributes: serializeHighlightBlockMarkdownAttrs
    }),
    addNodeView: () => ReactNodeViewRenderer(WikiHighlightBlockView)
})
