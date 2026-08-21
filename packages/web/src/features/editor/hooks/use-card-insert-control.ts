import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { HighlightBlockShape } from '@coconut-studio/wiki-markdown'
import { EDITOR_IMAGE_FILES_EVENT, type EditorImageFilesDetail } from '../lib/editor-media'
import { moveTopLevelBlockTo, selectTopLevelTable } from './use-document-block-controls'

const CARD_NODE = {
    type: 'wikiHighlightBlock',
    attrs: {
        width: '100%',
        height: '',
        variant: 'panel',
        attached: false,
        rowStart: true,
        shape: 'rectangle'
    },
    content: [
        {
            type: 'heading',
            attrs: { level: 3 }
        },
        { type: 'paragraph' }
    ]
}

const EMPTY_PARAGRAPH_NODE = { type: 'paragraph' }
const TABLE_NODE = {
    type: 'table',
    content: Array.from({ length: 3 }, (_, rowIndex) => ({
        type: 'tableRow',
        content: Array.from({ length: 3 }, () => ({
            type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
            content: [EMPTY_PARAGRAPH_NODE]
        }))
    }))
}
const ROW_ADD_BUTTON_WIDTH = 52
const MAX_CARDS_PER_ROW = 3
const MIN_SCALED_DIAMOND_HEIGHT = 132
const CARD_CONTENT_HEIGHT_BUFFER = 4
const DEFAULT_CARD_VISUAL_WIDTH_SCALE = 1
const CARD_USER_EDIT_META = 'cardUserEdit'

export const EDITOR_CARD_CONTENT_CONTEXT_MENU_EVENT = 'wiki:card-content-context-menu'

export type EditorCardContentContextMenuDetail = {
    clientX: number
    clientY: number
}

let closeDocumentBlockMenu: (() => void) | null = null

type TiptapEditorElement = HTMLElement & { editor?: Editor }
type CardDragState = {
    card: HTMLElement
    row: HTMLElement[]
    pointerId: number
    startX: number
    startY: number
    baseTransform: string
    baseOpacity: string
    baseZIndex: string
    baseWillChange: string
    originalRect: DOMRect
    originalVisualRect: DOMRect
    preview: HTMLElement | null
    moved: boolean
}

type QuoteDragState = {
    quote: HTMLElement
    sourceBlock: HTMLElement
    pointerId: number
    preview: HTMLElement | null
    startY: number
    moved: boolean
}

type TableDragState = {
    tableWrapper: HTMLElement
    handle: HTMLElement
    sourceBlock: HTMLElement
    pointerId: number
    startY: number
    baseTransform: string
    moved: boolean
}

type RuleDragState = {
    rule: HTMLElement
    handle: HTMLElement
    sourceBlock: HTMLElement
    pointerId: number
    startY: number
    baseTransform: string
    moved: boolean
}

export function useCardInsertControl(pageId: string, enabled = true): void {
    useEffect(() => {
        let frame = 0
        let control: HTMLButtonElement | null = null
        let editorElement: HTMLElement | null = null
        let contextMenuBridge: ((event: MouseEvent) => void) | null = null
        let rowControlsCleanup: (() => void) | null = null

        const installControl = () => {
            const editorFrame = document.querySelector<HTMLElement>('.editor-frame')
            const editor = editorFrame?.querySelector<HTMLElement>('.editor-surface')

            if (!editorFrame || !editor || !(editor as TiptapEditorElement).editor) {
                frame = window.requestAnimationFrame(installControl)
                return
            }

            editorElement = editor
            rowControlsCleanup = installCardRowControls(editor, editorFrame, enabled)
            if (!enabled) return

            control = createCardInsertButton()
            control.addEventListener('click', () => insertCardAtDocumentEnd(editor))
            control.addEventListener('contextmenu', (event) => {
                event.preventDefault()
                event.stopPropagation()
                openDocumentBlockMenu(editor, event)
            })
            editorFrame.after(control)
            contextMenuBridge = (event) => bridgeCardContextMenu(event, editor)
            editor.addEventListener('contextmenu', contextMenuBridge, true)
        }

        frame = window.requestAnimationFrame(installControl)

        return () => {
            window.cancelAnimationFrame(frame)
            control?.remove()
            closeDocumentBlockMenu?.()
            if (editorElement && contextMenuBridge) {
                editorElement.removeEventListener('contextmenu', contextMenuBridge, true)
            }
            rowControlsCleanup?.()
        }
    }, [enabled, pageId])
}

function createCardInsertButton(): HTMLButtonElement {
    const button = document.createElement('button')
    const icon = document.createElement('span')

    button.type = 'button'
    button.className = 'editor-card-insert-control'
    button.setAttribute('aria-label', '새 카드 행 추가')
    button.title = '클릭: 새 카드 · 우클릭: 다른 블록 추가'

    icon.className = 'editor-card-insert-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '+'

    button.append(icon)

    return button
}

type DocumentBlockKind = 'lead' | 'diamond-card' | 'rectangle-card' | 'table' | 'image' | 'code' | 'quote' | 'rule'
export type CardConversionKind = 'table' | 'code' | 'quote' | 'paragraph'

const DOCUMENT_BLOCK_CHOICES: ReadonlyArray<readonly [DocumentBlockKind, string]> = [
    ['lead', '인삿말'],
    ['diamond-card', '마름모 카드'],
    ['rectangle-card', '직사각형 카드'],
    ['table', '표'],
    ['image', '이미지'],
    ['code', '코드 블록'],
    ['quote', '인용문'],
    ['rule', '구분선']
]

function openDocumentBlockMenu(editorElement: HTMLElement, event: MouseEvent): void {
    closeDocumentBlockMenu?.()

    const menu = document.createElement('div')
    menu.className = 'editor-block-insert-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', '독립 블록 추가')
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - 180))}px`
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - 280))}px`

    const handleOutsidePointer = (pointerEvent: PointerEvent) => {
        if (pointerEvent.target instanceof globalThis.Node && menu.contains(pointerEvent.target)) return
        closeDocumentBlockMenu?.()
    }
    const handleEscape = (keyboardEvent: globalThis.KeyboardEvent) => {
        if (keyboardEvent.key === 'Escape') closeDocumentBlockMenu?.()
    }
    closeDocumentBlockMenu = () => {
        menu.remove()
        window.removeEventListener('pointerdown', handleOutsidePointer)
        window.removeEventListener('keydown', handleEscape)
        closeDocumentBlockMenu = null
    }

    for (const [kind, label] of DOCUMENT_BLOCK_CHOICES) {
        const button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('role', 'menuitem')
        button.textContent = label
        button.addEventListener('click', () => {
            closeDocumentBlockMenu?.()
            insertDocumentBlockAtEnd(editorElement, kind)
        })
        menu.append(button)
    }

    document.body.append(menu)
    menu.querySelector<HTMLButtonElement>('button')?.focus()
    window.addEventListener('pointerdown', handleOutsidePointer)
    window.addEventListener('keydown', handleEscape)
}

function insertDocumentBlockAtEnd(editorElement: HTMLElement, kind: DocumentBlockKind): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor) return

    if (kind === 'diamond-card' || kind === 'rectangle-card') {
        insertCardAtDocumentEnd(editorElement, kind === 'rectangle-card' ? 'rectangle' : 'diamond')
        return
    }

    if (kind === 'image') {
        openImageFileDialog(editorElement, tiptapEditor.state.doc.content.size)
        return
    }

    const nodesByKind: Record<Exclude<DocumentBlockKind, 'diamond-card' | 'rectangle-card' | 'image'>, object[]> = {
        lead: [
            {
                ...CARD_NODE,
                attrs: { ...CARD_NODE.attrs, variant: 'lead', rowStart: true, shape: 'rectangle' },
                content: [{ type: 'paragraph' }]
            }
        ],
        table: [TABLE_NODE],
        code: [{ type: 'codeBlock', content: [{ type: 'text', text: 'code' }] }],
        quote: [
            {
                type: 'blockquote',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '인용문' }] }]
            }
        ],
        rule: [{ type: 'horizontalRule' }]
    }
    insertTopLevelNodes(tiptapEditor, nodesByKind[kind])
}

function openImageFileDialog(editorElement: HTMLElement, position: number): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,.gif,image/webp,image/avif'
    input.multiple = true
    input.addEventListener(
        'change',
        () => {
            const files = Array.from(input.files ?? [])
            if (files.length > 0) {
                editorElement.dispatchEvent(
                    new CustomEvent<EditorImageFilesDetail>(EDITOR_IMAGE_FILES_EVENT, {
                        bubbles: true,
                        detail: { files, position }
                    })
                )
            }
            input.remove()
        },
        { once: true }
    )
    input.click()
}

function insertTopLevelNodes(tiptapEditor: Editor, nodes: object[]): void {
    const { doc } = tiptapEditor.state
    const isEmptyDocument =
        doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0
    const insertionRange = isEmptyDocument ? { from: 0, to: doc.content.size } : doc.content.size

    tiptapEditor
        .chain()
        .focus()
        .insertContentAt(insertionRange, [...nodes, EMPTY_PARAGRAPH_NODE])
        .run()
}

function insertCardAtDocumentEnd(editor: HTMLElement, shape: HighlightBlockShape = 'rectangle'): void {
    const tiptapEditor = (editor as TiptapEditorElement).editor
    if (!tiptapEditor) return

    const { doc } = tiptapEditor.state
    const isEmptyDocument =
        doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0
    const insertionRange = isEmptyDocument ? { from: 0, to: doc.content.size } : doc.content.size
    tiptapEditor
        .chain()
        .focus()
        .insertContentAt(insertionRange, [{ ...CARD_NODE, attrs: { ...CARD_NODE.attrs, shape } }, EMPTY_PARAGRAPH_NODE])
        .run()

    window.requestAnimationFrame(() => {
        const card = editor.querySelector<HTMLElement>(
            ':scope > .node-wikiHighlightBlock:last-of-type > .wiki-highlight-block'
        )
        if (!card) return

        focusCardPlaceholder(editor, card)
    })
}

