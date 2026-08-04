import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { normalizeHighlightBlockAttrs } from '@coconut-studio/wiki-markdown'

export function WikiHighlightBlockView({ node, selected }: NodeViewProps) {
    const attrs = normalizeHighlightBlockAttrs(node.attrs)

    return (
        <NodeViewWrapper
            as="div"
            className={`wiki-highlight-block wiki-highlight-block-${attrs.variant} ${selected ? 'is-selected' : ''}`}
            data-width={attrs.width}
            data-variant={attrs.variant}
            data-attached={String(attrs.attached)}
            data-shape={attrs.shape}
            style={{ width: attrs.width }}
        >
            <div className="wiki-highlight-shape" contentEditable={false} aria-hidden="true" />
            <NodeViewContent as="div" className="wiki-highlight-content" />
        </NodeViewWrapper>
    )
}
