import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

import type { WikiUserDto } from '@coconut-studio/wiki-contracts'

const COLLABORATOR_COLORS = ['#f05a78', '#3f8cff', '#20a779', '#a969e8', '#e18b2d', '#00a4a6'] as const
const MAX_TOPBAR_AVATARS = 4

type CursorPosition = {
    anchor: number
    head: number
}

export type EditorCollaborator = {
    clientId: number
    userId: string
    name: string
    picture?: string
    color: string
    cursor: CursorPosition | null
    local: boolean
}

type Awareness = NonNullable<HocuspocusProvider['awareness']>

export function useEditorPresence(input: {
    provider: HocuspocusProvider | null
    editor: Editor | null
    editable: boolean
    user: WikiUserDto | null
}): EditorCollaborator[] {
    const { provider, editor, editable, user } = input
    const [collaborators, setCollaborators] = useState<EditorCollaborator[]>([])

    useEffect(() => {
        const awareness = provider?.awareness
        if (!awareness || !editable || !user) return

        awareness.setLocalStateField('collaborator', {
            userId: user.userId,
            name: user.name,
            ...(user.picture ? { picture: user.picture } : {}),
            color: collaboratorColor(user.userId)
        })

        return () => awareness.setLocalStateField('collaborator', null)
    }, [editable, provider, user])

    useEffect(() => {
        const awareness = provider?.awareness
        if (!awareness || !editor || !editable || !user) return

        const publishCursor = () => {
            if (!editor.isFocused) {
                awareness.setLocalStateField('cursor', null)
                return
            }
            const { anchor, head } = editor.state.selection
            awareness.setLocalStateField('cursor', { anchor, head })
        }
        const clearCursor = () => awareness.setLocalStateField('cursor', null)

        editor.on('selectionUpdate', publishCursor)
        editor.on('focus', publishCursor)
        editor.on('blur', clearCursor)
        publishCursor()

        return () => {
            editor.off('selectionUpdate', publishCursor)
            editor.off('focus', publishCursor)
            editor.off('blur', clearCursor)
            clearCursor()
        }
    }, [editable, editor, provider, user])

    useEffect(() => {
        const awareness = provider?.awareness
        if (!awareness || !editable) {
            setCollaborators([])
            return
        }

        const refresh = () => setCollaborators(readCollaborators(awareness))
        awareness.on('change', refresh)
        refresh()

        return () => awareness.off('change', refresh)
    }, [editable, provider])

    return collaborators
}

export function CollaborationAvatarStack({ collaborators }: { collaborators: EditorCollaborator[] }) {
    if (collaborators.length === 0) return null

    const visible = collaborators.slice(0, MAX_TOPBAR_AVATARS)
    const hiddenCount = collaborators.length - visible.length
    const names = collaborators.map((collaborator) => collaborator.name).join(', ')

    return (
        <div className="editor-collaborator-stack" aria-label={`현재 공동 편집자: ${names}`} title={names}>
            {visible.map((collaborator) => (
                <CollaboratorAvatar key={collaborator.clientId} collaborator={collaborator} />
            ))}
            {hiddenCount > 0 ? <span className="editor-collaborator-overflow">+{hiddenCount}</span> : null}
        </div>
    )
}

