import type { EmojiClickData } from 'emoji-picker-react'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, type Editor, useEditor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import {
    BetweenHorizontalEnd,
    BetweenHorizontalStart,
    BetweenVerticalEnd,
    BetweenVerticalStart,
    Bold,
    CalendarDays,
    CheckSquare,
    Clock,
    CloudSun,
    Code2,
    Columns3,
    AArrowDown,
    AArrowUp,
    Eraser,
    FileCode2,
    FileText,
    Italic,
    LayoutPanelTop,
    Link2,
    List,
    ListOrdered,
    MapPinned,
    Minus,
    PanelLeft,
    Quote,
    Rows3,
    Sigma,
    Strikethrough,
    Table2,
    TextQuote,
    ToggleRight,
    Trash2,
    Underline
} from 'lucide-react'
import {
    useCallback,
    useEffect,
    useEffectEvent,
    useMemo,
    useRef,
    useState,
    type ClipboardEvent,
    type DragEvent,
    type KeyboardEvent,
    type MouseEvent
} from 'react'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'

import type { WikiPageDetailDto, WikiPageDto, WikiUserDto } from '@coconut-studio/wiki-contracts'
import {
    HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
    normalizeHighlightBlockShape,
    normalizeHighlightBlockWidth,
    normalizeHighlightBlockBackgroundColor,
    normalizeQuoteBlockAttrs,
    normalizeQuoteColor,
    normalizeQuoteEmoji,
    normalizeQuoteTone,
    normalizeTableHeaderBackground
} from '@coconut-studio/wiki-markdown'
import type { HighlightBlockShape, QuoteTone } from '@coconut-studio/wiki-markdown'

import type { ApiClient } from '../../shared/api/wiki-api'
import { EditorContextMenus } from './components/EditorContextMenus'
import { EditorLinePresence, useEditorPresence } from './components/EditorPresence'
import { EditorHeader } from './components/EditorHeader'
import { EditorStatusBar } from './components/EditorStatusBar'
import { EditorTopBar } from './components/EditorTopBar'
import { SavepointPanel } from './components/SavepointPanel'
import type {
    ContextMenuState,
    ContextSubmenuKind,
    ContextSubmenuState,
    ExtraMenuAction,
    HighlightPreset,
    ToolbarAction,
    WikiLinkCategory
} from './editor-types'
import { InsertSpacesOnTab, ParagraphFirstSelectAll } from './extensions/editor-behavior'
import { PreventNestedDocumentElements } from './extensions/prevent-nested-document-elements'
import { WikiBlockquote } from './extensions/wiki-blockquote-extension'
import { WikiHighlightBlock } from './extensions/wiki-highlight-extension'
import {
    DeleteEmptyTableOnBackspace,
    separateTableResizeUndoStep,
    WikiTableAttributes,
    WikiTableKit
} from './extensions/wiki-table-extension'
import { useCollaborationSession } from './hooks/use-collaboration-session'
import {
    EDITOR_CARD_CONTENT_CONTEXT_MENU_EVENT,
    type EditorCardContentContextMenuDetail
} from './hooks/use-card-insert-control'
import { usePageMetadataAutosave } from './hooks/use-page-metadata-autosave'
import { useSavepoints } from './hooks/use-savepoints'
import { useSnapshotAutosave } from './hooks/use-snapshot-autosave'
import { getContainingDocumentElementEnd } from './lib/document-elements'
import { createHighlightBlockContent, getCurrentBlockValue, getEditorSelectionRect } from './lib/editor-utils'
import {
    copyActiveTable,
    deleteEmptyParagraphAfterImage,
    deleteSelectedImage,
    EDITOR_IMAGE_FILES_EVENT,
    getDroppedImageFiles,
    getImageFiles,
    pasteCopiedTable,
    uploadAndInsertImages,
    type EditorImageFilesDetail
} from './lib/editor-media'
import { getEditorMarkdown, setEditorMarkdown } from './lib/wiki-markdown'

const CONTEXT_MENU_WIDTH = 316
const CONTEXT_MENU_MAX_HEIGHT = 560
const CONTEXT_MENU_GUTTER = 8
const SELECTION_DRAG_THRESHOLD = 4
const DEFAULT_FONT_SIZE = 15.5
const FONT_SIZE_STEP = 2
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 72
const lowlight = createLowlight(common)
const DEFAULT_TABLE_NODE = {
    type: 'table',
    content: Array.from({ length: 3 }, (_, rowIndex) => ({
        type: 'tableRow',
        content: Array.from({ length: 3 }, () => ({
            type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
            content: [{ type: 'paragraph' }]
        }))
    }))
}

export function getTopLevelInsertionPosition(editor: Editor, position: number): number {
    const resolved = editor.state.doc.resolve(position)
    if (resolved.depth === 0) return position

    return resolved.after(1)
}

export function isTableHeaderColumnActive(editor: Editor | null): boolean {
    if (!editor) return false

    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth)
        if (node.type.name !== 'table') continue

        return node.childCount > 0 && node.content.content.every((row) => row.firstChild?.type.name === 'tableHeader')
    }

    return false
}

export type WikiEditorProps = {
    client: ApiClient
    editable: boolean
    page: WikiPageDetailDto
    pages: WikiPageDto[]
    categories: WikiLinkCategory[]
    currentUser: WikiUserDto | null
    collaborationUrl(pageId: string): string
    onCreatePage(title: string): Promise<WikiPageDto>
    onPageUpdated?: (page: WikiPageDetailDto) => void
    pageHrefForSlug?: (slug: string) => string
    categoryHrefForKey?: (key: string) => string
}

