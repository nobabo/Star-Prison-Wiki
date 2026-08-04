import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { HighlightBlockShape } from '@coconut-studio/wiki-markdown'

const CARD_NODE = {
    type: 'wikiHighlightBlock',
    attrs: {
        width: '100%',
        variant: 'panel',
        attached: false,
        shape: 'diamond'
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
const ROW_ADD_BUTTON_WIDTH = 52
const MAX_CARDS_PER_ROW = 3
const MIN_SCALED_DIAMOND_HEIGHT = 132
const DEFAULT_CARD_VISUAL_WIDTH_SCALE = 1

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
    moved: boolean
}

export function useCardInsertControl(pageId: string): void {
    useEffect(() => {
        let frame = 0
        let control: HTMLButtonElement | null = null
        let editorElement: HTMLElement | null = null
        let contextMenuBridge: ((event: MouseEvent) => void) | null = null
        let selectionContextCleanup: (() => void) | null = null
        let rowControlsCleanup: (() => void) | null = null

        const installControl = () => {
            const editorFrame = document.querySelector<HTMLElement>('.editor-frame')
            const editor = editorFrame?.querySelector<HTMLElement>('.editor-surface')

            if (!editorFrame || !editor) {
                frame = window.requestAnimationFrame(installControl)
                return
            }

            control = createCardInsertButton()
            control.addEventListener('click', () => insertCardAtDocumentEnd(editor))
            editorFrame.after(control)
            editorElement = editor
            contextMenuBridge = (event) => bridgeCardContextMenu(event, editor)
            editor.addEventListener('contextmenu', contextMenuBridge, true)
            selectionContextCleanup = installSelectionContextMenu(editor)
            rowControlsCleanup = installCardRowControls(editor, editorFrame)
        }

        frame = window.requestAnimationFrame(installControl)

        return () => {
            window.cancelAnimationFrame(frame)
            control?.remove()
            if (editorElement && contextMenuBridge) {
                editorElement.removeEventListener('contextmenu', contextMenuBridge, true)
            }
            selectionContextCleanup?.()
            rowControlsCleanup?.()
        }
    }, [pageId])
}

function createCardInsertButton(): HTMLButtonElement {
    const button = document.createElement('button')
    const icon = document.createElement('span')

    button.type = 'button'
    button.className = 'editor-card-insert-control'
    button.setAttribute('aria-label', '새 카드 행 추가')

    icon.className = 'editor-card-insert-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '+'

    button.append(icon)

    return button
}

function insertCardAtDocumentEnd(editor: HTMLElement): void {
    const tiptapEditor = (editor as TiptapEditorElement).editor
    if (!tiptapEditor) return

    const { doc } = tiptapEditor.state
    const isEmptyDocument =
        doc.childCount === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0
    const insertionRange = isEmptyDocument ? { from: 0, to: doc.content.size } : doc.content.size
    tiptapEditor.chain().focus().insertContentAt(insertionRange, [CARD_NODE, EMPTY_PARAGRAPH_NODE]).run()

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
    if (!(target instanceof Element) || !target.closest('.wiki-highlight-block')) return

    const editorContent = editor.closest<HTMLElement>('.editor-content')
    if (!editorContent) return

    event.preventDefault()
    event.stopPropagation()
    editorContent.dispatchEvent(
        new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: event.clientX,
            clientY: event.clientY
        })
    )
}

function installSelectionContextMenu(editor: HTMLElement): () => void {
    let dragStart: { x: number; y: number } | null = null

    const handleMouseDown = (event: MouseEvent) => {
        if (event.button !== 0) return
        dragStart = { x: event.clientX, y: event.clientY }
    }
    const handleMouseUp = (event: MouseEvent) => {
        const start = dragStart
        dragStart = null
        if (event.button !== 0 || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return

        window.requestAnimationFrame(() => {
            const selection = window.getSelection()
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
            if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return

            const rect = selection.getRangeAt(0).getBoundingClientRect()
            if (rect.width === 0 && rect.height === 0) return

            const editorContent = editor.closest<HTMLElement>('.editor-content')
            if (!editorContent) return

            editorContent.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    button: 2,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.bottom + 8
                })
            )
        })
    }

    editor.addEventListener('mousedown', handleMouseDown, true)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
        dragStart = null
        editor.removeEventListener('mousedown', handleMouseDown, true)
        window.removeEventListener('mouseup', handleMouseUp)
    }
}