export function EditorLinePresence({
    editor,
    collaborators,
    stageRef
}: {
    editor: Editor | null
    collaborators: EditorCollaborator[]
    stageRef: RefObject<HTMLDivElement | null>
}) {
    const [markers, setMarkers] = useState<PresenceMarker[]>([])
    const animationFrame = useRef<number | null>(null)

    const measure = useCallback(() => {
        const stage = stageRef.current
        const surface = editor?.view.dom
        if (!stage || !surface || !editor) {
            setMarkers([])
            return
        }

        const stageRect = stage.getBoundingClientRect()
        const surfaceRect = surface.getBoundingClientRect()
        const nextMarkers: PresenceMarker[] = []
        const occupiedRows: number[] = []

        for (const collaborator of collaborators) {
            if (!collaborator.cursor) continue
            const position = Math.max(0, Math.min(collaborator.cursor.head, editor.state.doc.content.size))

            try {
                const cursorRect = editor.view.coordsAtPos(position)
                const y = cursorRect.top - stageRect.top + (cursorRect.bottom - cursorRect.top) / 2 - 13
                const lane = occupiedRows.filter((row) => Math.abs(row - y) < 12).length
                occupiedRows.push(y)
                nextMarkers.push({
                    collaborator,
                    x: Math.max(surfaceRect.left - stageRect.left - 34 - lane * 18, -stageRect.left + 4),
                    y
                })
            } catch {
                // A remote cursor can briefly point past a concurrent document update.
            }
        }

        setMarkers(nextMarkers)
    }, [collaborators, editor, stageRef])

    const scheduleMeasure = useCallback(() => {
        if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current)
        animationFrame.current = window.requestAnimationFrame(() => {
            animationFrame.current = null
            measure()
        })
    }, [measure])

    useLayoutEffect(() => {
        scheduleMeasure()
    }, [scheduleMeasure])

    useEffect(() => {
        const stage = stageRef.current
        const surface = editor?.view.dom
        if (!stage || !surface || !editor) return

        const resizeObserver = new ResizeObserver(scheduleMeasure)
        resizeObserver.observe(stage)
        resizeObserver.observe(surface)
        editor.on('transaction', scheduleMeasure)
        window.addEventListener('resize', scheduleMeasure)

        return () => {
            resizeObserver.disconnect()
            editor.off('transaction', scheduleMeasure)
            window.removeEventListener('resize', scheduleMeasure)
            if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current)
        }
    }, [editor, scheduleMeasure, stageRef])

    return (
        <div className="editor-line-presence-layer" aria-hidden="true">
            {markers.map(({ collaborator, x, y }) => (
                <div
                    key={collaborator.clientId}
                    className={`editor-line-presence${collaborator.local ? ' is-local' : ''}`}
                    style={
                        {
                            '--collaborator-color': collaborator.color,
                            transform: `translate3d(${x}px, ${y}px, 0)`
                        } as CSSProperties
                    }
                    title={`${collaborator.name}님이 이 줄을 편집 중입니다`}
                >
                    <CollaboratorAvatar collaborator={collaborator} />
                    <span className="editor-line-presence-name">{collaborator.name}</span>
                </div>
            ))}
        </div>
    )
}

function CollaboratorAvatar({ collaborator }: { collaborator: EditorCollaborator }) {
    const style = { '--collaborator-color': collaborator.color } as CSSProperties
    return (
        <span className="editor-collaborator-avatar" style={style} title={collaborator.name}>
            {collaborator.picture ? (
                <img src={collaborator.picture} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
            ) : (
                <span aria-hidden="true">{initials(collaborator.name)}</span>
            )}
        </span>
    )
}

type PresenceMarker = {
    collaborator: EditorCollaborator
    x: number
    y: number
}

function readCollaborators(awareness: Awareness): EditorCollaborator[] {
    const collaborators: EditorCollaborator[] = []

    for (const [clientId, state] of awareness.getStates()) {
        const profile = readRecord(state.collaborator)
        if (!profile) continue
        const userId = readText(profile.userId, 160)
        const name = readText(profile.name, 80)
        if (!userId || !name) continue

        const picture = safePicture(profile.picture)
        collaborators.push({
            clientId,
            userId,
            name,
            ...(picture ? { picture } : {}),
            color: safeColor(profile.color) ?? collaboratorColor(userId),
            cursor: readCursor(state.cursor),
            local: clientId === awareness.clientID
        })
    }

    return collaborators.sort(
        (left, right) => Number(right.local) - Number(left.local) || left.name.localeCompare(right.name)
    )
}

function readCursor(value: unknown): CursorPosition | null {
    const cursor = readRecord(value)
    if (!cursor || !Number.isSafeInteger(cursor.anchor) || !Number.isSafeInteger(cursor.head)) return null
    return { anchor: Number(cursor.anchor), head: Number(cursor.head) }
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readText(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function safePicture(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length > 2048) return undefined
    try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
    } catch {
        return undefined
    }
}

function safeColor(value: unknown): string | undefined {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined
}

function collaboratorColor(seed: string): string {
    let hash = 0
    for (const character of seed) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
    return COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length] ?? COLLABORATOR_COLORS[0]
}

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length > 1) return `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}`.toUpperCase()
    return Array.from(words[0] ?? '?')
        .slice(0, 2)
        .join('')
        .toUpperCase()
}
