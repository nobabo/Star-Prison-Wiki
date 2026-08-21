import { createBlockMarkdownSpec, mergeAttributes, Node as TiptapNode, ReactNodeViewRenderer } from '@tiptap/react'

import {
    HIGHLIGHT_BLOCK_DEFAULT_VARIANT,
    HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
    HIGHLIGHT_BLOCK_DEFAULT_HEIGHT,
    HIGHLIGHT_BLOCK_DEFAULT_ATTACHED,
    HIGHLIGHT_BLOCK_DEFAULT_ROW_START,
    HIGHLIGHT_BLOCK_DEFAULT_SHAPE,
    HIGHLIGHT_BLOCK_MARKDOWN_NAME,
    normalizeHighlightBlockAttrs,
    normalizeHighlightBlockBackgroundColor,
    normalizeHighlightBlockHeight,
    normalizeHighlightBlockAttached,
    normalizeHighlightBlockRowStart,
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
            height: {
                default: HIGHLIGHT_BLOCK_DEFAULT_HEIGHT,
                parseHTML: (element) =>
                    normalizeHighlightBlockHeight(
                        element.getAttribute('data-height') ?? (element as HTMLElement).style.height
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
            rowStart: {
                default: HIGHLIGHT_BLOCK_DEFAULT_ROW_START,
                parseHTML: (element) => normalizeHighlightBlockRowStart(element.getAttribute('data-row-start')),
                renderHTML: () => ({})
            },
            shape: {
                default: HIGHLIGHT_BLOCK_DEFAULT_SHAPE,
                parseHTML: (element) => normalizeHighlightBlockShape(element.getAttribute('data-shape')),
                renderHTML: () => ({})
            },
            backgroundColor: {
                default: '',
                parseHTML: (element) =>
                    normalizeHighlightBlockBackgroundColor(element.getAttribute('data-background-color')),
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
                'data-height': attrs.height || undefined,
                'data-variant': attrs.variant,
                'data-attached': String(attrs.attached),
                'data-row-start': String(attrs.rowStart),
                'data-shape': attrs.shape,
                'data-background-color': attrs.backgroundColor || undefined,
                style: `width: ${attrs.width}${attrs.height ? `; height: ${attrs.height}` : ''}${attrs.backgroundColor ? `; --wiki-card-color: ${attrs.backgroundColor}` : ''}`
            }),
            0
        ]
    },
    ...createBlockMarkdownSpec({
        nodeName: 'wikiHighlightBlock',
        name: HIGHLIGHT_BLOCK_MARKDOWN_NAME,
        defaultAttributes: {
            width: HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
            height: HIGHLIGHT_BLOCK_DEFAULT_HEIGHT,
            variant: HIGHLIGHT_BLOCK_DEFAULT_VARIANT,
            attached: HIGHLIGHT_BLOCK_DEFAULT_ATTACHED,
            rowStart: HIGHLIGHT_BLOCK_DEFAULT_ROW_START,
            shape: HIGHLIGHT_BLOCK_DEFAULT_SHAPE,
            backgroundColor: ''
        },
        content: 'block',
        allowedAttributes: ['width', 'height', 'variant', 'attached', 'rowStart', 'shape', 'backgroundColor'],
        parseAttributes: parseHighlightBlockMarkdownAttrs,
        serializeAttributes: serializeHighlightBlockMarkdownAttrs
    }),
    addNodeView: () => ReactNodeViewRenderer(WikiHighlightBlockView)
})