function bridgeCardContextMenu(event: MouseEvent, editor: HTMLElement): void {
    const target = event.target
    if (!(target instanceof Element)) return

    if (target.closest('.wiki-highlight-content')) {
        event.preventDefault()
        event.stopPropagation()
        editor.dispatchEvent(
            new CustomEvent<EditorCardContentContextMenuDetail>(EDITOR_CARD_CONTENT_CONTEXT_MENU_EVENT, {
                detail: { clientX: event.clientX, clientY: event.clientY }
            })
        )
        return
    }

    const card = target.closest<HTMLElement>('.wiki-highlight-block[data-card-row-managed="true"]')
    if (!card) return

    event.preventDefault()
    event.stopPropagation()
    openCardTypeMenu(editor, card, event)
}

function openCardTypeMenu(editorElement: HTMLElement, card: HTMLElement, event: MouseEvent): void {
    closeDocumentBlockMenu?.()

    const menu = document.createElement('div')
    menu.className = 'editor-block-insert-menu editor-card-context-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', '카드 타입 변경')
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - 180))}px`
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - 320))}px`

    const handleOutsidePointer = (pointerEvent: PointerEvent) => {
        if (pointerEvent.target instanceof globalThis.Node && menu.contains(pointerEvent.target)) return
        closeDocumentBlockMenu?.()
    }
    const handleEscape = (keyboardEvent: globalThis.KeyboardEvent) => {
        if (keyboardEvent.key === 'Escape') closeDocumentBlockMenu?.()
    }
    closeDocumentBlockMenu = () => {
        menu.remove()
        window.removeEventListener('pointerdown', handleOutsidePointer)
        window.removeEventListener('keydown', handleEscape)
        closeDocumentBlockMenu = null
    }

    for (const [shape, label] of [
        ['diamond', '마름모 카드로 변경'],
        ['rectangle', '직사각형 카드로 변경']
    ] as const satisfies ReadonlyArray<readonly [HighlightBlockShape, string]>) {
        const button = document.createElement('button')
        const selected = getCardShape(card) === shape
        button.type = 'button'
        button.setAttribute('role', 'menuitemradio')
        button.setAttribute('aria-checked', String(selected))
        button.textContent = `${selected ? '✓ ' : ''}${label}`
        button.addEventListener('click', () => {
            closeDocumentBlockMenu?.()
            setSingleCardShape(editorElement, card, shape)
        })
        menu.append(button)
    }

    const separator = document.createElement('div')
    separator.className = 'editor-card-context-separator'
    separator.setAttribute('role', 'separator')
    menu.append(separator)

    for (const [kind, label] of [
        ['table', '표로 전환'],
        ['code', '코드 블록으로 전환'],
        ['quote', '인용문으로 전환'],
        ['paragraph', '일반 문단으로 전환']
    ] as const satisfies ReadonlyArray<readonly [CardConversionKind, string]>) {
        const button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('role', 'menuitem')
        button.textContent = label
        button.addEventListener('click', () => {
            closeDocumentBlockMenu?.()
            convertCardToBlock(editorElement, card, kind)
        })
        menu.append(button)
    }

    document.body.append(menu)
    menu.querySelector<HTMLButtonElement>('button')?.focus()
    window.addEventListener('pointerdown', handleOutsidePointer)
    window.addEventListener('keydown', handleEscape)
}

export function createCardConversionContent(
    childBlocks: Array<Record<string, unknown>>,
    text: string,
    kind: CardConversionKind
): Record<string, unknown> {
    if (kind === 'table') {
        return {
            type: 'table',
            content: (childBlocks.length > 0 ? childBlocks : [EMPTY_PARAGRAPH_NODE]).map((child, index) => ({
                type: 'tableRow',
                content: [
                    {
                        type: index === 0 ? 'tableHeader' : 'tableCell',
                        content: [child]
                    }
                ]
            }))
        }
    }
    if (kind === 'code') {
        return {
            type: 'codeBlock',
            ...(text ? { content: [{ type: 'text', text }] } : {})
        }
    }
    if (kind === 'quote') {
        return {
            type: 'blockquote',
            content: childBlocks.length > 0 ? childBlocks : [EMPTY_PARAGRAPH_NODE]
        }
    }
    return {
        type: 'paragraph',
        ...(text ? { content: [{ type: 'text', text }] } : {})
    }
}

function convertCardToBlock(editorElement: HTMLElement, card: HTMLElement, kind: CardConversionKind): void {
    const editor = (editorElement as TiptapEditorElement).editor
    if (!editor || !card.isConnected) return

    const position = getCardNodePosition(editor, card)
    const cardNode = editor.state.doc.nodeAt(position)
    if (!cardNode || cardNode.type.name !== 'wikiHighlightBlock') return

    const childBlocks = cardNode.content.content.map((child) => child.toJSON())
    const text = cardNode.textBetween(0, cardNode.content.size, '\n').trim()
    const replacementNode = editor.schema.nodeFromJSON(createCardConversionContent(childBlocks, text, kind))
    const transaction = editor.state.tr
        .replaceWith(position, position + cardNode.nodeSize, replacementNode)
        .setMeta(CARD_USER_EDIT_META, true)
    editor.view.dispatch(transaction)
    editor.commands.focus()
}