function installCardRowControls(editorElement: HTMLElement, editorFrame: HTMLElement): () => void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor) return () => undefined

    const controlsLayer = document.createElement('div')
    controlsLayer.className = 'editor-card-row-controls'
    controlsLayer.setAttribute('aria-label', '카드 행 추가 도구')
    editorFrame.append(controlsLayer)

    let layoutFrame = 0
    let resizeFrame = 0
    let armedEmptyCard: HTMLElement | null = null
    let resizingRow: { source: HTMLElement; cards: HTMLElement[] } | null = null
    let pendingCardDrag: CardDragState | null = null
    const layoutRows = () => {
        window.cancelAnimationFrame(layoutFrame)
        layoutFrame = window.requestAnimationFrame(() => renderCardRows(editorElement, editorFrame, controlsLayer))
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

        const cardRect = card.getBoundingClientRect()
        const isResizeCorner = event.clientX >= cardRect.right - 16 && event.clientY >= cardRect.bottom - 16
        if (!isResizeCorner) return

        const row = collectCardRows(editorElement).find((cards) => cards.includes(card))
        resizingRow = { source: card, cards: row ?? [card] }
        for (const rowCard of resizingRow.cards) {
            rowCard.dataset.cardRowResizing = 'true'
        }
        syncCardRowHeight(resizingRow.cards, card)
    }
    const handleCardDragStart = (event: PointerEvent) => {
        if (event.button !== 0 || resizingRow) return

        const target = event.target
        if (!(target instanceof Element) || target.closest('a, button, input, textarea, select')) return

        const card = target.closest<HTMLElement>('.wiki-highlight-block[data-card-row-managed="true"]')
        if (!card) return

        const cardRect = card.getBoundingClientRect()
        if (event.clientX >= cardRect.right - 16 && event.clientY >= cardRect.bottom - 16) return

        const row = collectCardRows(editorElement).find((cards) => cards.includes(card))
        if (!row || row.length < 2) return

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
        }

        event.preventDefault()
        drag.card.style.transform = `${drag.baseTransform} translate(${deltaX}px, ${deltaY}px)`
    }
    const finishCardDrag = (event: PointerEvent) => {
        const drag = pendingCardDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingCardDrag = null

        releaseCardPointer(drag)

        if (drag.moved) {
            event.preventDefault()
            resetCardDragVisual(drag)
            const targetIndex = getCardDropIndex(drag.row, event.clientX)
            const attached = drag.card.dataset.shape === 'diamond' && targetIndex > 0
            if (!moveCardWithinRow(editorElement, drag.card, drag.row, targetIndex, attached)) {
                updateCardAttachment(editorElement, drag.card, attached)
            }
        } else {
            resetCardDragVisual(drag)
        }

        if (drag.moved) layoutRows()
    }
    const cancelCardDrag = (event: PointerEvent) => {
        const drag = pendingCardDrag
        if (!drag || event.pointerId !== drag.pointerId) return
        pendingCardDrag = null
        releaseCardPointer(drag)
        resetCardDragVisual(drag)
        if (drag.moved) layoutRows()
    }
    const syncResizingRow = () => {
        if (!resizingRow) return

        window.cancelAnimationFrame(resizeFrame)
        resizeFrame = window.requestAnimationFrame(() => {
            if (!resizingRow) return
            syncCardRowHeight(resizingRow.cards, resizingRow.source)
            layoutRows()
        })
    }
    const finishRowResize = () => {
        if (!resizingRow) return

        window.cancelAnimationFrame(resizeFrame)
        syncCardRowHeight(resizingRow.cards, resizingRow.source)
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
    editorElement.addEventListener('pointerdown', handleCardDragStart, true)
    editorElement.addEventListener('pointerdown', handleResizeStart, true)
    editorElement.addEventListener('keydown', handleEmptyCardDelete, true)
    window.addEventListener('pointermove', syncResizingRow)
    window.addEventListener('pointermove', handleCardDragMove)
    window.addEventListener('pointerup', finishRowResize)
    window.addEventListener('pointerup', finishCardDrag)
    window.addEventListener('pointercancel', finishRowResize)
    window.addEventListener('pointercancel', cancelCardDrag)
    window.addEventListener('resize', layoutRows)
    layoutRows()

    return () => {
        window.cancelAnimationFrame(layoutFrame)
        window.cancelAnimationFrame(resizeFrame)
        tiptapEditor.off('transaction', layoutRows)
        editorElement.removeEventListener('pointerdown', handleCardDragStart, true)
        editorElement.removeEventListener('pointerdown', handleResizeStart, true)
        editorElement.removeEventListener('keydown', handleEmptyCardDelete, true)
        window.removeEventListener('pointermove', syncResizingRow)
        window.removeEventListener('pointermove', handleCardDragMove)
        window.removeEventListener('pointerup', finishRowResize)
        window.removeEventListener('pointerup', finishCardDrag)
        window.removeEventListener('pointercancel', finishRowResize)
        window.removeEventListener('pointercancel', cancelCardDrag)
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
        disarmEmptyCard()
        controlsLayer.remove()
    }
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
    delete drag.card.dataset.cardDragging
    drag.card.style.transform = drag.baseTransform
    drag.card.style.opacity = drag.baseOpacity
    drag.card.style.zIndex = drag.baseZIndex
    drag.card.style.willChange = drag.baseWillChange
}

