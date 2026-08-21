import { useCallback, useEffect, useRef, useState } from 'react'

import type { WikiPageDetailDto, WikiSnapshotDto } from '@coconut-studio/wiki-contracts'

import { fetchPageBySlug, saveWikiSnapshot, WikiApiError, type ApiClient } from '../../../shared/api/wiki-api'
import type { SaveState } from '../editor-types'

type SnapshotAutosaveInput = {
    client: ApiClient
    page: WikiPageDetailDto
}

export function useSnapshotAutosave({ client, page }: SnapshotAutosaveInput) {
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const latestMarkdown = useRef(page.markdown)
    const lastSavedMarkdown = useRef(page.markdown)
    const hasUserEdited = useRef(false)
    const timer = useRef<number | null>(null)
    const currentPageId = useRef(page.id)
    const baseSnapshotUpdatedAt = useRef(page.snapshotUpdatedAt)
    const saveQueue = useRef<Promise<void>>(Promise.resolve())

    const performSnapshotSave = useCallback(
        async (requestedMarkdown: string): Promise<boolean> => {
            let markdown = requestedMarkdown
            if (markdown === lastSavedMarkdown.current) {
                setSaveState('idle')
                return true
            }

            setSaveState('saving')
            const pageId = page.id
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    const response = await saveWikiSnapshot(client, pageId, markdown, baseSnapshotUpdatedAt.current)
                    if (currentPageId.current !== pageId) return false

                    baseSnapshotUpdatedAt.current = response.snapshot.updatedAt
                    lastSavedMarkdown.current = markdown
                    if (markdown === latestMarkdown.current) setSaveState('saved')
                    return true
                } catch (error) {
                    if (currentPageId.current !== pageId) return false
                    if (error instanceof WikiApiError && error.status === 409 && attempt < 2) {
                        try {
                            const current = await fetchPageBySlug(client, page.slug)
                            if (currentPageId.current !== pageId) return false
                            baseSnapshotUpdatedAt.current = current.page.snapshotUpdatedAt
                            if (current.page.markdown === latestMarkdown.current) {
                                lastSavedMarkdown.current = latestMarkdown.current
                                setSaveState('saved')
                                return true
                            }
                            markdown = latestMarkdown.current
                            continue
                        } catch (refreshError) {
                            console.error(refreshError)
                        }
                    }

                    const latestIsSaved = latestMarkdown.current === lastSavedMarkdown.current
                    if (markdown === latestMarkdown.current) {
                        setSaveState(latestIsSaved ? 'idle' : 'error')
                    }
                    console.error(error)
                    return false
                }
            }
            return false
        },
        [client, page.id, page.slug]
    )

    const saveSnapshot = useCallback(
        (markdown = latestMarkdown.current): Promise<boolean> => {
            const result = saveQueue.current.catch(() => undefined).then(() => performSnapshotSave(markdown))
            saveQueue.current = result.then(() => undefined)
            return result
        },
        [performSnapshotSave]
    )

    const scheduleSave = useCallback(
        (markdown: string) => {
            latestMarkdown.current = markdown
            if (markdown === lastSavedMarkdown.current) {
                if (timer.current !== null) window.clearTimeout(timer.current)
                timer.current = null
                setSaveState('idle')
                return
            }

            if (timer.current !== null) window.clearTimeout(timer.current)
            setSaveState('saving')
            timer.current = window.setTimeout(() => {
                timer.current = null
                void saveSnapshot(markdown)
            }, 1_000)
        },
        [saveSnapshot]
    )

    useEffect(() => {
        currentPageId.current = page.id
        baseSnapshotUpdatedAt.current = page.snapshotUpdatedAt
        latestMarkdown.current = page.markdown
        lastSavedMarkdown.current = page.markdown
        hasUserEdited.current = false
        setSaveState('idle')
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = null
    }, [page.id, page.markdown, page.snapshotUpdatedAt])

    useEffect(() => {
        const retry = () => {
            if (latestMarkdown.current !== lastSavedMarkdown.current) void saveSnapshot()
        }
        window.addEventListener('online', retry)
        return () => window.removeEventListener('online', retry)
    }, [saveSnapshot])

    useEffect(
        () => () => {
            if (timer.current !== null) {
                window.clearTimeout(timer.current)
                timer.current = null
            }
            if (latestMarkdown.current !== lastSavedMarkdown.current) {
                void saveSnapshot()
            }
        },
        [saveSnapshot]
    )

    function adoptSnapshot(snapshot: WikiSnapshotDto): void {
        if (snapshot.pageId !== currentPageId.current) return
        baseSnapshotUpdatedAt.current = snapshot.updatedAt
        latestMarkdown.current = snapshot.markdown
        lastSavedMarkdown.current = snapshot.markdown
        setSaveState('saved')
    }

    return {
        saveState,
        latestMarkdown,
        lastSavedMarkdown,
        hasUserEdited,
        scheduleSave,
        flushSnapshot: saveSnapshot,
        adoptSnapshot,
        getSnapshotUpdatedAt: () => baseSnapshotUpdatedAt.current,
        markUserEdited: () => {
            hasUserEdited.current = true
        }
    }
}