function installCardRowControls(editorElement: HTMLElement, editorFrame: HTMLElement, editable: boolean): () => void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor) return () => undefined

    const controlsLayer = editable ? document.createElement('div') : null
    if (controlsLayer) {
        controlsLayer.className = 'editor-card-row-controls'
        controlsLayer.setAttribute('aria-label', '문서 블록 도구')
        editorFrame.append(controlsLayer)
    }

    let layoutFrame = 0
    let resizeFrame = 0
    let armedEmptyCard: HTMLElement | null = null
    let pendingQuoteDrag: QuoteDragState | null = null
    let pendingTableDrag: TableDragState | null = null
    let pendingRuleDrag: RuleDragState | null = null
    let resizingRow: {
        source: HTMLElement
        cards: HTMLElement[]
        pointerId: number
        startY: number
        startHeight: number
    } | null = null
    let pendingCardDrag: CardDragState | null = null
    const layoutRows = () => {
        window.cancelAnimationFrame(layoutFrame)
        layoutFrame = window.requestAnimationFrame(() =>
            renderCardRows(editorElement, editorFrame, controlsLayer, editable)
        )
    }
    const disarmEmptyCard = () => {
        if (armedEmptyCard) {
            delete armedEmptyCard.dataset.cardDeleteArmed
            armedEmptyCard = null
        }
    }
    const handleResizeStart = (event: PointerEvent) => {
        disarmEmptyCard()

        if (event.button !== 0) return

        const target = event.target
        if (!(target instanceof Element)) return

        const card = target.closest<HTMLElement>('.wiki-highlight-block[data-card-row-managed="true"]')
        if (!card) return

        const resizeHandle = target.closest('.wiki-highlight-resize-handle')
        if (!resizeHandle) return

        const row = collectCardRows(editorElement).find((cards) => cards.includes(card))
        resizingRow = {
            source: card,
            cards: row ?? [card],
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight: card.getBoundingClientRect().height
        }
        for (const rowCard of resizingRow.cards) {
            rowCard.dataset.cardRowResizing = 'true'
        }
        event.preventDefault()
        try {
            card.setPointerCapture(event.pointerId)
        } catch {
            // Pointer capture is not available in a few embedded webviews.
        }
    }
    const handleCardDragStart = (event: PointerEvent) => {
        if (event.button !== 0 || resizingRow) return

        const target = event.target
        if (
            !(target instanceof Element) ||
            target.closest('.wiki-highlight-content, .wiki-highlight-resize-handle, a, button, input, textarea, select')
        ) {
            return
        }

        const card = target.closest<HTMLElement>('.wiki-highlight-block[data-card-row-managed="true"]')
        if (!card) return

        const cardRect = card.getBoundingClientRect()
        if (event.clientX >= cardRect.right - 16 && event.clientY >= cardRect.bottom - 16) return

        const row = collectCardRows(editorElement).find((cards) => cards.includes(card))
        if (!row) return

        pendingCardDrag = {
            card,
            row,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            baseTransform: card.style.transform,
            baseOpacity: card.style.opacity,
            baseZIndex: card.style.zIndex,
            baseWillChange: card.style.willChange,
            originalRect: card.getBoundingClientRect(),
            originalVisualRect: getCardVisualRect(card),
            preview: null,
            moved: false
        }
        try {
            card.setPointerCapture(event.pointerId)
        } catch {
            // Pointer capture is not available in a few embedded webviews.
        }
    }
    const handleCardDragMove = (event: PointerEvent) => {
        const drag = pendingCardDrag
        if (!drag || event.pointerId !== drag.pointerId) return

        const deltaX = event.clientX - drag.startX
        const deltaY = event.clientY - drag.startY
        if (!drag.moved && Math.hypot(deltaX, deltaY) < 6) return

        if (!drag.moved) {
            drag.moved = true
            window.getSelection()?.removeAllRanges()
            drag.card.dataset.cardDragging = 'true'
            drag.card.style.zIndex = '999'
            drag.card.style.opacity = '0.86'
            drag.card.style.willChange = 'transform'
            drag.preview = createCardDropPreview(drag.card)
        }

        event.preventDefault()
        drag.card.style.transform = `${drag.baseTransform} translate(${deltaX}px, ${deltaY}px)`
        updateCardDropPreview(editorElement, drag, event.clientX, event.clientY)
    }
    const finishCardDrag = (event: PointerEvent) => {
        const drag = pendingCardDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingCardDrag = null

        releaseCardPointer(drag)

        if (drag.moved) {
            event.preventDefault()
            resetCardDragVisual(drag)
            const moveAsDocumentBlock =
                isStandaloneCard(cardVariant(drag.card)) ||
                isVerticalCardDrag(event.clientX - drag.startX, event.clientY - drag.startY)
            const documentTarget = getDocumentDropTarget(
                editorElement,
                drag.card,
                event.clientY,
                drag.originalVisualRect,
                moveAsDocumentBlock
            )
            if (documentTarget && moveCardToDocumentTarget(editorElement, drag.card, documentTarget)) {
                layoutRows()
                return
            }
            if (isStandaloneCard(cardVariant(drag.card))) {
                layoutRows()
                return
            }
            const rows = collectCardRows(editorElement)
            const targetRowIndex = getCardDropRowIndex(
                rows.map((row) => ({
                    top: Math.min(...row.map((card) => getCardVisualRect(card).top)),
                    bottom: Math.max(...row.map((card) => getCardVisualRect(card).bottom))
                })),
                event.clientY
            )
            if (targetRowIndex === rows.length && moveCardToNewRowBelow(editorElement, drag.card, rows)) {
                layoutRows()
                return
            }
            const targetRow = rows[targetRowIndex] ?? rows.find((row) => row.includes(drag.card)) ?? drag.row
            const targetIndex = getCardDropIndex(targetRow, event.clientX)
            const previousCard = targetRow[targetIndex - 1]
            const attached = drag.card.dataset.shape === 'diamond' && previousCard?.dataset.shape === 'diamond'
            if (!moveCard(editorElement, drag.card, rows, targetRow, targetIndex, attached)) {
                updateCardAttachment(editorElement, drag.card, attached)
            }
        } else {
            resetCardDragVisual(drag)
        }

        if (drag.moved) layoutRows()
    }
    const handleQuoteDragStart = (event: PointerEvent) => {
        if (event.button !== 0) return
        const target = event.target
        if (!(target instanceof Element)) return

        const handle = target.closest<HTMLElement>('.wiki-quote-move-handle')
        const quote = handle?.closest<HTMLElement>('blockquote')
        if (!handle || !quote) return
        const sourceBlock = Array.from(editorElement.children).find(
            (child): child is HTMLElement => child instanceof HTMLElement && (child === quote || child.contains(quote))
        )
        if (!sourceBlock) return

        pendingQuoteDrag = {
            quote,
            sourceBlock,
            pointerId: event.pointerId,
            startY: event.clientY,
            preview: null,
            moved: false
        }
        event.preventDefault()
        event.stopPropagation()
        try {
            quote.setPointerCapture(event.pointerId)
        } catch {
            // Pointer capture is not available in a few embedded webviews.
        }
    }
    const handleQuoteDragMove = (event: PointerEvent) => {
        const drag = pendingQuoteDrag
        if (!drag || event.pointerId !== drag.pointerId) return

        const deltaY = event.clientY - drag.startY
        if (!drag.moved && Math.abs(deltaY) < 6) return
        if (!drag.moved) {
            drag.moved = true
            drag.preview = createQuoteDragPreview(drag.quote)
        }

        event.preventDefault()
        if (drag.preview) {
            drag.preview.style.transform = `translateY(${deltaY}px)`
        }
    }
    const finishQuoteDrag = (event: PointerEvent) => {
        const drag = pendingQuoteDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingQuoteDrag = null

        releaseQuotePointer(drag)
        resetQuoteDragPreview(drag)
        if (!drag.moved) {
            return
        }

        event.preventDefault()
        const blocks = Array.from(editorElement.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement
        )
        const sourceIndex = blocks.indexOf(drag.sourceBlock)
        const targetIndex = getDocumentBlockDropIndex(
            blocks.map((block) => block.getBoundingClientRect()),
            sourceIndex,
            event.clientY
        )
        if (moveTopLevelBlockTo(tiptapEditor, sourceIndex, targetIndex)) {
            tiptapEditor.view.focus()
            layoutRows()
        }
    }
    const cancelQuoteDrag = (event: PointerEvent) => {
        const drag = pendingQuoteDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingQuoteDrag = null
        releaseQuotePointer(drag)
        resetQuoteDragPreview(drag)
    }
    const handleTableDragStart = (event: PointerEvent) => {
        if (event.button !== 0) return
        const target = event.target
        if (!(target instanceof Element)) return

        const handle = target.closest<HTMLElement>('.wiki-table-move-handle')
        if (!handle) return
        const blockIndex = Number.parseInt(handle.dataset.tableBlockIndex ?? '', 10)
        const sourceBlock = editorElement.children.item(blockIndex)
        if (!(sourceBlock instanceof HTMLElement) || !sourceBlock.matches('.tableWrapper')) return

        pendingTableDrag = {
            tableWrapper: sourceBlock,
            handle,
            sourceBlock,
            pointerId: event.pointerId,
            startY: event.clientY,
            baseTransform: sourceBlock.style.transform,
            moved: false
        }
        event.preventDefault()
        event.stopPropagation()
        try {
            handle.setPointerCapture(event.pointerId)
        } catch {
            // Pointer capture is not available in a few embedded webviews.
        }
    }
    const handleTableDragMove = (event: PointerEvent) => {
        const drag = pendingTableDrag
        if (!drag || event.pointerId !== drag.pointerId) return

        const deltaY = event.clientY - drag.startY
        if (!drag.moved && Math.abs(deltaY) < 6) return
        if (!drag.moved) {
            drag.moved = true
            window.getSelection()?.removeAllRanges()
            drag.tableWrapper.dataset.tableDragging = 'true'
            drag.handle.dataset.tableDragging = 'true'
        }

        event.preventDefault()
        drag.tableWrapper.style.transform = `${drag.baseTransform} translateY(${deltaY}px)`
    }
    const finishTableDrag = (event: PointerEvent) => {
        const drag = pendingTableDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingTableDrag = null

        releaseTablePointer(drag)
        if (!drag.moved) {
            resetTableDragVisual(drag)
            const blockIndex = Array.from(editorElement.children).indexOf(drag.sourceBlock)
            if (selectTopLevelTable(tiptapEditor, blockIndex)) {
                tiptapEditor.view.focus()
            }
            return
        }

        event.preventDefault()
        const blocks = Array.from(editorElement.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement
        )
        const sourceIndex = blocks.indexOf(drag.sourceBlock)
        const targetIndex = getDocumentBlockDropIndex(
            blocks.map((block) => block.getBoundingClientRect()),
            sourceIndex,
            event.clientY
        )
        resetTableDragVisual(drag)
        if (moveTopLevelBlockTo(tiptapEditor, sourceIndex, targetIndex)) {
            tiptapEditor.view.focus()
            layoutRows()
        }
    }
    const cancelTableDrag = (event: PointerEvent) => {
        const drag = pendingTableDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingTableDrag = null
        releaseTablePointer(drag)
        resetTableDragVisual(drag)
    }
    const handleRuleDragStart = (event: PointerEvent) => {
        if (event.button !== 0) return
        const target = event.target
        if (!(target instanceof Element)) return

        const handle = target.closest<HTMLElement>('.wiki-horizontal-rule-move-handle')
        if (!handle) return
        const blockIndex = Number.parseInt(handle.dataset.ruleBlockIndex ?? '', 10)
        const sourceBlock = editorElement.children.item(blockIndex)
        if (!(sourceBlock instanceof HTMLElement) || !sourceBlock.matches('hr')) return

        pendingRuleDrag = {
            rule: sourceBlock,
            handle,
            sourceBlock,
            pointerId: event.pointerId,
            startY: event.clientY,
            baseTransform: sourceBlock.style.transform,
            moved: false
        }
        event.preventDefault()
        event.stopPropagation()
        try {
            handle.setPointerCapture(event.pointerId)
        } catch {
            // Pointer capture is not available in a few embedded webviews.
        }
    }
    const handleRuleDragMove = (event: PointerEvent) => {
        const drag = pendingRuleDrag
        if (!drag || event.pointerId !== drag.pointerId) return

        const deltaY = event.clientY - drag.startY
        if (!drag.moved && Math.abs(deltaY) < 6) return
        if (!drag.moved) {
            drag.moved = true
            window.getSelection()?.removeAllRanges()
            drag.rule.dataset.ruleDragging = 'true'
            drag.handle.dataset.ruleDragging = 'true'
        }

        event.preventDefault()
        drag.rule.style.transform = `${drag.baseTransform} translateY(${deltaY}px)`
    }
    const finishRuleDrag = (event: PointerEvent) => {
        const drag = pendingRuleDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingRuleDrag = null

        releaseRulePointer(drag)
        if (!drag.moved) {
            resetRuleDragVisual(drag)
            return
        }

        event.preventDefault()
        const blocks = Array.from(editorElement.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement
        )
        const sourceIndex = blocks.indexOf(drag.sourceBlock)
        const targetIndex = getDocumentBlockDropIndex(
            blocks.map((block) => block.getBoundingClientRect()),
            sourceIndex,
            event.clientY
        )
        resetRuleDragVisual(drag)
        if (moveTopLevelBlockTo(tiptapEditor, sourceIndex, targetIndex)) {
            tiptapEditor.view.focus()
            layoutRows()
        }
    }
    const cancelRuleDrag = (event: PointerEvent) => {
        const drag = pendingRuleDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingRuleDrag = null
        releaseRulePointer(drag)
        resetRuleDragVisual(drag)
    }
    const cancelCardDrag = (event: PointerEvent) => {
        const drag = pendingCardDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingCardDrag = null
        releaseCardPointer(drag)
        resetCardDragVisual(drag)
        if (drag.moved) layoutRows()
    }
    const syncResizingRow = (event: PointerEvent) => {
        if (!resizingRow || event.pointerId !== resizingRow.pointerId) return

        event.preventDefault()
        resizingRow.source.style.height = `${getResizedCardHeight(
            resizingRow.startHeight,
            event.clientY - resizingRow.startY
        )}px`

        window.cancelAnimationFrame(resizeFrame)
        resizeFrame = window.requestAnimationFrame(() => {
            if (!resizingRow) return
            syncCardRowHeight(resizingRow.cards, resizingRow.source)
            layoutRows()
        })
    }
    const finishRowResize = (event: PointerEvent) => {
        if (!resizingRow || event.pointerId !== resizingRow.pointerId) return

        window.cancelAnimationFrame(resizeFrame)
        syncCardRowHeight(resizingRow.cards, resizingRow.source)
        persistCardRowHeight(editorElement, resizingRow.cards, resizingRow.source)
        try {
            resizingRow.source.releasePointerCapture(resizingRow.pointerId)
        } catch {
            // The pointer may already have been released by the browser.
        }
        for (const rowCard of resizingRow.cards) {
            delete rowCard.dataset.cardRowResizing
        }
        resizingRow = null
        layoutRows()
    }
    const handleEmptyCardDelete = (event: KeyboardEvent) => {
        if (event.key !== 'Backspace') {
            disarmEmptyCard()
            return
        }

        const card = getSelectedCard(editorElement)
        if (!card || !isCardEmpty(card)) {
            disarmEmptyCard()
            return
        }

        event.preventDefault()
        event.stopPropagation()
        if (armedEmptyCard === card) {
            deleteEmptyCard(editorElement, card)
            armedEmptyCard = null
            return
        }

        disarmEmptyCard()
        armedEmptyCard = card
        card.dataset.cardDeleteArmed = 'true'
    }

    tiptapEditor.on('transaction', layoutRows)
    if (editable) {
        controlsLayer?.addEventListener('pointerdown', handleTableDragStart, true)
        controlsLayer?.addEventListener('pointerdown', handleRuleDragStart, true)
        editorElement.addEventListener('pointerdown', handleQuoteDragStart, true)
        editorElement.addEventListener('pointerdown', handleCardDragStart, true)
        editorElement.addEventListener('pointerdown', handleResizeStart, true)
        editorElement.addEventListener('keydown', handleEmptyCardDelete, true)
        window.addEventListener('pointermove', syncResizingRow)
        window.addEventListener('pointermove', handleCardDragMove)
        window.addEventListener('pointermove', handleQuoteDragMove, true)
        window.addEventListener('pointermove', handleTableDragMove)
        window.addEventListener('pointermove', handleRuleDragMove)
        window.addEventListener('pointerup', finishRowResize)
        window.addEventListener('pointerup', finishCardDrag)
        window.addEventListener('pointerup', finishQuoteDrag, true)
        window.addEventListener('pointerup', finishTableDrag)
        window.addEventListener('pointerup', finishRuleDrag)
        window.addEventListener('pointercancel', finishRowResize)
        window.addEventListener('pointercancel', cancelCardDrag)
        window.addEventListener('pointercancel', cancelQuoteDrag, true)
        window.addEventListener('pointercancel', cancelTableDrag)
        window.addEventListener('pointercancel', cancelRuleDrag)
    }
    window.addEventListener('resize', layoutRows)
    layoutRows()

    return () => {
        window.cancelAnimationFrame(layoutFrame)
        window.cancelAnimationFrame(resizeFrame)
        tiptapEditor.off('transaction', layoutRows)
        controlsLayer?.removeEventListener('pointerdown', handleTableDragStart, true)
        controlsLayer?.removeEventListener('pointerdown', handleRuleDragStart, true)
        editorElement.removeEventListener('pointerdown', handleQuoteDragStart, true)
        editorElement.removeEventListener('pointerdown', handleCardDragStart, true)
        editorElement.removeEventListener('pointerdown', handleResizeStart, true)
        editorElement.removeEventListener('keydown', handleEmptyCardDelete, true)
        window.removeEventListener('pointermove', syncResizingRow)
        window.removeEventListener('pointermove', handleCardDragMove)
        window.removeEventListener('pointermove', handleQuoteDragMove, true)
        window.removeEventListener('pointermove', handleTableDragMove)
        window.removeEventListener('pointermove', handleRuleDragMove)
        window.removeEventListener('pointerup', finishRowResize)
        window.removeEventListener('pointerup', finishCardDrag)
        window.removeEventListener('pointerup', finishQuoteDrag, true)
        window.removeEventListener('pointerup', finishTableDrag)
        window.removeEventListener('pointerup', finishRuleDrag)
        window.removeEventListener('pointercancel', finishRowResize)
        window.removeEventListener('pointercancel', cancelCardDrag)
        window.removeEventListener('pointercancel', cancelQuoteDrag, true)
        window.removeEventListener('pointercancel', cancelTableDrag)
        window.removeEventListener('pointercancel', cancelRuleDrag)
        window.removeEventListener('resize', layoutRows)
        for (const rowCard of resizingRow?.cards ?? []) {
            delete rowCard.dataset.cardRowResizing
        }
        resizingRow = null
        if (pendingCardDrag) {
            releaseCardPointer(pendingCardDrag)
            resetCardDragVisual(pendingCardDrag)
        }
        pendingCardDrag = null
        if (pendingQuoteDrag) {
            releaseQuotePointer(pendingQuoteDrag)
            resetQuoteDragPreview(pendingQuoteDrag)
        }
        pendingQuoteDrag = null
        if (pendingTableDrag) {
            releaseTablePointer(pendingTableDrag)
            resetTableDragVisual(pendingTableDrag)
        }
        pendingTableDrag = null
        if (pendingRuleDrag) {
            releaseRulePointer(pendingRuleDrag)
            resetRuleDragVisual(pendingRuleDrag)
        }
        pendingRuleDrag = null
        disarmEmptyCard()
        controlsLayer?.remove()
    }
}