export function WikiEditor({
    client,
    editable,
    page,
    pages,
    categories,
    currentUser,
    collaborationUrl,
    onCreatePage,
    onPageUpdated,
    pageHrefForSlug = (slug) => `/wiki/${encodeURIComponent(slug)}`,
    categoryHrefForKey = (key) => `/wiki/category/${encodeURIComponent(key)}`
}: WikiEditorProps) {
    const ydoc = useMemo(() => new Y.Doc({ guid: page.id }), [page.id])
    const [showIconPicker, setShowIconPicker] = useState(false)
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
    const [contextSubmenu, setContextSubmenu] = useState<ContextSubmenuState>(null)
    const [editorActionError, setEditorActionError] = useState<string | null>(null)
    const [contentReady, setContentReady] = useState(false)
    const [imageDragActive, setImageDragActive] = useState(false)
    const [, setSelectionTick] = useState(0)
    const markdownSerializationTimer = useRef<number | null>(null)
    const pendingMarkdownEditor = useRef<Editor | null>(null)
    const selectionDragStart = useRef<{ x: number; y: number } | null>(null)
    const imageDragDepth = useRef(0)
    const contextMenuSelection = useRef<{ from: number; to: number } | null>(null)
    const collaborationSyncedRef = useRef(false)
    const editorStageRef = useRef<HTMLDivElement>(null)
    const { provider: collaborationProvider, synced: collaborationSynced } = useCollaborationSession({
        editable,
        document: ydoc,
        pageId: page.id,
        token: client.token,
        url: collaborationUrl
    })
    const {
        saveState,
        hasUserEdited,
        scheduleSave,
        flushSnapshot,
        adoptSnapshot,
        getSnapshotUpdatedAt,
        markUserEdited
    } = useSnapshotAutosave({ client, page })
    const {
        savepoints,
        state: savepointState,
        markChanged: markSavepointChanged,
        createNow: createSavepointNow,
        restore: restoreSavepoint,
        retry: retrySavepoints
    } = useSavepoints({
        enabled: editable,
        client,
        pageId: page.id,
        flushSnapshot,
        getSnapshotUpdatedAt
    })
    const {
        title,
        icon,
        saveState: metadataSaveState,
        setTitle: updateTitle,
        setIcon: updateIcon,
        retrySave: retryMetadataSave
    } = usePageMetadataAutosave({ client, page, onPageUpdated })
    const serializeEditorUpdate = useCallback(
        (updatedEditor: Editor) => {
            if (!editable || !collaborationSyncedRef.current) return
            const markdownValue = getEditorMarkdown(updatedEditor)

            if (!hasUserEdited.current && page.markdown.trim() && !markdownValue.trim()) {
                scheduleSave(page.markdown)
                return
            }
            scheduleSave(markdownValue)
            if (hasUserEdited.current) markSavepointChanged()
        },
        [editable, hasUserEdited, markSavepointChanged, page.markdown, scheduleSave]
    )
    const finishSelectionDragEvent = useEffectEvent((event: globalThis.MouseEvent) => {
        finishEditorSelectionDrag(event.button, event.clientX, event.clientY)
    })
    const startSelectionDragEvent = useEffectEvent((event: globalThis.MouseEvent) => {
        handleEditorMouseDown(event)
    })

    const editor = useEditor(
        {
            editable,
            extensions: [
                InsertSpacesOnTab,
                ParagraphFirstSelectAll,
                StarterKit.configure({
                    undoRedo: false,
                    link: false,
                    codeBlock: false,
                    blockquote: false
                }),
                CodeBlockLowlight.configure({
                    lowlight,
                    enableTabIndentation: true,
                    tabSize: 4
                }),
                WikiTableKit,
                WikiTableAttributes,
                DeleteEmptyTableOnBackspace,
                Image.configure({
                    HTMLAttributes: {
                        class: 'wiki-content-image'
                    },
                    resize: {
                        enabled: true,
                        directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
                        minWidth: 80,
                        minHeight: 40,
                        alwaysPreserveAspectRatio: true
                    }
                }),
                WikiBlockquote,
                WikiHighlightBlock,
                PreventNestedDocumentElements,
                Markdown.configure({
                    markedOptions: {
                        gfm: true,
                        breaks: false
                    }
                }),
                TextStyleKit,
                Link.configure({
                    openOnClick: !editable,
                    autolink: true,
                    defaultProtocol: 'https'
                }),
                Placeholder.configure({
                    placeholder: '내용을 입력하세요'
                }),
                Collaboration.configure({
                    document: ydoc
                })
            ],
            editorProps: {
                attributes: {
                    class: 'editor-surface',
                    'aria-label': editable ? '위키 문서 편집기' : '위키 문서'
                },
                handleClickOn(view, _position, node, nodePosition, _event, direct) {
                    if (!editable || !direct || node.type.name !== 'image') return false
                    view.dispatch(
                        view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePosition)).scrollIntoView()
                    )
                    view.focus()
                    return true
                }
            },
            onUpdate({ editor: updatedEditor, transaction }) {
                if (!editable) return
                if (transaction.getMeta('cardUserEdit') === true) markUserEdited()
                pendingMarkdownEditor.current = updatedEditor
                if (markdownSerializationTimer.current !== null) {
                    window.clearTimeout(markdownSerializationTimer.current)
                }
                markdownSerializationTimer.current = window.setTimeout(() => {
                    markdownSerializationTimer.current = null
                    pendingMarkdownEditor.current = null
                    serializeEditorUpdate(updatedEditor)
                }, 500)
            },
            onSelectionUpdate() {
                setSelectionTick((tick) => tick + 1)
            }
        },
        [editable, page.id, serializeEditorUpdate, ydoc]
    )

    const collaborators = useEditorPresence({
        provider: collaborationProvider,
        editor,
        editable,
        user: currentUser
    })

    useEffect(() => {
        collaborationSyncedRef.current = collaborationSynced
    }, [collaborationSynced])

    useEffect(() => {
        if (!collaborationSynced || !editor) return
        const fragment = ydoc.getXmlFragment('default')
        if (fragment.length > 0) {
            setContentReady(true)
            return
        }
        if (!page.markdown.trim()) {
            setContentReady(true)
            return
        }

        const bootstrapTimer = window.setTimeout(
            () => {
                if (fragment.length === 0) {
                    setEditorMarkdown(editor, page.markdown)
                }
                setContentReady(true)
            },
            75 + (ydoc.clientID % 75)
        )
        return () => window.clearTimeout(bootstrapTimer)
    }, [collaborationSynced, editor, page.markdown, ydoc])

    useEffect(() => {
        return () => {
            if (markdownSerializationTimer.current !== null) {
                window.clearTimeout(markdownSerializationTimer.current)
                markdownSerializationTimer.current = null
            }
            const pendingEditor = pendingMarkdownEditor.current
            pendingMarkdownEditor.current = null
            if (pendingEditor) serializeEditorUpdate(pendingEditor)
        }
    }, [editor, serializeEditorUpdate])

    const insertImageFilesEvent = useEffectEvent((files: File[], position?: number) => {
        void insertImageFiles(files, position)
    })
    const nativePasteEvent = useEffectEvent((event: globalThis.ClipboardEvent) => {
        handleEditorPaste(event)
    })
    const nativeDropEvent = useEffectEvent((event: globalThis.DragEvent) => {
        handleEditorDrop(event)
    })
    const openCardContentContextMenuEvent = useEffectEvent((event: Event) => {
        const { clientX, clientY } = (event as CustomEvent<EditorCardContentContextMenuDetail>).detail
        openContextMenuAtCoordinates(clientX, clientY, 'editor')
    })
    const openQuoteEmojiPickerEvent = useEffectEvent((event: Event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest<HTMLElement>('.wiki-quote-emoji-control')
        if (!button) return

        event.preventDefault()
        event.stopPropagation()
        const rect = button.getBoundingClientRect()
        openContextMenuAtCoordinates(rect.left, rect.bottom + CONTEXT_MENU_GUTTER / 2, 'quote')
    })

    useEffect(() => {
        if (!editable || !editor || !contentReady) return
        const editorElement = editor.view.dom
        const handleFiles = (event: Event) => {
            const { files, position } = (event as CustomEvent<EditorImageFilesDetail>).detail
            insertImageFilesEvent(files, position)
        }
        editorElement.addEventListener(EDITOR_IMAGE_FILES_EVENT, handleFiles)
        editorElement.addEventListener(EDITOR_CARD_CONTENT_CONTEXT_MENU_EVENT, openCardContentContextMenuEvent)
        editorElement.addEventListener('click', openQuoteEmojiPickerEvent, true)
        editorElement.addEventListener('mousedown', startSelectionDragEvent, true)
        editorElement.addEventListener('paste', nativePasteEvent, true)
        editorElement.addEventListener('drop', nativeDropEvent, true)
        return () => {
            editorElement.removeEventListener(EDITOR_IMAGE_FILES_EVENT, handleFiles)
            editorElement.removeEventListener(EDITOR_CARD_CONTENT_CONTEXT_MENU_EVENT, openCardContentContextMenuEvent)
            editorElement.removeEventListener('click', openQuoteEmojiPickerEvent, true)
            editorElement.removeEventListener('mousedown', startSelectionDragEvent, true)
            editorElement.removeEventListener('paste', nativePasteEvent, true)
            editorElement.removeEventListener('drop', nativeDropEvent, true)
        }
    }, [client, contentReady, editable, editor])

    useEffect(() => {
        setShowIconPicker(false)
    }, [page.id])

    useEffect(() => {
        if (!contextMenu) {
            return
        }

        const closeMenu = (event: Event) => {
            const target = event.target
            if (target instanceof Element && target.closest('.editor-context-menu, .editor-context-submenu')) {
                return
            }

            setContextSubmenu(null)
            setContextMenu(null)
        }
        window.addEventListener('mousedown', closeMenu)
        window.addEventListener('resize', closeMenu)
        window.addEventListener('scroll', closeMenu, true)

        return () => {
            window.removeEventListener('mousedown', closeMenu)
            window.removeEventListener('resize', closeMenu)
            window.removeEventListener('scroll', closeMenu, true)
        }
    }, [contextMenu])

    useEffect(() => {
        if (!editable || !editor) {
            return
        }

        window.addEventListener('mouseup', finishSelectionDragEvent, true)

        return () => {
            window.removeEventListener('mouseup', finishSelectionDragEvent, true)
        }
    }, [editable, editor])

    async function restoreDocumentSavepoint(savepointId: string) {
        const snapshot = await restoreSavepoint(savepointId)
        if (!snapshot || !editor) return
        hasUserEdited.current = false
        adoptSnapshot(snapshot)
        setEditorMarkdown(editor, snapshot.markdown)
        editor.commands.focus()
    }

    function undo() {
        hasUserEdited.current = true
        editor?.chain().focus().undo().run()
    }

    function redo() {
        hasUserEdited.current = true
        editor?.chain().focus().redo().run()
    }

    function setBlockStyle(value: string) {
        if (!editor) {
            return
        }

        if (value === 'paragraph') {
            editor.chain().focus().setParagraph().run()
            return
        }

        const level = Number(value.replace('h', '')) as 1 | 2 | 3
        editor.chain().focus().toggleHeading({ level }).run()
    }

    function setTextColor(color: string) {
        editor?.chain().focus().setColor(color).run()
    }

    function setBackgroundColor(color: string) {
        editor?.chain().focus().setBackgroundColor(color).run()
    }

    function unsetTextColor() {
        editor?.chain().focus().unsetColor().run()
    }

    function unsetBackgroundColor() {
        editor?.chain().focus().unsetBackgroundColor().run()
    }

    function setQuoteTone(tone: QuoteTone) {
        if (!editor || !editor.isActive('blockquote')) {
            return
        }

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .updateAttributes('blockquote', { tone: normalizeQuoteTone(tone), color: '' })
            .run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function setQuoteColor(color: string) {
        if (!editor || !editor.isActive('blockquote')) {
            return
        }

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .updateAttributes('blockquote', { color: normalizeQuoteColor(color) })
            .run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function changeFontSize(delta: number) {
        if (!editor) return

        const explicitFontSize = editor.getAttributes('textStyle').fontSize
        const explicitSizeMatch = /^\d+(?:\.\d+)?px$/i.exec(String(explicitFontSize ?? '').trim())
        const explicitSize = explicitSizeMatch ? Number.parseFloat(explicitSizeMatch[0]) : null
        const selectionNode = editor.view.domAtPos(editor.state.selection.from).node
        const selectionElement = selectionNode instanceof Element ? selectionNode : selectionNode.parentElement
        const renderedSize = selectionElement
            ? Number.parseFloat(window.getComputedStyle(selectionElement).fontSize)
            : NaN
        const currentSize = explicitSize ?? (Number.isFinite(renderedSize) ? renderedSize : DEFAULT_FONT_SIZE)
        const nextSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, currentSize + delta))

        markEditorChangedIntent()
        editor.chain().focus().setFontSize(`${nextSize}px`).run()
    }

    function applyHyperlink() {
        if (!editor) {
            return
        }

        const previousHref = String(editor.getAttributes('link').href ?? '')
        const href = window.prompt('하이퍼 링크 URL', previousHref)

        if (href === null) {
            return
        }

        if (href.trim() === '') {
            editor.chain().focus().unsetLink().run()
            return
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
    }

    function clearFormatting() {
        editor?.chain().focus().unsetAllMarks().clearNodes().run()
    }

    function insertContextContent(content: string | Record<string, unknown> | Array<Record<string, unknown>>) {
        if (!editor) {
            return
        }

        const selectionRange = contextMenuSelection.current ?? {
            from: editor.state.selection.from,
            to: editor.state.selection.to
        }

        const containingElementEnd = getContainingDocumentElementEnd(editor, selectionRange)

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .insertContentAt(containingElementEnd ?? selectionRange, content)
            .run()
        contextMenuSelection.current = null
        setContextMenu(null)
    }

    function runIsolatedBlockAction(nodeName: string, fallbackContent: Record<string, unknown>, run: () => void) {
        if (!editor) return

        const selectionRange = contextMenuSelection.current ?? {
            from: editor.state.selection.from,
            to: editor.state.selection.to
        }
        const containingElementEnd = getContainingDocumentElementEnd(editor, selectionRange)
        if (containingElementEnd !== null && !editor.isActive(nodeName)) {
            hasUserEdited.current = true
            editor.chain().focus().insertContentAt(containingElementEnd, fallbackContent).run()
            return
        }

        run()
    }

    function toggleBulletList() {
        runIsolatedBlockAction(
            'bulletList',
            { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
            () => editor?.chain().focus().toggleBulletList().run()
        )
    }

    function toggleOrderedList() {
        runIsolatedBlockAction(
            'orderedList',
            { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
            () => editor?.chain().focus().toggleOrderedList().run()
        )
    }

    function toggleBlockquote() {
        runIsolatedBlockAction(
            'blockquote',
            { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '인용문' }] }] },
            () => editor?.chain().focus().toggleBlockquote().run()
        )
    }

    function toggleCodeBlock() {
        runIsolatedBlockAction('codeBlock', { type: 'codeBlock', content: [{ type: 'text', text: 'code' }] }, () =>
            editor?.chain().focus().toggleCodeBlock().run()
        )
    }

    function insertHorizontalRule() {
        if (!editor) return
        const selectionRange = contextMenuSelection.current ?? {
            from: editor.state.selection.from,
            to: editor.state.selection.to
        }
        const containingElementEnd = getContainingDocumentElementEnd(editor, selectionRange)
        if (containingElementEnd !== null) {
            hasUserEdited.current = true
            editor.chain().focus().insertContentAt(containingElementEnd, { type: 'horizontalRule' }).run()
            return
        }
        editor.chain().focus().setHorizontalRule().run()
    }

    function insertPlainTextBlock(textValue: string) {
        insertContextContent({
            type: 'paragraph',
            content: [{ type: 'text', text: textValue }]
        })
    }

    function insertCalendarBlock() {
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth()
        const monthLabel = `${year}.${String(month + 1).padStart(2, '0')}`
        const firstDay = new Date(year, month, 1).getDay()
        const lastDate = new Date(year, month + 1, 0).getDate()
        const weeks: string[][] = []
        let day = 1

        for (let weekIndex = 0; weekIndex < 6 && day <= lastDate; weekIndex += 1) {
            const week = Array.from({ length: 7 }, (_, dayIndex) => {
                if ((weekIndex === 0 && dayIndex < firstDay) || day > lastDate) {
                    return ''
                }

                return String(day++)
            })
            weeks.push(week)
        }

        insertContextContent([
            {
                type: 'heading',
                attrs: { level: 3 },
                content: [{ type: 'text', text: `${monthLabel} 캘린더` }]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: [
                            '일 월 화 수 목 금 토',
                            ...weeks.map((week) => week.map((value) => value.padStart(2, ' ')).join(' '))
                        ].join('\n')
                    }
                ]
            }
        ])
    }

    function insertCurrentTimeBlock() {
        const formatted = new Intl.DateTimeFormat('ko-KR', {
            dateStyle: 'full',
            timeStyle: 'medium'
        }).format(new Date())

        insertPlainTextBlock(`현재 시각: ${formatted}`)
    }

    function insertWeatherTemplate() {
        insertPlainTextBlock('현재 날씨: 지역 / 기온 / 습도 / 바람 / 메모')
    }

    function insertTable() {
        if (!editor) return

        const selectionRange = contextMenuSelection.current ?? {
            from: editor.state.selection.from,
            to: editor.state.selection.to
        }
        const insertionPosition = getTopLevelInsertionPosition(editor, selectionRange.from)
        hasUserEdited.current = true
        editor.chain().focus().insertContentAt(insertionPosition, DEFAULT_TABLE_NODE).run()
        contextMenuSelection.current = null
    }

    function addTableRowBefore() {
        hasUserEdited.current = true
        editor?.chain().focus().addRowBefore().run()
    }

    function addTableRowAfter() {
        hasUserEdited.current = true
        editor?.chain().focus().addRowAfter().run()
    }

    function addTableColumnBefore() {
        hasUserEdited.current = true
        editor?.chain().focus().addColumnBefore().run()
    }

    function addTableColumnAfter() {
        hasUserEdited.current = true
        editor?.chain().focus().addColumnAfter().run()
    }

    function deleteTableRow() {
        hasUserEdited.current = true
        editor?.chain().focus().deleteRow().run()
    }

    function deleteTableColumn() {
        hasUserEdited.current = true
        editor?.chain().focus().deleteColumn().run()
    }

    function deleteActiveTable() {
        hasUserEdited.current = true
        editor?.chain().focus().deleteTable().run()
    }

    function toggleTableHeaderColumn() {
        hasUserEdited.current = true
        editor?.chain().focus().toggleHeaderColumn().run()
    }

    function insertEmoji(emojiData: EmojiClickData) {
        if (!editor) return

        hasUserEdited.current = true
        if (contextMenu?.kind === 'quote' && editor.isActive('blockquote')) {
            editor
                .chain()
                .focus()
                .updateAttributes('blockquote', { emoji: normalizeQuoteEmoji(emojiData.emoji) })
                .run()
        } else {
            editor.chain().focus().insertContent(emojiData.emoji).run()
        }
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function insertHighlightBlock(preset: HighlightPreset) {
        if (!editor) {
            return
        }

        const selectionRange = contextMenuSelection.current ?? {
            from: editor.state.selection.from,
            to: editor.state.selection.to
        }
        const containingElementEnd = getContainingDocumentElementEnd(editor, selectionRange)
        const block = {
            type: 'wikiHighlightBlock',
            attrs: {
                width: HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
                variant: preset.variant
            },
            content:
                containingElementEnd === null
                    ? createHighlightBlockContent(editor, preset, selectionRange)
                    : preset.content
        }

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .insertContentAt(containingElementEnd ?? selectionRange, block)
            .run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function setHighlightBlockWidth(width: string) {
        if (!editor) {
            return
        }

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .updateAttributes('wikiHighlightBlock', {
                width: normalizeHighlightBlockWidth(width)
            })
            .run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function setHighlightBlockBackgroundColor(color: string) {
        if (!editor || !editor.isActive('wikiHighlightBlock')) return

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .updateAttributes('wikiHighlightBlock', {
                backgroundColor: normalizeHighlightBlockBackgroundColor(color)
            })
            .run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function setTableHeaderBackground(color: string) {
        if (!editor || !editor.isActive('table')) return

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .updateAttributes('table', { headerBackground: normalizeTableHeaderBackground(color) })
            .run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function setHighlightBlockShape(shape: HighlightBlockShape) {
        if (!editor) {
            return
        }

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .updateAttributes('wikiHighlightBlock', {
                shape: normalizeHighlightBlockShape(shape)
            })
            .run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function unsetHighlightBlockBackgroundColor() {
        setHighlightBlockBackgroundColor('')
    }

    function unsetTableHeaderBackground() {
        setTableHeaderBackground('')
    }

    function setCodeLanguage(language: string | null) {
        if (!editor || !editor.isActive('codeBlock')) return

        hasUserEdited.current = true
        editor.chain().focus().updateAttributes('codeBlock', { language }).run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function selectPageIcon(nextIcon: string) {
        updateIcon(nextIcon)
        setShowIconPicker(false)
    }

    function selectPageIconFromPicker(emojiData: EmojiClickData) {
        selectPageIcon(emojiData.emoji)
    }

    function toggleUnderline(editorInstance: Editor) {
        const chain = editorInstance.chain().focus()
        const underlineChain = chain as typeof chain & {
            toggleUnderline?: () => typeof chain
        }

        underlineChain.toggleUnderline?.().run()
    }

    function getContextMenuState(
        kind: Exclude<ContextMenuState, null>['kind'],
        x: number,
        y: number
    ): Exclude<ContextMenuState, null> {
        const menuHeight = Math.min(CONTEXT_MENU_MAX_HEIGHT, window.innerHeight - CONTEXT_MENU_GUTTER * 2)
        const maxX = window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GUTTER
        const maxY = window.innerHeight - menuHeight - CONTEXT_MENU_GUTTER
        const safeX = Math.max(CONTEXT_MENU_GUTTER, Math.min(x, maxX))
        const safeY = Math.max(CONTEXT_MENU_GUTTER, Math.min(y, maxY))

        return {
            kind,
            x: safeX,
            y: safeY,
            maxHeight: Math.max(160, window.innerHeight - safeY - CONTEXT_MENU_GUTTER)
        }
    }

    function getContextSubmenuState(
        kind: ContextSubmenuKind,
        trigger: HTMLButtonElement
    ): Exclude<ContextSubmenuState, null> {
        const triggerRect = trigger.getBoundingClientRect()
        const panelHeight = Math.min(
            kind === 'emoji' ? 360 : CONTEXT_MENU_MAX_HEIGHT,
            window.innerHeight - CONTEXT_MENU_GUTTER * 2
        )
        const panelGap = CONTEXT_MENU_GUTTER / 2
        const canOpenRight =
            triggerRect.right + panelGap + CONTEXT_MENU_WIDTH <= window.innerWidth - CONTEXT_MENU_GUTTER
        const canOpenLeft = triggerRect.left - panelGap - CONTEXT_MENU_WIDTH >= CONTEXT_MENU_GUTTER
        const opensBesideMenu = canOpenRight || canOpenLeft
        const desiredX = canOpenRight
            ? triggerRect.right + panelGap
            : canOpenLeft
              ? triggerRect.left - CONTEXT_MENU_WIDTH - panelGap
              : triggerRect.left
        const desiredY = opensBesideMenu ? (contextMenu?.y ?? triggerRect.top) : triggerRect.bottom + panelGap
        const maxX = window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GUTTER
        const maxY = window.innerHeight - panelHeight - CONTEXT_MENU_GUTTER
        const safeX = Math.max(CONTEXT_MENU_GUTTER, Math.min(desiredX, maxX))
        const safeY = Math.max(CONTEXT_MENU_GUTTER, Math.min(desiredY, maxY))

        return {
            kind,
            x: safeX,
            y: safeY,
            maxHeight: Math.max(160, window.innerHeight - safeY - CONTEXT_MENU_GUTTER)
        }
    }

    function toggleContextSubmenu(kind: ContextSubmenuKind, event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault()
        event.stopPropagation()
        const nextSubmenu = getContextSubmenuState(kind, event.currentTarget)

        setContextSubmenu((current) => (current?.kind === kind ? null : nextSubmenu))
    }

    function runExtraMenuAction(action: ExtraMenuAction) {
        action.run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function openContextMenuAt(kind: Exclude<ContextMenuState, null>['kind'], x: number, y: number) {
        if (editor) {
            const { from, to } = editor.state.selection
            contextMenuSelection.current = { from, to }
        }

        setContextSubmenu(null)
        setContextMenu(getContextMenuState(kind, x, y))
    }

    function openContextMenu(event: MouseEvent) {
        event.preventDefault()

        if (!editor) {
            return
        }

        const target = event.target
        const clickedTable = target instanceof Element ? target.closest('table') : null
        const clickedQuote = target instanceof Element ? target.closest('blockquote') : null
        const menuKind = clickedTable ? 'table' : clickedQuote ? 'quote' : 'editor'
        openContextMenuAtCoordinates(event.clientX, event.clientY, menuKind)
    }

    function openContextMenuAtCoordinates(
        clientX: number,
        clientY: number,
        menuKind: Exclude<ContextMenuState, null>['kind']
    ) {
        if (!editor) {
            return
        }

        const clickedPosition = editor.view.posAtCoords({
            left: clientX,
            top: clientY
        })

        const { from, to } = editor.state.selection
        const shouldMoveSelection =
            clickedPosition &&
            (menuKind === 'table' ||
                menuKind === 'quote' ||
                from === to ||
                clickedPosition.pos < from ||
                clickedPosition.pos > to)

        if (shouldMoveSelection) {
            editor.chain().focus().setTextSelection(clickedPosition.pos).run()
        } else {
            editor.commands.focus()
        }
        openContextMenuAt(menuKind, clientX, clientY)
    }

    async function insertImageFiles(files: File[], position?: number) {
        if (!editor || files.length === 0) return
        try {
            setEditorActionError(null)
            markEditorChangedIntent()
            await uploadAndInsertImages(editor, client, files, position)
        } catch (error) {
            console.error(error)
            setEditorActionError('이미지를 업로드하지 못했습니다. 지원 형식과 100MB 이하 파일인지 확인해 주세요.')
        }
    }

    function handleEditorCopy(event: ClipboardEvent<HTMLDivElement>) {
        if (!editor || !copyActiveTable(editor, event.clipboardData, false)) return
        event.preventDefault()
    }

    function handleEditorCut(event: ClipboardEvent<HTMLDivElement>) {
        if (!editor || !copyActiveTable(editor, event.clipboardData, true)) return
        event.preventDefault()
    }

    function handleEditorPaste(event: globalThis.ClipboardEvent) {
        if (!editor) return
        const clipboard = event.clipboardData
        if (!clipboard) return
        const images = getImageFiles(clipboard.items, clipboard.files)
        if (images.length > 0) {
            event.preventDefault()
            event.stopPropagation()
            void insertImageFiles(images)
            return
        }
        if (pasteCopiedTable(editor, clipboard)) {
            event.preventDefault()
            event.stopPropagation()
            markEditorChangedIntent()
            return
        }
        markEditorChangedIntent()
    }

    function handleEditorDragEnter(event: DragEvent<HTMLDivElement>) {
        if (!editor || getDroppedImageFiles(editor, event.dataTransfer.items, event.dataTransfer.files).length === 0)
            return
        event.preventDefault()
        event.stopPropagation()
        imageDragDepth.current += 1
        setImageDragActive(true)
    }

    function handleEditorDragOver(event: DragEvent<HTMLDivElement>) {
        if (!editor || getDroppedImageFiles(editor, event.dataTransfer.items, event.dataTransfer.files).length === 0)
            return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
    }

    function handleEditorDragLeave(event: DragEvent<HTMLDivElement>) {
        if (!imageDragActive) return
        event.preventDefault()
        imageDragDepth.current = Math.max(0, imageDragDepth.current - 1)
        if (imageDragDepth.current === 0) setImageDragActive(false)
    }

    function handleEditorDrop(event: globalThis.DragEvent) {
        const transfer = event.dataTransfer
        const images = editor && transfer ? getDroppedImageFiles(editor, transfer.items, transfer.files) : []
        if (!editor || images.length === 0) return
        event.preventDefault()
        event.stopPropagation()
        imageDragDepth.current = 0
        setImageDragActive(false)
        const coordinates = editor.view.posAtCoords({
            left: event.clientX,
            top: event.clientY
        })
        void insertImageFiles(images, coordinates?.pos)
    }

    function markEditorChangedIntent() {
        markUserEdited()
    }

    function handleEditorMouseDown(event: MouseEvent | globalThis.MouseEvent) {
        if (event.button !== 0) {
            return
        }

        selectionDragStart.current = { x: event.clientX, y: event.clientY }
        const target = event.target
        if (target instanceof Element && target.closest('.column-resize-handle')) {
            markUserEdited()
            separateTableResizeUndoStep(editor)
            const resizedEditor = editor
            window.addEventListener(
                'mouseup',
                () => {
                    window.setTimeout(() => separateTableResizeUndoStep(resizedEditor), 0)
                },
                { once: true }
            )
        }
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function finishEditorSelectionDrag(button: number, clientX: number, clientY: number) {
        const dragStart = selectionDragStart.current
        selectionDragStart.current = null

        if (button !== 0 || !dragStart || !editor) {
            return
        }

        const dragDistance = Math.hypot(clientX - dragStart.x, clientY - dragStart.y)

        if (dragDistance < SELECTION_DRAG_THRESHOLD) {
            return
        }

        window.requestAnimationFrame(() => {
            openContextMenuForSelection(editor)
        })
    }

    function openContextMenuForSelection(editorInstance: Editor) {
        if (editorInstance.state.selection.empty) {
            setContextMenu(null)
            return
        }

        const selectionRect = getEditorSelectionRect(editorInstance)

        if (!selectionRect) {
            return
        }

        openContextMenuAt(
            'editor',
            selectionRect.left + selectionRect.width / 2 - CONTEXT_MENU_WIDTH / 2,
            selectionRect.bottom + CONTEXT_MENU_GUTTER
        )
    }

    function handleEditorKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'Backspace' || !editor || !deleteEmptyParagraphAfterImage(editor)) return
        markEditorChangedIntent()
        event.preventDefault()
        event.stopPropagation()
    }

    function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        markEditorChangedIntent()

        if ((event.key === 'Backspace' || event.key === 'Delete') && editor && deleteSelectedImage(editor)) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        if (event.key.toLowerCase() !== 'a' || (!event.ctrlKey && !event.metaKey) || event.altKey) {
            return
        }

        window.requestAnimationFrame(() => {
            if (editor) {
                openContextMenuForSelection(editor)
            }
        })
    }

    function getContextSelectionRange() {
        if (!editor) {
            return null
        }

        return (
            contextMenuSelection.current ?? {
                from: editor.state.selection.from,
                to: editor.state.selection.to
            }
        )
    }

    function getContextSelectionTitle() {
        const selectionRange = getContextSelectionRange()

        if (!editor || !selectionRange || selectionRange.from === selectionRange.to) {
            return ''
        }

        return editor.state.doc.textBetween(selectionRange.from, selectionRange.to, ' ').trim().replace(/\s+/g, ' ')
    }

    function linkSelectionToPage(targetPage: WikiPageDto, selectionRange = getContextSelectionRange()) {
        linkSelectionToHref(pageHrefForSlug(targetPage.slug), selectionRange)
    }

    function linkSelectionToCategory(targetCategory: WikiLinkCategory, selectionRange = getContextSelectionRange()) {
        linkSelectionToHref(categoryHrefForKey(targetCategory.documentSlug ?? targetCategory.id), selectionRange)
    }

    function linkSelectionToHref(href: string, selectionRange = getContextSelectionRange()) {
        if (!editor || !selectionRange || selectionRange.from === selectionRange.to) {
            return
        }

        hasUserEdited.current = true
        editor.chain().focus().setTextSelection(selectionRange).setLink({ href }).run()
        contextMenuSelection.current = null
        setContextSubmenu(null)
        setContextMenu(null)
    }

    async function createPageFromSelection() {
        const selectionRange = getContextSelectionRange()
        const selectedTitle = getContextSelectionTitle()

        if (!selectionRange || !selectedTitle) {
            return
        }

        try {
            setEditorActionError(null)
            const createdPage = await onCreatePage(selectedTitle)
            linkSelectionToPage(createdPage, selectionRange)
        } catch (error) {
            console.error(error)
            setEditorActionError('선택한 텍스트로 새 문서를 만들지 못했습니다.')
        }
    }

    const blockValue = getCurrentBlockValue(editor)
    const isHighlightBlockActive = editor?.isActive('wikiHighlightBlock') ?? false
    const activeQuoteAttrs = normalizeQuoteBlockAttrs(editor?.getAttributes('blockquote') ?? {})
    const activeQuoteTone = activeQuoteAttrs.tone
    const activeQuoteColor = activeQuoteAttrs.color
    const isTableActive = editor?.isActive('table') ?? false
    const isCodeBlockActive = editor?.isActive('codeBlock') ?? false
    const activeCodeLanguage = (editor?.getAttributes('codeBlock').language as string | null | undefined) ?? null
    const isHeaderColumnActive = isTableHeaderColumnActive(editor)
    const activeHighlightWidth = normalizeHighlightBlockWidth(editor?.getAttributes('wikiHighlightBlock').width)
    const activeHighlightShape = normalizeHighlightBlockShape(editor?.getAttributes('wikiHighlightBlock').shape)
    const activeHighlightBackgroundColor = normalizeHighlightBlockBackgroundColor(
        editor?.getAttributes('wikiHighlightBlock').backgroundColor
    )
    const activeTableHeaderBackground = normalizeTableHeaderBackground(editor?.getAttributes('table').headerBackground)
    const activeLinkHref = String(editor?.getAttributes('link').href ?? '')
    const internalLinkActive = editor?.isActive('link') === true && activeLinkHref.startsWith('/wiki/')
    const hasSelectedText = editor
        ? !editor.state.selection.empty &&
          Boolean(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ').trim())
        : false
    const inlineActions: ToolbarAction[] = [
        {
            id: 'bold',
            label: '굵게',
            Icon: Bold,
            run: () => editor?.chain().focus().toggleBold().run(),
            active: editor?.isActive('bold') ?? false
        },
        {
            id: 'italic',
            label: '기울임',
            Icon: Italic,
            run: () => editor?.chain().focus().toggleItalic().run(),
            active: editor?.isActive('italic') ?? false
        },
        {
            id: 'underline',
            label: '밑줄',
            Icon: Underline,
            run: () => (editor ? toggleUnderline(editor) : undefined),
            active: editor?.isActive('underline') ?? false
        },
        {
            id: 'strike',
            label: '줄그임',
            Icon: Strikethrough,
            run: () => editor?.chain().focus().toggleStrike().run(),
            active: editor?.isActive('strike') ?? false
        },
        {
            id: 'code',
            label: '인라인 코드',
            Icon: Code2,
            run: () => editor?.chain().focus().toggleCode().run(),
            active: editor?.isActive('code') ?? false
        },
        {
            id: 'wiki-link',
            label: '일반 링크',
            Icon: MapPinned,
            run: () => undefined,
            submenu: 'page-link',
            disabled: !hasSelectedText,
            active: internalLinkActive
        },
        {
            id: 'hyperlink',
            label: '하이퍼 링크',
            Icon: Link2,
            run: applyHyperlink,
            active: (editor?.isActive('link') ?? false) && !internalLinkActive
        },
        {
            id: 'font-size-increase',
            label: '글자 크기 늘리기',
            Icon: AArrowUp,
            run: () => changeFontSize(FONT_SIZE_STEP)
        },
        {
            id: 'font-size-decrease',
            label: '글자 크기 줄이기',
            Icon: AArrowDown,
            run: () => changeFontSize(-FONT_SIZE_STEP)
        }
    ]
    const blockActions: ToolbarAction[] = [
        {
            id: 'bullet',
            label: '항목 나열',
            Icon: List,
            run: toggleBulletList,
            active: editor?.isActive('bulletList') ?? false
        },
        {
            id: 'ordered',
            label: '번호 나열',
            Icon: ListOrdered,
            run: toggleOrderedList,
            active: editor?.isActive('orderedList') ?? false
        },
        {
            id: 'blockquote',
            label: '인용문',
            Icon: Quote,
            run: toggleBlockquote,
            active: editor?.isActive('blockquote') ?? false
        },
        {
            id: 'codeBlock',
            label: '코드 블록',
            Icon: FileCode2,
            run: toggleCodeBlock,
            active: editor?.isActive('codeBlock') ?? false
        },
        {
            id: 'rule',
            label: '구분선',
            Icon: Minus,
            run: insertHorizontalRule
        },
        {
            id: 'clear',
            label: '서식 지우기',
            Icon: Eraser,
            run: clearFormatting
        }
    ]

    const tableActions: ExtraMenuAction[] = [
        {
            id: 'add-table-row-before',
            label: '위에 행 삽입',
            Icon: BetweenHorizontalStart,
            run: addTableRowBefore
        },
        {
            id: 'add-table-row-after',
            label: '아래에 행 삽입',
            Icon: BetweenHorizontalEnd,
            run: addTableRowAfter
        },
        {
            id: 'delete-table-row',
            label: '현재 행 제거',
            Icon: Rows3,
            run: deleteTableRow
        },
        {
            id: 'add-table-column-before',
            label: '왼쪽에 열 삽입',
            Icon: BetweenVerticalStart,
            run: addTableColumnBefore
        },
        {
            id: 'add-table-column-after',
            label: '오른쪽에 열 삽입',
            Icon: BetweenVerticalEnd,
            run: addTableColumnAfter
        },
        {
            id: 'delete-table-column',
            label: '현재 열 제거',
            Icon: Columns3,
            run: deleteTableColumn
        },
        {
            id: 'toggle-table-header-column',
            label: isHeaderColumnActive ? '제목 열 해제' : '제목 열 설정',
            Icon: PanelLeft,
            run: toggleTableHeaderColumn,
            active: isHeaderColumnActive
        },
        {
            id: 'delete-table',
            label: '표 삭제',
            Icon: Trash2,
            run: deleteActiveTable
        }
    ]
    const extraActions: ExtraMenuAction[] = [
        {
            id: 'new-page',
            label: '새 페이지',
            Icon: FileText,
            run: () => void createPageFromSelection(),
            disabled: !hasSelectedText
        },
        {
            id: 'bullet-list',
            label: '글머리 기호 목록',
            Icon: List,
            run: toggleBulletList
        },
        {
            id: 'ordered-list',
            label: '번호 매기기 목록',
            Icon: ListOrdered,
            run: toggleOrderedList
        },
        {
            id: 'insert-table',
            label: '표 삽입',
            Icon: Table2,
            run: insertTable
        },
        {
            id: 'todo-list',
            label: '할 일 목록',
            Icon: CheckSquare,
            run: () => insertPlainTextBlock('- [ ] 할 일')
        },
        {
            id: 'toggle-list',
            label: '토글 목록',
            Icon: ToggleRight,
            run: () => insertPlainTextBlock('▶ 토글 제목')
        },
        {
            id: 'code',
            label: '코드',
            Icon: Code2,
            run: () =>
                insertContextContent({
                    type: 'codeBlock',
                    content: [{ type: 'text', text: 'code' }]
                })
        },
        {
            id: 'quote',
            label: '인용',
            Icon: TextQuote,
            run: toggleBlockquote
        },
        {
            id: 'layout',
            label: '레이아웃',
            Icon: LayoutPanelTop,
            run: () => insertPlainTextBlock('레이아웃: 섹션 / 열 / 메모')
        },
        {
            id: 'math',
            label: '수학 공식 블록',
            Icon: Sigma,
            run: () => insertPlainTextBlock('수식: E = mc^2')
        },
        {
            id: 'calendar',
            label: '캘린더',
            Icon: CalendarDays,
            run: insertCalendarBlock
        },
        {
            id: 'weather',
            label: '현재 날씨',
            Icon: CloudSun,
            run: insertWeatherTemplate
        },
        {
            id: 'time',
            label: '현재 시각',
            Icon: Clock,
            run: insertCurrentTimeBlock
        }
    ]
    const effectiveSaveState =
        metadataSaveState === 'error' || saveState === 'error'
            ? 'error'
            : metadataSaveState === 'saving' || saveState === 'saving'
              ? 'saving'
              : saveState
    if (!contentReady) {
        return (
            <section className="editor-frame" aria-label="문서 불러오는 중">
                <div className="editor-workspace">
                    <div className="save-indicator loading" role="status">
                        <span className="save-dot" />
                        <span>문서 불러오는 중</span>
                    </div>
                </div>
            </section>
        )
    }
    return (
        <section className={`editor-frame ${editable ? 'is-editable' : 'is-readonly'}`} aria-label="위키 문서">
            <EditorTopBar
                client={client}
                editable={editable}
                pages={pages}
                currentSlug={page.slug}
                collaborators={collaborators}
                pageHrefForSlug={pageHrefForSlug}
            />
            <div className="editor-workspace">
                <EditorHeader
                    title={title}
                    editable={editable}
                    icon={icon}
                    showIconPicker={showIconPicker}
                    onTitleChange={updateTitle}
                    onToggleIconPicker={() => setShowIconPicker((value) => !value)}
                    onSelectIcon={selectPageIcon}
                    onSelectEmoji={selectPageIconFromPicker}
                />
                {editable ? (
                    <EditorStatusBar editor={editor} saveState={effectiveSaveState} onUndo={undo} onRedo={redo} />
                ) : null}
                {editable && metadataSaveState === 'error' ? (
                    <div className="wiki-alert-banner" role="alert">
                        <strong>문서 제목 또는 아이콘을 저장하지 못했습니다.</strong>
                        <div className="wiki-alert-actions">
                            <button type="button" onClick={() => void retryMetadataSave()}>
                                다시 시도
                            </button>
                        </div>
                    </div>
                ) : null}
                {editable && editorActionError ? (
                    <div className="wiki-alert-banner" role="alert">
                        <strong>{editorActionError}</strong>
                        <div className="wiki-alert-actions">
                            <button type="button" onClick={() => setEditorActionError(null)}>
                                닫기
                            </button>
                        </div>
                    </div>
                ) : null}
                {editable ? (
                    <SavepointPanel
                        pageId={page.id}
                        savepoints={savepoints}
                        state={savepointState}
                        onCreate={createSavepointNow}
                        onRestore={restoreDocumentSavepoint}
                        onRetry={retrySavepoints}
                    />
                ) : null}
                <div ref={editorStageRef} className="editor-presence-stage">
                    <EditorContent
                        editor={editor}
                        className={'editor-content ' + (imageDragActive ? 'is-image-drag-active' : '')}
                        onBeforeInput={editable ? markEditorChangedIntent : undefined}
                        onContextMenu={editable ? openContextMenu : undefined}
                        onCopy={editable ? handleEditorCopy : undefined}
                        onCut={editable ? handleEditorCut : undefined}
                        onDragEnterCapture={editable ? handleEditorDragEnter : undefined}
                        onDragLeaveCapture={editable ? handleEditorDragLeave : undefined}
                        onDragOverCapture={editable ? handleEditorDragOver : undefined}
                        onKeyDownCapture={editable ? handleEditorKeyDownCapture : undefined}
                        onKeyDown={editable ? handleEditorKeyDown : undefined}
                    />
                    {editable ? (
                        <EditorLinePresence editor={editor} collaborators={collaborators} stageRef={editorStageRef} />
                    ) : null}
                </div>
            </div>

            {editable && contextMenu ? (
                <EditorContextMenus
                    menu={contextMenu}
                    submenu={contextSubmenu}
                    blockValue={blockValue}
                    inlineActions={inlineActions}
                    blockActions={blockActions}
                    extraActions={extraActions}
                    tableActions={tableActions}
                    pages={pages}
                    categories={categories}
                    highlightActive={isHighlightBlockActive}
                    tableActive={isTableActive}
                    codeBlockActive={isCodeBlockActive}
                    codeLanguage={activeCodeLanguage}
                    quoteTone={activeQuoteTone}
                    quoteColor={activeQuoteColor}
                    highlightWidth={activeHighlightWidth}
                    highlightShape={activeHighlightShape}
                    highlightBackgroundColor={activeHighlightBackgroundColor}
                    tableHeaderBackground={activeTableHeaderBackground}
                    onSetBlockStyle={setBlockStyle}
                    onToggleSubmenu={toggleContextSubmenu}
                    onSetTextColor={setTextColor}
                    onUnsetTextColor={unsetTextColor}
                    onSetBackgroundColor={setBackgroundColor}
                    onUnsetBackgroundColor={unsetBackgroundColor}
                    onInsertHighlight={insertHighlightBlock}
                    onSetHighlightWidth={setHighlightBlockWidth}
                    onSetHighlightShape={setHighlightBlockShape}
                    onSetHighlightBackgroundColor={setHighlightBlockBackgroundColor}
                    onUnsetHighlightBackgroundColor={unsetHighlightBlockBackgroundColor}
                    onSetTableHeaderBackground={setTableHeaderBackground}
                    onUnsetTableHeaderBackground={unsetTableHeaderBackground}
                    onSetQuoteTone={setQuoteTone}
                    onSetQuoteColor={setQuoteColor}
                    onSetCodeLanguage={setCodeLanguage}
                    onInsertEmoji={insertEmoji}
                    onRunExtraAction={runExtraMenuAction}
                    onSelectPageLink={linkSelectionToPage}
                    onSelectCategoryLink={linkSelectionToCategory}
                />
            ) : null}
        </section>
    )
}