function renderCardRows(editorElement: HTMLElement, editorFrame: HTMLElement, controlsLayer: HTMLElement): void {
    const rows = collectCardRows(editorElement)
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (tiptapEditor && normalizeDiamondRowAttachments(tiptapEditor, rows)) return

    const editorRect = editorElement.getBoundingClientRect()
    const frameRect = editorFrame.getBoundingClientRect()
    const columnGap = Number.parseFloat(window.getComputedStyle(editorElement).columnGap) || 0

    controlsLayer.replaceChildren()

    for (const cards of rows) {
        const firstCard = cards[0]
        const lastCard = cards.at(-1)
        if (!firstCard || !lastCard) continue

        const attachmentCount = cards.reduce(
            (count, card, index) => count + (index > 0 && card.dataset.attached === 'true' ? 1 : 0),
            0
        )
        const visibleGapCount = Math.max(0, cards.length - 1 - attachmentCount)
        const effectiveCardCount = cards.length - attachmentCount / 2
        const rowGapWidth = columnGap * visibleGapCount
        const cardVisualWidthPixels = Math.max(0, (editorRect.width - rowGapWidth) / effectiveCardCount)
        const baseDiamondHeight = Math.min(264, Math.max(228, window.innerWidth * 0.22))
        const sharedHeightCard = cards.find((card) => card.style.height)
        const sharedHeight = sharedHeightCard?.getBoundingClientRect().height ?? 0
        const diamondHeightPixels =
            sharedHeight > 0
                ? sharedHeight
                : Math.max(MIN_SCALED_DIAMOND_HEIGHT, baseDiamondHeight / Math.sqrt(cards.length))
        let attachmentDepth = 0
        let maxAttachmentOffsetY = 0

        for (const [index, card] of cards.entries()) {
            delete card.dataset.cardRowDensity
            card.style.marginRight = ''

            const attached =
                index > 0 && card.dataset.shape === 'diamond' && cards[index - 1]?.dataset.shape === 'diamond'
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

        const firstCardRect = getCardVisualRect(firstCard)
        const rowBottom = Math.max(...cards.map((card) => getCardVisualRect(card).bottom))
        const lastCardRect = getCardVisualRect(lastCard)

        const addButton = createRowCardAddButton()
        addButton.style.top = `${firstCardRect.top - frameRect.top}px`
        addButton.style.left = `${Math.min(lastCardRect.right + columnGap, editorRect.right - ROW_ADD_BUTTON_WIDTH) - frameRect.left}px`
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

function collectCardRows(editorElement: HTMLElement): HTMLElement[][] {
    const rows: HTMLElement[][] = []
    let currentRow: HTMLElement[] = []

    for (const child of editorElement.children) {
        const card = child.matches('.node-wikiHighlightBlock')
            ? child.querySelector<HTMLElement>(':scope > .wiki-highlight-block')
            : null
        if (card) {
            if (currentRow.length >= MAX_CARDS_PER_ROW) {
                rows.push(currentRow)
                currentRow = []
            }
            currentRow.push(card)
            if (currentRow.length === MAX_CARDS_PER_ROW) {
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

function getCardDropIndex(row: HTMLElement[], clientX: number): number {
    for (const [index, card] of row.entries()) {
        const rect = card.getBoundingClientRect()
        if (clientX < rect.left + rect.width / 2) {
            return index
        }
    }

    return row.length
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

function moveCardWithinRow(
    editorElement: HTMLElement,
    card: HTMLElement,
    row: HTMLElement[],
    targetIndex: number,
    attached: boolean
): boolean {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    const sourceIndex = row.indexOf(card)
    if (!tiptapEditor || sourceIndex < 0 || sourceIndex === targetIndex || sourceIndex === targetIndex - 1) return false

    const sourcePosition = getCardNodePosition(tiptapEditor, card)
    const cardNode = tiptapEditor.state.doc.nodeAt(sourcePosition)
    if (cardNode?.type.name !== 'wikiHighlightBlock') return false

    const normalizedTargetIndex = Math.max(0, Math.min(row.length, targetIndex))
    const targetCard = row[normalizedTargetIndex] ?? row.at(-1)
    if (!targetCard || targetCard === card) return false

    let insertPosition = getCardNodePosition(tiptapEditor, targetCard)
    if (normalizedTargetIndex === row.length) {
        insertPosition += tiptapEditor.state.doc.nodeAt(insertPosition)?.nodeSize ?? 0
    }
    if (sourcePosition < insertPosition) {
        insertPosition -= cardNode.nodeSize
    }

    const movedCardNode = cardNode.type.create({ ...cardNode.attrs, attached }, cardNode.content, cardNode.marks)
    const transaction = tiptapEditor.state.tr
        .delete(sourcePosition, sourcePosition + cardNode.nodeSize)
        .insert(insertPosition, movedCardNode)
    tiptapEditor.view.dispatch(transaction)
    tiptapEditor.view.focus()
    return true
}

function updateCardAttachment(editorElement: HTMLElement, card: HTMLElement, attached: boolean): void {
    const tiptapEditor = (editorElement as TiptapEditorElement).editor
    if (!tiptapEditor || !card.isConnected) return

    const nodePosition = getCardNodePosition(tiptapEditor, card)
    const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
    if (cardNode?.type.name !== 'wikiHighlightBlock' || cardNode.attrs.attached === attached) return

    tiptapEditor.view.dispatch(
        tiptapEditor.state.tr.setNodeMarkup(nodePosition, undefined, {
            ...cardNode.attrs,
            attached
        })
    )
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
            attrs: { ...CARD_NODE.attrs, attached: shape === 'diamond' && row.length > 0, shape }
        })
        .run()
    window.requestAnimationFrame(() => {
        const insertedCard = editorElement.querySelectorAll<HTMLElement>('.wiki-highlight-block')[cardIndex + 1]
        if (insertedCard) focusCardPlaceholder(editorElement, insertedCard)
    })
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
            shape
        })
    }
    tiptapEditor.view.dispatch(transaction)
    if (row.length < MAX_CARDS_PER_ROW) insertCardIntoRow(editorElement, lastCard, shape)
}

function normalizeDiamondRowAttachments(tiptapEditor: Editor, rows: HTMLElement[][]): boolean {
    let transaction = tiptapEditor.state.tr
    let changed = false

    for (const row of rows) {
        for (const [index, card] of row.entries()) {
            const shape = getCardShape(card)
            const previousCard = row[index - 1]
            const previousShape = previousCard ? getCardShape(previousCard) : null
            const attached = shape === 'diamond' && previousShape === 'diamond'
            const nodePosition = getCardNodePosition(tiptapEditor, card)
            const cardNode = tiptapEditor.state.doc.nodeAt(nodePosition)
            if (cardNode?.type.name !== 'wikiHighlightBlock' || cardNode.attrs.attached === attached) continue

            transaction = transaction.setNodeMarkup(nodePosition, undefined, {
                ...cardNode.attrs,
                attached
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

function getCardNodePosition(tiptapEditor: Editor, card: HTMLElement): number {
    const contentPosition = tiptapEditor.view.posAtDOM(card, 0)
    const resolvedPosition = tiptapEditor.state.doc.resolve(contentPosition)
    return resolvedPosition.depth > 0 ? resolvedPosition.before(resolvedPosition.depth) : contentPosition
}