export function getResizedCardHeight(startHeight: number, deltaY: number): number {
    return Math.max(MIN_SCALED_DIAMOND_HEIGHT, Math.min(1200, startHeight + deltaY))
}

export function getDocumentBlockDropIndex(
    blockBounds: Array<{ top: number; bottom: number }>,
    sourceIndex: number,
    clientY: number
): number {
    if (sourceIndex < 0 || sourceIndex >= blockBounds.length) return sourceIndex

    const candidates = blockBounds
        .map((bounds, index) => {
            const distance =
                clientY < bounds.top ? bounds.top - clientY : clientY > bounds.bottom ? clientY - bounds.bottom : 0
            const edge = clientY < bounds.top + (bounds.bottom - bounds.top) / 2 ? 'before' : 'after'
            return { index, distance, edge }
        })
        .filter(({ index }) => index !== sourceIndex)
        .sort((left, right) => left.distance - right.distance)
    const closest = candidates[0]
    if (!closest) return sourceIndex
    if (closest.edge === 'before') return closest.index > sourceIndex ? closest.index - 1 : closest.index
    return closest.index > sourceIndex ? closest.index : closest.index + 1
}

type DocumentDropTarget = {
    block: HTMLElement
    index: number
    edge: 'before' | 'after'
    boundaryY: number
}

function getDocumentDropTarget(
    editorElement: HTMLElement,
    sourceCard: HTMLElement,
    clientY: number,
    sourceOriginalRect: DOMRect,
    includeCards = false
): DocumentDropTarget | null {
    const blocks = Array.from(editorElement.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement
    )
    const sourceBlock = sourceCard.closest<HTMLElement>('.node-wikiHighlightBlock')
    if (clientY >= sourceOriginalRect.top && clientY <= sourceOriginalRect.bottom) return null
    const cardRects = blocks
        .filter((block) => block !== sourceBlock && block.matches('.node-wikiHighlightBlock'))
        .map((block) => block.querySelector<HTMLElement>('.wiki-highlight-block')?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => Boolean(rect))
    if (!includeCards && cardRects.some((rect) => clientY >= rect.top && clientY <= rect.bottom)) return null

    const candidates = blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block !== sourceBlock && (includeCards || !block.matches('.node-wikiHighlightBlock')))
        .map(({ block, index }) => {
            const card = block.matches('.node-wikiHighlightBlock')
                ? block.querySelector<HTMLElement>(':scope > .wiki-highlight-block')
                : null
            const rect = card ? getCardVisualRect(card) : block.getBoundingClientRect()
            const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
            const edge = clientY < rect.top + rect.height / 2 ? ('before' as const) : ('after' as const)
            return {
                block,
                index,
                edge,
                boundaryY: edge === 'before' ? rect.top : rect.bottom,
                distance
            }
        })
    candidates.sort((left, right) => left.distance - right.distance)
    const closest = candidates[0]
    if (!closest) return null
    return {
        block: closest.block,
        index: closest.index,
        edge: closest.edge,
        boundaryY: closest.boundaryY
    }
}

