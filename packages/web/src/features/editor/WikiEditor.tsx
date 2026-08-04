import type { EmojiClickData } from 'emoji-picker-react'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, type Editor, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
    Bold,
    CalendarDays,
    CheckSquare,
    Clock,
    CloudSun,
    Code2,
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
    Quote,
    Sigma,
    Strikethrough,
    TextQuote,
    ToggleRight,
    Underline
} from 'lucide-react'
import {
    useCallback,
    useEffect,
    useEffectEvent,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent
} from 'react'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'

import type { WikiPageDetailDto, WikiPageDto } from '@coconut-studio/wiki-contracts'
import {
    encodeColorDirectives,
    HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
    normalizeHighlightBlockShape,
    normalizeHighlightBlockWidth
} from '@coconut-studio/wiki-markdown'
import type { HighlightBlockShape } from '@coconut-studio/wiki-markdown'

import type { ApiClient } from '../../shared/api/wiki-api'
import { EditorContextMenus } from './components/EditorContextMenus'
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
    ToolbarAction
} from './editor-types'
import { InsertSpacesOnTab, ParagraphFirstSelectAll } from './extensions/editor-behavior'
import { WikiHighlightBlock } from './extensions/wiki-highlight-extension'
import { useCollaborationSession } from './hooks/use-collaboration-session'
import { usePageMetadataAutosave } from './hooks/use-page-metadata-autosave'
import { useSavepoints } from './hooks/use-savepoints'
import { useSnapshotAutosave } from './hooks/use-snapshot-autosave'
import { createHighlightBlockContent, getCurrentBlockValue, getEditorSelectionRect } from './lib/editor-utils'
import { getEditorMarkdown } from './lib/wiki-markdown'

const CONTEXT_MENU_WIDTH = 316
const CONTEXT_MENU_MAX_HEIGHT = 560
const CONTEXT_MENU_GUTTER = 8
const SELECTION_DRAG_THRESHOLD = 4

export type WikiEditorProps = {
    client: ApiClient
    page: WikiPageDetailDto
    pages: WikiPageDto[]
    collaborationUrl(pageId: string): string
    onCreatePage(title: string): Promise<WikiPageDto>
    onPageUpdated?: (page: WikiPageDetailDto) => void
}

