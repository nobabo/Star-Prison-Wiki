import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { normalizeHighlightBlockAttrs } from '@coconut-studio/wiki-markdown'

export function WikiHighlightBlockView({ node, selected }: NodeViewProps) {
    const attrs = normalizeHighlightBlockAttrs(node.attrs)

    return (
        <NodeViewWrapper
            as="div"
            className={`wiki-highlight-block wiki-highlight-block-${attrs.variant} ${selected ? 'is-selected' : ''}`}
            data-width={attrs.width}
            data-height={attrs.height || undefined}
            data-variant={attrs.variant}
            data-attached={String(attrs.attached)}
            data-row-start={String(attrs.rowStart)}
            data-shape={attrs.shape}
            data-background-color={attrs.backgroundColor || undefined}
            style={{
                width: attrs.width,
                height: attrs.height || undefined,
                ...(attrs.backgroundColor
                    ? ({ '--wiki-card-color': attrs.backgroundColor } as React.CSSProperties)
                    : {})
            }}
        >
            <div className="wiki-highlight-shape" contentEditable={false} aria-hidden="true" />
            <NodeViewContent as="div" className="wiki-highlight-content" />
            <div
                className="wiki-highlight-resize-handle"
                contentEditable={false}
                role="separator"
                aria-label="카드 높이 조절"
                aria-orientation="horizontal"
            />
        </NodeViewWrapper>
    )
}