function moveCardToDocumentTarget(editorElement: HTMLElement, card: HTMLElement, target: DocumentDropTarget): boolean {
    const editor = (editorElement as TiptapEditorElement).editor
    const sourceBlock = card.closest<HTMLElement>('.node-wikiHighlightBlock')
    if (!editor || !sourceBlock) return false

    const blocks = Array.from(editorElement.children)
    const sourceIndex = blocks.indexOf(sourceBlock)
    if (sourceIndex < 0) return false

    const targetIndex =
        target.edge === 'before'
            ? target.index > sourceIndex
                ? target.index - 1
                : target.index
            : target.index > sourceIndex
              ? target.index
              : target.index + 1
    return moveTopLevelBlockTo(editor, sourceIndex, targetIndex)
}

function getCardContentMinimumHeight(card: HTMLElement): number {
    const content = card.querySelector<HTMLElement>('.wiki-highlight-content')
    if (!content) return MIN_SCALED_DIAMOND_HEIGHT
    const style = window.getComputedStyle(card)
    const verticalPadding =
        (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0) +
        (Number.parseFloat(style.borderTopWidth) || 0) +
        (Number.parseFloat(style.borderBottomWidth) || 0)
    return Math.ceil(content.scrollHeight + verticalPadding + CARD_CONTENT_HEIGHT_BUFFER)
}

function releaseQuotePointer(drag: QuoteDragState): void {
    try {
        if (drag.quote.hasPointerCapture(drag.pointerId)) {
            drag.quote.releasePointerCapture(drag.pointerId)
        }
    } catch {
        // The pointer may already have been released by the browser.
    }
}

function createQuoteDragPreview(quote: HTMLElement): HTMLElement {
    const host = document.createElement('div')
    host.className = 'editor-surface editor-quote-drag-preview-host'

    const preview = quote.cloneNode(true) as HTMLElement
    const rect = quote.getBoundingClientRect()
    preview.classList.remove('ProseMirror-selectednode')
    preview.classList.add('editor-quote-drag-preview')
    preview.querySelector('.wiki-quote-move-handle')?.remove()
    preview.setAttribute('aria-hidden', 'true')
    preview.setAttribute('contenteditable', 'false')
    preview.style.left = `${rect.left}px`
    preview.style.top = `${rect.top}px`
    preview.style.width = `${rect.width}px`
    preview.style.height = `${rect.height}px`
    for (const element of preview.querySelectorAll<HTMLElement>('[id], [contenteditable]')) {
        element.removeAttribute('id')
        element.setAttribute('contenteditable', 'false')
    }
    host.append(preview)
    document.body.append(host)
    return preview
}

function resetQuoteDragPreview(drag: QuoteDragState): void {
    const previewHost = drag.preview?.parentElement
    if (previewHost?.classList.contains('editor-quote-drag-preview-host')) {
        previewHost.remove()
    } else {
        drag.preview?.remove()
    }
    drag.preview = null
}

function releaseTablePointer(drag: TableDragState): void {
    try {
        if (drag.handle.hasPointerCapture(drag.pointerId)) {
            drag.handle.releasePointerCapture(drag.pointerId)
        }
    } catch {
        // The pointer may already have been released by the browser.
    }
}

function resetTableDragVisual(drag: TableDragState): void {
    delete drag.tableWrapper.dataset.tableDragging
    delete drag.handle.dataset.tableDragging
    drag.tableWrapper.style.transform = drag.baseTransform
}

function releaseRulePointer(drag: RuleDragState): void {
    try {
        if (drag.handle.hasPointerCapture(drag.pointerId)) {
            drag.handle.releasePointerCapture(drag.pointerId)
        }
    } catch {
        // The pointer may already have been released by the browser.
    }
}

function resetRuleDragVisual(drag: RuleDragState): void {
    delete drag.rule.dataset.ruleDragging
    delete drag.handle.dataset.ruleDragging
    drag.rule.style.transform = drag.baseTransform
}

function releaseCardPointer(drag: CardDragState): void {
    try {
        if (drag.card.hasPointerCapture(drag.pointerId)) {
            drag.card.releasePointerCapture(drag.pointerId)
        }
    } catch {
        // The pointer may already have been released by the browser.
    }
}

function resetCardDragVisual(drag: CardDragState): void {
    const previewHost = drag.preview?.parentElement
    if (previewHost?.classList.contains('editor-card-drop-preview-host')) {
        previewHost.remove()
    } else {
        drag.preview?.remove()
    }
    drag.preview = null
    delete drag.card.dataset.cardDragging
    drag.card.style.transform = drag.baseTransform
    drag.card.style.opacity = drag.baseOpacity
    drag.card.style.zIndex = drag.baseZIndex
    drag.card.style.willChange = drag.baseWillChange
}

function createCardDropPreview(card: HTMLElement): HTMLElement {
    const host = document.createElement('div')
    host.className = 'editor-surface editor-card-drop-preview-host'

    const preview = card.cloneNode(true) as HTMLElement
    preview.classList.remove('is-selected', 'ProseMirror-selectednode')
    preview.classList.add('editor-card-drop-preview')
    preview.removeAttribute('data-card-dragging')
    preview.removeAttribute('style')
    preview.setAttribute('aria-hidden', 'true')
    preview.setAttribute('contenteditable', 'false')
    for (const element of preview.querySelectorAll<HTMLElement>('[id], [contenteditable]')) {
        element.removeAttribute('id')
        element.setAttribute('contenteditable', 'false')
    }
    host.append(preview)
    document.body.append(host)
    return preview
}

function updateCardDropPreview(
    editorElement: HTMLElement,
    drag: CardDragState,
    clientX: number,
    clientY: number
): void {
    const preview = drag.preview
    if (!preview) return

    const editorRect = editorElement.getBoundingClientRect()
    const moveAsDocumentBlock =
        isStandaloneCard(cardVariant(drag.card)) || isVerticalCardDrag(clientX - drag.startX, clientY - drag.startY)
    const documentTarget = getDocumentDropTarget(
        editorElement,
        drag.card,
        clientY,
        drag.originalVisualRect,
        moveAsDocumentBlock
    )
    if (documentTarget) {
        setCardDropPreviewRect(
            preview,
            editorRect.left,
            documentTarget.boundaryY,
            editorRect.width,
            Math.max(MIN_SCALED_DIAMOND_HEIGHT, drag.originalRect.height)
        )
        return
    }

    const rows = collectCardRows(editorElement)
    const stableVisualRect = (card: HTMLElement) =>
        card === drag.card ? drag.originalVisualRect : getCardVisualRect(card)
    const stableRect = (card: HTMLElement) => (card === drag.card ? drag.originalRect : card.getBoundingClientRect())
    const targetRowIndex = getCardDropRowIndex(
        rows.map((row) => ({
            top: Math.min(...row.map((card) => stableVisualRect(card).top)),
            bottom: Math.max(...row.map((card) => stableVisualRect(card).bottom))
        })),
        clientY
    )
    const columnGap = Number.parseFloat(window.getComputedStyle(editorElement).columnGap) || 0

    if (targetRowIndex === rows.length) {
        const lastBottom = Math.max(...rows.flat().map((card) => stableVisualRect(card).bottom))
        setCardDropPreviewRect(preview, editorRect.left, lastBottom + 24, editorRect.width, drag.originalRect.height)
        return
    }

    const targetRow = rows[targetRowIndex] ?? drag.row
    const sourceIndex = targetRow.indexOf(drag.card)
    const rawTargetIndex = getCardHorizontalDropIndex(
        targetRow.map((card) => {
            const rect = stableVisualRect(card)
            return { left: rect.left, right: rect.right }
        }),
        clientX
    )
    const cardsWithoutDragged = targetRow.filter((card) => card !== drag.card)
    const insertionIndex = Math.max(
        0,
        Math.min(
            cardsWithoutDragged.length,
            sourceIndex >= 0 && rawTargetIndex > sourceIndex ? rawTargetIndex - 1 : rawTargetIndex
        )
    )
    const prospectiveCards = [...cardsWithoutDragged]
    prospectiveCards.splice(insertionIndex, 0, drag.card)
    if (insertionIndex >= MAX_CARDS_PER_ROW) {
        const targetBottom = Math.max(...targetRow.map((card) => stableVisualRect(card).bottom))
        setCardDropPreviewRect(preview, editorRect.left, targetBottom + 24, editorRect.width, drag.originalRect.height)
        return
    }

    const previewCards = prospectiveCards.slice(0, MAX_CARDS_PER_ROW)
    const attachments = getCardRowAttachmentFlags(previewCards.map(getCardShape))
    const attachmentCount = attachments.filter(Boolean).length
    const visibleGapCount = Math.max(0, previewCards.length - 1 - attachmentCount)
    const effectiveCardCount = previewCards.length - attachmentCount / 2
    const cardWidth = Math.max(0, (editorRect.width - columnGap * visibleGapCount) / effectiveCardCount)
    const rowTop = Math.min(...targetRow.map((card) => stableRect(card).top))
    const rowHeight = Math.max(drag.originalRect.height, ...targetRow.map((card) => stableRect(card).height))
    let left = editorRect.left
    let attachmentDepth = 0
    let topOffset = 0

    for (let index = 0; index <= insertionIndex; index += 1) {
        const attached = attachments[index] ?? false
        if (index > 0) left += attached ? cardWidth / 2 : cardWidth + columnGap
        if (attached) {
            attachmentDepth += 1
            topOffset = getDiamondAttachmentOffset(attachmentDepth, rowHeight)
        } else {
            attachmentDepth = 0
            topOffset = 0
        }
    }

    setCardDropPreviewRect(preview, left, rowTop + topOffset, cardWidth, rowHeight)
}