export function WikiEditor({ client, page, pages, collaborationUrl, onCreatePage, onPageUpdated }: WikiEditorProps) {
    const ydoc = useMemo(() => new Y.Doc({ guid: page.id }), [page.id])
    const [showIconPicker, setShowIconPicker] = useState(false)
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
    const [contextSubmenu, setContextSubmenu] = useState<ContextSubmenuState>(null)
    const [editorActionError, setEditorActionError] = useState<string | null>(null)
    const [, setSelectionTick] = useState(0)
    const markdownSerializationTimer = useRef<number | null>(null)
    const pendingMarkdownEditor = useRef<Editor | null>(null)
    const selectionDragStart = useRef<{ x: number; y: number } | null>(null)
    const contextMenuSelection = useRef<{ from: number; to: number } | null>(null)
    const collaborationSyncedRef = useRef(false)
    const collaborationSynced = useCollaborationSession({
        document: ydoc,
        pageId: page.id,
        token: client.token,
        url: collaborationUrl
    })
    const {
        saveState,
        pendingDraft,
        hasUserEdited,
        scheduleSave,
        flushSnapshot,
        adoptSnapshot,
        getSnapshotUpdatedAt,
        restoreDraft,
        discardDraft,
        markUserEdited
    } = useSnapshotAutosave({ client, page })
    const {
        savepoints,
        state: savepointState,
        markChanged: markSavepointChanged,
        createNow: createSavepointNow,
        restore: restoreSavepoint,
        retry: retrySavepoints
    } = useSavepoints({ client, pageId: page.id, flushSnapshot, getSnapshotUpdatedAt })
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
            if (!collaborationSyncedRef.current) return
            const markdownValue = getEditorMarkdown(updatedEditor)

            if (!hasUserEdited.current && page.markdown.trim() && !markdownValue.trim()) {
                scheduleSave(page.markdown)
                return
            }
            scheduleSave(markdownValue)
            if (hasUserEdited.current) markSavepointChanged()
        },
        [hasUserEdited, markSavepointChanged, page.markdown, scheduleSave]
    )
    const finishSelectionDragEvent = useEffectEvent((event: globalThis.MouseEvent) => {
        finishEditorSelectionDrag(event.button, event.clientX, event.clientY)
    })

    const editor = useEditor(
        {
            extensions: [
                InsertSpacesOnTab,
                ParagraphFirstSelectAll,
                StarterKit.configure({
                    undoRedo: false,
                    link: false
                }),
                WikiHighlightBlock,
                Markdown.configure({
                    markedOptions: {
                        gfm: true,
                        breaks: false
                    }
                }),
                TextStyleKit,
                Link.configure({
                    openOnClick: false,
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
                    'aria-label': '위키 문서 편집기'
                }
            },
            onUpdate({ editor: updatedEditor }) {
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
        [page.id, serializeEditorUpdate, ydoc]
    )

    useEffect(() => {
        collaborationSyncedRef.current = collaborationSynced
    }, [collaborationSynced])

    useEffect(() => {
        if (!collaborationSynced || !editor || !page.markdown.trim()) return
        const fragment = ydoc.getXmlFragment('default')
        if (fragment.length > 0) return

        const bootstrapTimer = window.setTimeout(
            () => {
                if (fragment.length === 0) {
                    editor.commands.setContent(encodeColorDirectives(page.markdown), { contentType: 'markdown' })
                }
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

    useEffect(() => setShowIconPicker(false), [page.id])

    useEffect(() => {
        if (!contextMenu) {
            return
        }

        const closeMenu = () => {
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
        if (!editor) {
            return
        }

        window.addEventListener('mouseup', finishSelectionDragEvent)

        return () => {
            window.removeEventListener('mouseup', finishSelectionDragEvent)
        }
    }, [editor])

    function restoreLocalDraft() {
        if (!editor) return
        if (
            pendingDraft &&
            pendingDraft.baseMarkdown !== page.markdown &&
            !window.confirm('이 임시 초안은 현재 서버 문서보다 오래된 버전을 기준으로 합니다. 그래도 복구할까요?')
        ) {
            return
        }
        const markdown = restoreDraft()
        if (markdown === null) return
        editor.commands.setContent(encodeColorDirectives(markdown), {
            contentType: 'markdown'
        })
        editor.commands.focus()
    }

    function discardLocalDraft() {
        discardDraft()
    }

    async function restoreDocumentSavepoint(savepointId: string) {
        const snapshot = await restoreSavepoint(savepointId)
        if (!snapshot || !editor) return
        hasUserEdited.current = false
        adoptSnapshot(snapshot)
        editor.commands.setContent(encodeColorDirectives(snapshot.markdown), { contentType: 'markdown' })
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

    function applyLink() {
        if (!editor) {
            return
        }

        const previousHref = String(editor.getAttributes('link').href ?? '')
        const href = window.prompt('링크 URL', previousHref)

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

        hasUserEdited.current = true
        editor.chain().focus().insertContentAt(selectionRange, content).run()
        contextMenuSelection.current = null
        setContextMenu(null)
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
            { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: `${monthLabel} 캘린더` }] },
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
    function insertEmoji(emojiData: EmojiClickData) {
        hasUserEdited.current = true
        editor?.chain().focus().insertContent(emojiData.emoji).run()
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
        const block = {
            type: 'wikiHighlightBlock',
            attrs: {
                width: HIGHLIGHT_BLOCK_DEFAULT_WIDTH,
                variant: preset.variant
            },
            content: createHighlightBlockContent(editor, preset, selectionRange)
        }

        hasUserEdited.current = true
        editor.chain().focus().insertContentAt(selectionRange, block).run()
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

    function getContextMenuState(x: number, y: number): Exclude<ContextMenuState, null> {
        const menuHeight = Math.min(CONTEXT_MENU_MAX_HEIGHT, window.innerHeight - CONTEXT_MENU_GUTTER * 2)
        const maxX = window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GUTTER
        const maxY = window.innerHeight - menuHeight - CONTEXT_MENU_GUTTER
        const safeX = Math.max(CONTEXT_MENU_GUTTER, Math.min(x, maxX))
        const safeY = Math.max(CONTEXT_MENU_GUTTER, Math.min(y, maxY))

        return {
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

    function openContextMenuAt(x: number, y: number) {
        if (editor) {
            const { from, to } = editor.state.selection
            contextMenuSelection.current = { from, to }
        }

        setContextSubmenu(null)
        setContextMenu({
            ...getContextMenuState(x, y)
        })
    }

    function openContextMenu(event: MouseEvent) {
        event.preventDefault()

        if (!editor) {
            return
        }

        editor.commands.focus()
        openContextMenuAt(event.clientX, event.clientY)
    }

    function markEditorChangedIntent() {
        markUserEdited()
    }

    function handleEditorMouseDown(event: MouseEvent) {
        if (event.button !== 0) {
            return
        }

        selectionDragStart.current = { x: event.clientX, y: event.clientY }
        setContextSubmenu(null)
        setContextMenu(null)
    }

    function handleEditorMouseUp(event: MouseEvent) {
        finishEditorSelectionDrag(event.button, event.clientX, event.clientY)
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

        editorInstance.commands.focus()

        const menuHeight = Math.min(CONTEXT_MENU_MAX_HEIGHT, window.innerHeight - CONTEXT_MENU_GUTTER * 2)
        const selectionCenter = selectionRect.left + selectionRect.width / 2
        const menuX = selectionCenter - CONTEXT_MENU_WIDTH / 2
        const belowY = selectionRect.bottom + CONTEXT_MENU_GUTTER
        const aboveY = selectionRect.top - menuHeight - CONTEXT_MENU_GUTTER
        const menuY = belowY + menuHeight > window.innerHeight - CONTEXT_MENU_GUTTER ? aboveY : belowY

        openContextMenuAt(menuX, menuY)
    }

    function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        markEditorChangedIntent()

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
        if (!editor || !selectionRange || selectionRange.from === selectionRange.to) {
            return
        }

        hasUserEdited.current = true
        editor
            .chain()
            .focus()
            .setTextSelection(selectionRange)
            .setLink({ href: `/wiki/${encodeURIComponent(targetPage.slug)}` })
            .run()
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
    const activeHighlightWidth = normalizeHighlightBlockWidth(editor?.getAttributes('wikiHighlightBlock').width)
    const activeHighlightShape = normalizeHighlightBlockShape(editor?.getAttributes('wikiHighlightBlock').shape)
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
            id: 'link',
            label: '링크',
            Icon: Link2,
            run: applyLink,
            active: editor?.isActive('link') ?? false
        }
    ]
    const blockActions: ToolbarAction[] = [
        {
            id: 'bullet',
            label: '항목 나열',
            Icon: List,
            run: () => editor?.chain().focus().toggleBulletList().run(),
            active: editor?.isActive('bulletList') ?? false
        },
        {
            id: 'ordered',
            label: '번호 나열',
            Icon: ListOrdered,
            run: () => editor?.chain().focus().toggleOrderedList().run(),
            active: editor?.isActive('orderedList') ?? false
        },
        {
            id: 'blockquote',
            label: '인용문',
            Icon: Quote,
            run: () => editor?.chain().focus().toggleBlockquote().run(),
            active: editor?.isActive('blockquote') ?? false
        },
        {
            id: 'codeBlock',
            label: '코드 블록',
            Icon: FileCode2,
            run: () => editor?.chain().focus().toggleCodeBlock().run(),
            active: editor?.isActive('codeBlock') ?? false
        },
        {
            id: 'rule',
            label: '구분선',
            Icon: Minus,
            run: () => editor?.chain().focus().setHorizontalRule().run()
        },
        {
            id: 'clear',
            label: '서식 지우기',
            Icon: Eraser,
            run: clearFormatting
        }
    ]

    const hasSelectedText = editor
        ? !editor.state.selection.empty &&
          Boolean(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ').trim())
        : false
    const extraActions: ExtraMenuAction[] = [
        {
            id: 'new-page',
            label: '새 페이지',
            Icon: FileText,
            run: () => void createPageFromSelection(),
            disabled: !hasSelectedText
        },
        {
            id: 'page-link',
            label: '페이지 링크',
            Icon: MapPinned,
            run: () => undefined,
            submenu: 'page-link',
            disabled: !hasSelectedText
        },
        {
            id: 'bullet-list',
            label: '글머리 기호 목록',
            Icon: List,
            run: () => editor?.chain().focus().toggleBulletList().run()
        },
        {
            id: 'ordered-list',
            label: '번호 매기기 목록',
            Icon: ListOrdered,
            run: () => editor?.chain().focus().toggleOrderedList().run()
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
            run: () => insertContextContent({ type: 'codeBlock', content: [{ type: 'text', text: 'code' }] })
        },
        {
            id: 'quote',
            label: '인용',
            Icon: TextQuote,
            run: () => editor?.chain().focus().toggleBlockquote().run()
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
    return (
        <section className="editor-frame" aria-label="위키 편집">
            <EditorTopBar pages={pages} currentSlug={page.slug} />
            <div className="editor-workspace">
                <EditorHeader
                    title={title}
                    icon={icon}
                    showIconPicker={showIconPicker}
                    onTitleChange={updateTitle}
                    onToggleIconPicker={() => setShowIconPicker((value) => !value)}
                    onSelectIcon={selectPageIcon}
                    onSelectEmoji={selectPageIconFromPicker}
                />
                <EditorStatusBar
                    editor={editor}
                    saveState={effectiveSaveState}
                    pendingDraft={pendingDraft}
                    onUndo={undo}
                    onRedo={redo}
                    onRestoreDraft={restoreLocalDraft}
                    onDiscardDraft={discardLocalDraft}
                />
                {metadataSaveState === 'error' ? (
                    <div className="local-draft-banner" role="alert">
                        <strong>문서 제목 또는 아이콘을 저장하지 못했습니다.</strong>
                        <div className="local-draft-actions">
                            <button type="button" onClick={() => void retryMetadataSave()}>
                                다시 시도
                            </button>
                        </div>
                    </div>
                ) : null}
                {editorActionError ? (
                    <div className="local-draft-banner" role="alert">
                        <strong>{editorActionError}</strong>
                        <div className="local-draft-actions">
                            <button type="button" onClick={() => setEditorActionError(null)}>
                                닫기
                            </button>
                        </div>
                    </div>
                ) : null}
                <SavepointPanel
                    savepoints={savepoints}
                    state={savepointState}
                    onCreate={createSavepointNow}
                    onRestore={restoreDocumentSavepoint}
                    onRetry={retrySavepoints}
                />
                <EditorContent
                    editor={editor}
                    className="editor-content"
                    onBeforeInput={markEditorChangedIntent}
                    onContextMenu={openContextMenu}
                    onKeyDown={handleEditorKeyDown}
                    onMouseDown={handleEditorMouseDown}
                    onMouseUp={handleEditorMouseUp}
                    onPaste={markEditorChangedIntent}
                />
            </div>

            {contextMenu ? (
                <EditorContextMenus
                    menu={contextMenu}
                    submenu={contextSubmenu}
                    blockValue={blockValue}
                    inlineActions={inlineActions}
                    blockActions={blockActions}
                    extraActions={extraActions}
                    pages={pages}
                    highlightActive={isHighlightBlockActive}
                    highlightWidth={activeHighlightWidth}
                    highlightShape={activeHighlightShape}
                    onSetBlockStyle={setBlockStyle}
                    onToggleSubmenu={toggleContextSubmenu}
                    onSetTextColor={setTextColor}
                    onUnsetTextColor={unsetTextColor}
                    onSetBackgroundColor={setBackgroundColor}
                    onUnsetBackgroundColor={unsetBackgroundColor}
                    onInsertHighlight={insertHighlightBlock}
                    onSetHighlightWidth={setHighlightBlockWidth}
                    onSetHighlightShape={setHighlightBlockShape}
                    onInsertEmoji={insertEmoji}
                    onRunExtraAction={runExtraMenuAction}
                    onSelectPageLink={linkSelectionToPage}
                />
            ) : null}
        </section>
    )
}