function setCardDropPreviewRect(preview: HTMLElement, left: number, top: number, width: number, height: number): void {
    preview.style.left = `${left}px`
    preview.style.top = `${top}px`
    preview.style.width = `${width}px`
    preview.style.height = `${height}px`
    preview.style.setProperty('--wiki-card-row-width', `${width}px`)
    preview.style.setProperty('--wiki-card-row-height', `${height}px`)
}

function renderCardRows(
    editorElement: HTMLElement,
    editorFrame: HTMLElement,
    controlsLayer: HTMLElement | null,
    normalizeAttachments: boolean
): void {
    const rows = collectCardRows(editorElement, true)
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (normalizeAttachments && tiptapEditor && normalizeCardRowMetadata(tiptapEditor, rows)) return

    const editorRect = editorElement.getBoundingClientRect()
    const frameRect = controlsLayer ? editorFrame.getBoundingClientRect() : null
    const columnGap = Number.parseFloat(window.getComputedStyle(editorElement).columnGap) || 0

    controlsLayer?.replaceChildren()

    if (controlsLayer && frameRect) {
        for (const [blockIndex, child] of Array.from(editorElement.children).entries()) {
            if (!(child instanceof HTMLElement)) continue

            if (child.matches('.tableWrapper')) {
                const rect = child.getBoundingClientRect()
                const handle = createTableMoveHandle(blockIndex)
                handle.style.left = `${rect.right - frameRect.left - 23}px`
                handle.style.top = `${rect.bottom - frameRect.top - 23}px`
                controlsLayer.append(handle)
                continue
            }

            if (!child.matches('hr')) continue
            const rect = child.getBoundingClientRect()
            const handle = createHorizontalRuleMoveHandle(blockIndex)
            handle.style.left = `${rect.right - frameRect.left - 23}px`
            handle.style.top = `${rect.top - frameRect.top + rect.height / 2 - 11.5}px`
            controlsLayer.append(handle)
        }
    }

    for (const cards of rows) {
        const firstCard = cards[0]
        const lastCard = cards.at(-1)
        if (!firstCard || !lastCard) continue

        const attachmentFlags = getCardRowAttachmentFlags(
            cards.map(getCardShape),
            normalizeAttachments ? undefined : cards.map((card) => card.dataset.attached === 'true')
        )
        const attachmentCount = attachmentFlags.filter(Boolean).length
        const visibleGapCount = Math.max(0, cards.length - 1 - attachmentCount)
        const effectiveCardCount = cards.length - attachmentCount / 2
        const rowGapWidth = columnGap * visibleGapCount
        const cardVisualWidthPixels = Math.max(0, (editorRect.width - rowGapWidth) / effectiveCardCount)
        const baseDiamondHeight = Math.min(264, Math.max(228, window.innerWidth * 0.22))
        const sharedHeightCard = cards.find((card) => card.style.height)
        const sharedHeight = sharedHeightCard?.getBoundingClientRect().height ?? 0
        const rowContentMinimumHeight = Math.max(MIN_SCALED_DIAMOND_HEIGHT, ...cards.map(getCardContentMinimumHeight))
        const diamondHeightPixels = Math.max(
            rowContentMinimumHeight,
            sharedHeight > 0
                ? sharedHeight
                : Math.max(MIN_SCALED_DIAMOND_HEIGHT, baseDiamondHeight / Math.sqrt(cards.length))
        )
        let attachmentDepth = 0
        let maxAttachmentOffsetY = 0

        for (const [index, card] of cards.entries()) {
            delete card.dataset.cardRowDensity
            card.style.marginRight = ''

            const attached = attachmentFlags[index] ?? false
            const previousCard = cards[index - 1]
            if (attached && previousCard) {
                const attachedMarginLeft = -cardVisualWidthPixels / 2 - columnGap
                attachmentDepth += 1
                const attachmentOffsetY = getDiamondAttachmentOffset(attachmentDepth, diamondHeightPixels)
                maxAttachmentOffsetY = Math.max(maxAttachmentOffsetY, attachmentOffsetY)
                card.style.marginLeft = `${attachedMarginLeft}px`
                card.style.transform = `translateY(${attachmentOffsetY}px)`
            } else {
                attachmentDepth = 0
                card.style.marginLeft = ''
                card.style.transform = ''
            }
            card.style.zIndex = attached ? String(cards.length - index) : ''

            if (attachmentCount > 0) {
                card.style.removeProperty('width')
            }
            card.dataset.cardRowManaged = 'true'
            card.style.minHeight = `${rowContentMinimumHeight}px`
            card.style.setProperty('--wiki-card-row-width', `${cardVisualWidthPixels}px`)
            card.style.setProperty('--wiki-card-row-height', `${diamondHeightPixels}px`)
        }

        const occupiedWidth =
            cards.reduce((total, card) => total + card.getBoundingClientRect().width, 0) +
            columnGap * Math.max(0, cards.length - 1) +
            cards.slice(1).reduce((total, card) => total + (Number.parseFloat(card.style.marginLeft) || 0), 0)
        lastCard.style.marginRight = `${Math.max(0, editorRect.width - occupiedWidth)}px`

        for (const card of cards) {
            if (attachmentCount > 0) {
                card.style.marginBottom = `${maxAttachmentOffsetY + 24}px`
            } else {
                card.style.removeProperty('margin-bottom')
            }
        }

        if (sharedHeightCard) {
            syncCardRowHeight(cards, sharedHeightCard)
        }

        if (!controlsLayer || !frameRect) continue

        // The lead greeting is a document-wide block. Keeping the row add control
        // off this row prevents another card from being inserted beside it.
        if (isStandaloneCard(cardVariant(firstCard))) continue

        const firstCardRect = getCardVisualRect(firstCard)
        const rowBottom = Math.max(...cards.map((card) => getCardVisualRect(card).bottom))
        const lastCardRect = getCardVisualRect(lastCard)

        const addButton = createRowCardAddButton()
        addButton.style.top = `${firstCardRect.top - frameRect.top}px`
        addButton.style.left = `${lastCardRect.right + columnGap - frameRect.left}px`
        addButton.style.width = `${ROW_ADD_BUTTON_WIDTH}px`
        addButton.style.height = `${rowBottom - firstCardRect.top}px`
        addButton.addEventListener('click', () => insertCardIntoRow(editorElement, lastCard, getCardShape(lastCard)))
        addButton.addEventListener('contextmenu', (event) => {
            event.preventDefault()
            event.stopPropagation()
            openRowCardShapeMenu(editorElement, controlsLayer, lastCard, event)
        })
        controlsLayer.append(addButton)
    }
}

function collectCardRows(editorElement: HTMLElement, respectStoredRows = true): HTMLElement[][] {
    const rows: HTMLElement[][] = []
    let currentRow: HTMLElement[] = []
    const useAttachmentFallback = Boolean(editorElement.querySelector('.wiki-highlight-block[data-attached="true"]'))

    for (const child of editorElement.children) {
        const card = child.matches('.node-wikiHighlightBlock')
            ? child.querySelector<HTMLElement>(':scope > .wiki-highlight-block')
            : null
        if (card) {
            const standalone = isStandaloneCard(cardVariant(card))
            if (
                currentRow.length > 0 &&
                (standalone ||
                    (respectStoredRows &&
                        (card.dataset.rowStart === 'true' ||
                            (useAttachmentFallback &&
                                getCardShape(currentRow[currentRow.length - 1]!) === 'diamond' &&
                                getCardShape(card) === 'diamond' &&
                                card.dataset.attached !== 'true'))))
            ) {
                rows.push(currentRow)
                currentRow = []
            }
            if (currentRow.length >= MAX_CARDS_PER_ROW) {
                rows.push(currentRow)
                currentRow = []
            }
            currentRow.push(card)
            if (standalone || currentRow.length === MAX_CARDS_PER_ROW) {
                rows.push(currentRow)
                currentRow = []
            }
            continue
        }

        if (currentRow.length > 0) {
            rows.push(currentRow)
            currentRow = []
        }
    }

    if (currentRow.length > 0) {
        rows.push(currentRow)
    }

    return rows
}

function cardVariant(card: HTMLElement): string | undefined {
    return card.dataset.variant
}

export function isStandaloneCard(variant: string | undefined): boolean {
    return variant === 'lead'
}

export function isVerticalCardDrag(deltaX: number, deltaY: number): boolean {
    return Math.abs(deltaY) > Math.abs(deltaX)
}

export function getCardDropRowIndex(rowBounds: Array<{ top: number; bottom: number }>, clientY: number): number {
    if (rowBounds.length === 0) return -1

    const lastRow = rowBounds.at(-1)
    if (lastRow && clientY > lastRow.bottom) return rowBounds.length

    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY
    for (const [index, bounds] of rowBounds.entries()) {
        const distance =
            clientY < bounds.top ? bounds.top - clientY : clientY > bounds.bottom ? clientY - bounds.bottom : 0
        if (distance < closestDistance) {
            closestIndex = index
            closestDistance = distance
        }
    }
    return closestIndex
}

export function getCardHorizontalDropIndex(
    cardBounds: Array<{ left: number; right: number }>,
    clientX: number
): number {
    for (const [index, bounds] of cardBounds.entries()) {
        if (clientX < bounds.left + (bounds.right - bounds.left) / 2) return index
    }
    return cardBounds.length
}

function getCardDropIndex(row: HTMLElement[], clientX: number): number {
    return getCardHorizontalDropIndex(
        row.map((card) => {
            const rect = getCardVisualRect(card)
            return { left: rect.left, right: rect.right }
        }),
        clientX
    )
}

function getCardVisualWidthScale(card: HTMLElement): number {
    const scale = Number.parseFloat(window.getComputedStyle(card).getPropertyValue('--wiki-diamond-width-scale'))
    return Number.isFinite(scale) && scale >= 1 ? scale : DEFAULT_CARD_VISUAL_WIDTH_SCALE
}

function getCardVisualRect(card: HTMLElement): DOMRect {
    const shape = card.querySelector<HTMLElement>(':scope > .wiki-highlight-shape')
    if (shape) {
        const shapeRect = shape.getBoundingClientRect()
        if (shapeRect.width > 0 && shapeRect.height > 0) return shapeRect
    }

    const rect = card.getBoundingClientRect()
    const visualWidth = rect.width * getCardVisualWidthScale(card)
    const horizontalOverhang = (visualWidth - rect.width) / 2

    return new DOMRect(rect.left - horizontalOverhang, rect.top, visualWidth, rect.height)
}

export function getReorderedCardRows<T>(rows: T[][], item: T, targetRow: T[], targetIndex: number): T[][] {
    const nextRows = rows.map((row) => [...row])
    const sourceRowIndex = rows.findIndex((row) => row.includes(item))
    const targetRowIndex = rows.indexOf(targetRow)
    if (sourceRowIndex < 0 || targetRowIndex < 0) return nextRows

    const sourceIndex = nextRows[sourceRowIndex]!.indexOf(item)
    const sameRow = sourceRowIndex === targetRowIndex
    nextRows[sourceRowIndex]!.splice(sourceIndex, 1)
    const normalizedTargetIndex = Math.max(0, Math.min(targetRow.length, targetIndex))
    const insertionIndex =
        sameRow && normalizedTargetIndex > sourceIndex ? normalizedTargetIndex - 1 : normalizedTargetIndex
    const destinationRow = nextRows[targetRowIndex]!
    destinationRow.splice(Math.min(insertionIndex, destinationRow.length), 0, item)

    if (destinationRow.length > MAX_CARDS_PER_ROW) {
        const overflow = destinationRow.splice(MAX_CARDS_PER_ROW)
        nextRows.splice(targetRowIndex + 1, 0, overflow)
    }
    return nextRows.filter((row) => row.length > 0)
}

function moveCard(
    editorElement: HTMLElement,
    card: HTMLElement,
    rows: HTMLElement[][],
    targetRow: HTMLElement[],
    targetIndex: number,
    attached: boolean
): boolean {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    const sourceRow = rows.find((row) => row.includes(card))
    const sourceIndex = sourceRow?.indexOf(card) ?? -1
    const samePosition = sourceRow === targetRow && (sourceIndex === targetIndex || sourceIndex === targetIndex - 1)
    if (!tiptapEditor || !sourceRow || sourceIndex < 0 || samePosition) return false
    const reorderedRows = getReorderedCardRows(rows, card, targetRow, targetIndex)

    const sourcePosition = getCardNodePosition(tiptapEditor, card)
    const cardNode = tiptapEditor.state.doc.nodeAt(sourcePosition)
    if (cardNode?.type.name !== 'wikiHighlightBlock') return false

    const normalizedTargetIndex = Math.max(0, Math.min(targetRow.length, targetIndex))
    const targetCard = targetRow[normalizedTargetIndex] ?? targetRow.at(-1)
    if (!targetCard || targetCard === card) return false

    let insertPosition = getCardNodePosition(tiptapEditor, targetCard)
    if (normalizedTargetIndex === targetRow.length) {
        insertPosition += tiptapEditor.state.doc.nodeAt(insertPosition)?.nodeSize ?? 0
    }
    if (tiptapEditor.state.doc.resolve(insertPosition).depth !== 0) return false

    const movedCardNode = cardNode.type.create({ ...cardNode.attrs, attached }, cardNode.content, cardNode.marks)
    const transaction = tiptapEditor.state.tr.delete(sourcePosition, sourcePosition + cardNode.nodeSize)
    const mappedInsertPosition = transaction.mapping.map(insertPosition)
    if (transaction.doc.resolve(mappedInsertPosition).depth !== 0) return false
    transaction.insert(mappedInsertPosition, movedCardNode)
    applyCardRowMetadata(
        transaction,
        reorderedRows.map((row) => row.length)
    )
    transaction.setMeta(CARD_USER_EDIT_META, true)
    tiptapEditor.view.dispatch(transaction)
    tiptapEditor.view.focus()
    return true
}

function moveCardToNewRowBelow(editorElement: HTMLElement, card: HTMLElement, rows: HTMLElement[][]): boolean {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    const sourceRow = rows.find((row) => row.includes(card))
    if (!tiptapEditor || !sourceRow) return false

    const sourcePosition = getCardNodePosition(tiptapEditor, card)
    const cardNode = tiptapEditor.state.doc.nodeAt(sourcePosition)
    const paragraphType = tiptapEditor.schema.nodes.paragraph
    if (cardNode?.type.name !== 'wikiHighlightBlock' || !paragraphType) return false

    const reorderedRows = rows.map((row) => row.filter((rowCard) => rowCard !== card)).filter((row) => row.length > 0)
    reorderedRows.push([card])

    const movedCardNode = cardNode.type.create(
        { ...cardNode.attrs, attached: false, rowStart: true },
        cardNode.content,
        cardNode.marks
    )
    const transaction = tiptapEditor.state.tr.delete(sourcePosition, sourcePosition + cardNode.nodeSize)
    let insertPosition = transaction.doc.content.size
    const lastNode = transaction.doc.lastChild
    if (lastNode?.type.name !== 'paragraph' || lastNode.content.size > 0) {
        transaction.insert(insertPosition, paragraphType.create())
        insertPosition = transaction.doc.content.size
    }
    transaction.insert(insertPosition, movedCardNode)
    transaction.insert(insertPosition + movedCardNode.nodeSize, paragraphType.create())
    applyCardRowMetadata(
        transaction,
        reorderedRows.map((row) => row.length)
    )
    transaction.setMeta(CARD_USER_EDIT_META, true)
    tiptapEditor.view.dispatch(transaction)
    tiptapEditor.view.focus()
    return true
}

function applyCardRowMetadata(transaction: Parameters<Editor['view']['dispatch']>[0], rowLengths: number[]): void {
    const rowStarts = new Set<number>()
    let nextRowStart = 0
    for (const rowLength of rowLengths) {
        rowStarts.add(nextRowStart)
        nextRowStart += rowLength
    }

    let cardIndex = 0
    let previousShape: HighlightBlockShape | null = null
    transaction.doc.forEach((node, offset) => {
        if (node.type.name !== 'wikiHighlightBlock') {
            previousShape = null
            return
        }

        const rowStart = rowStarts.has(cardIndex)
        const shape: HighlightBlockShape = node.attrs.shape === 'rectangle' ? 'rectangle' : 'diamond'
        const attached = !rowStart && shape === 'diamond' && previousShape === 'diamond'
        if (node.attrs.rowStart !== rowStart || node.attrs.attached !== attached) {
            transaction.setNodeMarkup(offset, undefined, { ...node.attrs, rowStart, attached })
        }
        previousShape = shape
        cardIndex += 1
    })
}

function updateCardAttachment(editorElement: HTMLElement, card: HTMLElement, attached: boolean): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor || !card.isConnected) return

    const nodePosition = getCardNodePosition(tiptapEditor, card)
    const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
    if (cardNode?.type.name !== 'wikiHighlightBlock' || cardNode.attrs.attached === attached) return

    const transaction = tiptapEditor.state.tr.setNodeMarkup(nodePosition, undefined, {
        ...cardNode.attrs,
        attached
    })
    transaction.setMeta(CARD_USER_EDIT_META, true)
    tiptapEditor.view.dispatch(transaction)
}

function createRowCardAddButton(): HTMLButtonElement {
    const button = document.createElement('button')
    const icon = document.createElement('span')
    button.type = 'button'
    button.className = 'editor-card-row-add-control'
    button.setAttribute('aria-label', '이 행에 카드 추가')
    button.title = '이 행에 카드 추가'

    icon.className = 'editor-card-row-add-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '+'
    button.append(icon)

    return button
}

function createTableMoveHandle(blockIndex: number): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'wiki-table-move-handle'
    button.dataset.tableBlockIndex = String(blockIndex)
    button.setAttribute('aria-label', '표 선택 및 이동')
    button.title = '클릭하여 표 선택, 드래그하여 이동'
    return button
}

function createHorizontalRuleMoveHandle(blockIndex: number): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'wiki-horizontal-rule-move-handle'
    button.dataset.ruleBlockIndex = String(blockIndex)
    button.setAttribute('aria-label', '구분선 이동')
    button.title = '드래그하여 구분선 이동'
    return button
}

function openRowCardShapeMenu(
    editorElement: HTMLElement,
    controlsLayer: HTMLElement,
    lastCard: HTMLElement,
    event: MouseEvent
): void {
    controlsLayer.querySelector('.editor-card-shape-menu')?.remove()

    const menu = document.createElement('div')
    menu.className = 'editor-card-shape-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', '카드 행 모양')
    menu.style.left = `${event.clientX - controlsLayer.getBoundingClientRect().left}px`
    menu.style.top = `${event.clientY - controlsLayer.getBoundingClientRect().top}px`

    const closeMenu = (pointerEvent: PointerEvent) => {
        if (pointerEvent.target instanceof Node && menu.contains(pointerEvent.target)) return
        menu.remove()
        window.removeEventListener('pointerdown', closeMenu)
    }

    for (const [shape, label] of [
        ['rectangle', '직사각형'],
        ['diamond', '마름모']
    ] as const satisfies ReadonlyArray<readonly [HighlightBlockShape, string]>) {
        const button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('role', 'menuitem')
        button.textContent = label
        button.addEventListener('click', () => {
            window.removeEventListener('pointerdown', closeMenu)
            setCardRowShapeAndMaybeInsert(editorElement, lastCard, shape)
        })
        menu.append(button)
    }

    controlsLayer.append(menu)
    window.addEventListener('pointerdown', closeMenu)
}

function syncCardRowHeight(cards: HTMLElement[], source: HTMLElement): void {
    if (!source.isConnected) return

    const height = `${source.getBoundingClientRect().height}px`
    for (const card of cards) {
        if (card.isConnected) {
            card.style.height = height
        }
    }
}

function persistCardRowHeight(editorElement: HTMLElement, cards: HTMLElement[], source: HTMLElement): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor || !source.isConnected) return

    const height = Math.max(132, Math.min(1200, source.getBoundingClientRect().height))
    const normalizedHeight = Number(height.toFixed(1)) + 'px'
    let transaction = tiptapEditor.state.tr
    let changed = false
    for (const card of cards) {
        const nodePosition = getCardNodePosition(tiptapEditor, card)
        const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
        if (cardNode?.type.name !== 'wikiHighlightBlock' || cardNode.attrs.height === normalizedHeight) continue

        transaction = transaction.setNodeMarkup(nodePosition, undefined, {
            ...cardNode.attrs,
            height: normalizedHeight
        })
        changed = true
    }
    if (!changed) return

    transaction.setMeta(CARD_USER_EDIT_META, true)
    tiptapEditor.view.dispatch(transaction)
}

function insertCardIntoRow(
    editorElement: HTMLElement,
    lastCard: HTMLElement,
    shape: HighlightBlockShape = 'diamond'
): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor) return

    const cardsBeforeInsertion = Array.from(editorElement.querySelectorAll<HTMLElement>('.wiki-highlight-block'))
    const cardIndex = cardsBeforeInsertion.indexOf(lastCard)
    const nodePosition = getCardNodePosition(tiptapEditor, lastCard)
    const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
    if (cardIndex < 0 || cardNode?.type.name !== 'wikiHighlightBlock') return

    const row = collectCardRows(editorElement).find((cards) => cards.includes(lastCard)) ?? []
    if (row.length >= MAX_CARDS_PER_ROW) return

    tiptapEditor
        .chain()
        .focus()
        .insertContentAt(nodePosition + cardNode.nodeSize, {
            ...CARD_NODE,
            attrs: { ...CARD_NODE.attrs, attached: shape === 'diamond' && row.length > 0, rowStart: false, shape }
        })
        .run()
    window.requestAnimationFrame(() => {
        const insertedCard = editorElement.querySelectorAll<HTMLElement>('.wiki-highlight-block')[cardIndex + 1]
        if (insertedCard) focusCardPlaceholder(editorElement, insertedCard)
    })
}

function setSingleCardShape(editorElement: HTMLElement, card: HTMLElement, shape: HighlightBlockShape): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    const row = collectCardRows(editorElement).find((cards) => cards.includes(card))
    if (!tiptapEditor || !row) return

    const shapes = row.map((rowCard) => (rowCard === card ? shape : getCardShape(rowCard)))
    const attachments = getCardRowAttachmentFlags(shapes)
    let transaction = tiptapEditor.state.tr
    let changed = false

    for (const [index, rowCard] of row.entries()) {
        const nodePosition = getCardNodePosition(tiptapEditor, rowCard)
        const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
        if (cardNode?.type.name !== 'wikiHighlightBlock') continue

        const nextShape = shapes[index] ?? getCardShape(rowCard)
        const nextAttrs = {
            ...cardNode.attrs,
            shape: nextShape,
            attached: attachments[index] ?? false,
            rowStart: index === 0
        }
        if (
            cardNode.attrs.shape === nextAttrs.shape &&
            cardNode.attrs.attached === nextAttrs.attached &&
            cardNode.attrs.rowStart === nextAttrs.rowStart
        ) {
            continue
        }

        transaction = transaction.setNodeMarkup(nodePosition, undefined, nextAttrs)
        changed = true
    }

    if (!changed) return
    transaction.setMeta(CARD_USER_EDIT_META, true)
    tiptapEditor.view.dispatch(transaction)
    tiptapEditor.view.focus()
}

function setCardRowShapeAndMaybeInsert(
    editorElement: HTMLElement,
    lastCard: HTMLElement,
    shape: HighlightBlockShape
): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    const row = collectCardRows(editorElement).find((cards) => cards.includes(lastCard)) ?? []
    if (!tiptapEditor || row.length === 0) return

    let transaction = tiptapEditor.state.tr
    for (const [index, card] of row.entries()) {
        const nodePosition = getCardNodePosition(tiptapEditor, card)
        const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
        if (cardNode?.type.name !== 'wikiHighlightBlock') continue

        transaction = transaction.setNodeMarkup(nodePosition, undefined, {
            ...cardNode.attrs,
            attached: shape === 'diamond' && index > 0,
            rowStart: index === 0,
            shape
        })
    }
    tiptapEditor.view.dispatch(transaction)
    if (row.length < MAX_CARDS_PER_ROW) insertCardIntoRow(editorElement, lastCard, shape)
}

function normalizeCardRowMetadata(tiptapEditor: Editor, rows: HTMLElement[][]): boolean {
    let transaction = tiptapEditor.state.tr
    let changed = false

    for (const row of rows) {
        for (const [index, card] of row.entries()) {
            const shape = getCardShape(card)
            const previousCard = row[index - 1]
            const previousShape = previousCard ? getCardShape(previousCard) : null
            const attached = shape === 'diamond' && previousShape === 'diamond'
            const rowStart = index === 0
            const nodePosition = getCardNodePosition(tiptapEditor, card)
            const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
            if (
                cardNode?.type.name !== 'wikiHighlightBlock' ||
                (cardNode.attrs.attached === attached && cardNode.attrs.rowStart === rowStart)
            )
                continue

            transaction = transaction.setNodeMarkup(nodePosition, undefined, {
                ...cardNode.attrs,
                attached,
                rowStart
            })
            changed = true
        }
    }

    if (changed) tiptapEditor.view.dispatch(transaction)
    return changed
}

function getCardShape(card: HTMLElement): HighlightBlockShape {
    return card.dataset.shape === 'rectangle' ? 'rectangle' : 'diamond'
}

export function getCardRowAttachmentFlags(shapes: HighlightBlockShape[], storedAttachments?: boolean[]): boolean[] {
    return shapes.map(
        (shape, index) =>
            index > 0 &&
            shape === 'diamond' &&
            shapes[index - 1] === 'diamond' &&
            (storedAttachments === undefined || storedAttachments[index] === true)
    )
}

export function getDiamondAttachmentOffset(attachmentDepth: number, diamondHeight: number): number {
    return attachmentDepth % 2 === 1 ? diamondHeight / 2 : 0
}

function focusCardPlaceholder(editorElement: HTMLElement, card: HTMLElement): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor || !card.isConnected) return

    const nodePosition = getCardNodePosition(tiptapEditor, card)
    tiptapEditor
        .chain()
        .focus()
        .setTextSelection(nodePosition + 2)
        .run()
}

function getSelectedCard(editorElement: HTMLElement): HTMLElement | null {
    const selection = window.getSelection()
    const anchorElement =
        selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement
    const card = anchorElement?.closest<HTMLElement>('.wiki-highlight-block')
    return card && editorElement.contains(card) ? card : null
}

function isCardEmpty(card: HTMLElement): boolean {
    const content = card.querySelector<HTMLElement>('.wiki-highlight-content')
    return !content?.textContent?.trim()
}

function deleteEmptyCard(editorElement: HTMLElement, card: HTMLElement): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor || !card.isConnected) return

    const row = collectCardRows(editorElement).find((cards) => cards.includes(card))
    const nodePosition = getCardNodePosition(tiptapEditor, card)
    const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
    if (cardNode?.type.name !== 'wikiHighlightBlock') return

    let deleteTo = nodePosition + cardNode.nodeSize
    if (row?.length === 1) {
        const separator = tiptapEditor.state.doc.nodeAt(deleteTo)
        if (separator?.type.name === 'paragraph' && separator.content.size === 0) {
            deleteTo += separator.nodeSize
        }
    }

    const transaction = tiptapEditor.state.tr.delete(nodePosition, deleteTo)
    if (transaction.doc.childCount === 0) {
        const paragraphType = tiptapEditor.schema.nodes.paragraph
        if (paragraphType) {
            transaction.insert(0, paragraphType.create())
        }
    }
    tiptapEditor.view.dispatch(transaction)
    tiptapEditor.view.focus()
}

export function getCardNodeAncestorDepth(nodeNames: string[]): number {
    for (let depth = nodeNames.length - 1; depth > 0; depth -= 1) {
        if (nodeNames[depth] === 'wikiHighlightBlock') return depth
    }
    return -1
}

function getCardNodePosition(tiptapEditor: Editor, card: HTMLElement): number {
    const contentPosition = tiptapEditor.view.posAtDOM(card, 0)
    const resolvedPosition = tiptapEditor.state.doc.resolve(contentPosition)
    const cardDepth = getCardNodeAncestorDepth(
        Array.from({ length: resolvedPosition.depth + 1 }, (_, depth) => resolvedPosition.node(depth).type.name)
    )
    return cardDepth > 0 ? resolvedPosition.before(cardDepth) : contentPosition
}
