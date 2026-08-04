import { useCallback, useEffect, useRef, useState } from 'react'

import type { WikiSavepointDto, WikiSnapshotDto } from '@coconut-studio/wiki-contracts'

import {
    createWikiSavepoint,
    fetchWikiSavepoints,
    restoreWikiSavepoint,
    type ApiClient
} from '../../../shared/api/wiki-api'

const SAVEPOINT_INTERVAL_MS = 10 * 60 * 1_000
const SAVEPOINT_RETRY_MS = 60 * 1_000

export type SavepointState = 'loading' | 'ready' | 'saving' | 'restoring' | 'error'

type UseSavepointsInput = {
    client: ApiClient
    pageId: string
    flushSnapshot(): Promise<boolean>
    getSnapshotUpdatedAt(): string
}

export function useSavepoints({ client, pageId, flushSnapshot, getSnapshotUpdatedAt }: UseSavepointsInput) {
    const [savepoints, setSavepoints] = useState<WikiSavepointDto[]>([])
    const [state, setState] = useState<SavepointState>('loading')
    const changeVersion = useRef(0)
    const savedVersion = useRef(0)
    const timer = useRef<number | null>(null)
    const currentPageId = useRef(pageId)
    const loadSequence = useRef(0)
    const createRef = useRef<() => Promise<boolean>>(async () => false)
    const scheduleRef = useRef<(delay?: number) => void>(() => undefined)

    const load = useCallback(async () => {
        const requestedPageId = pageId
        const sequence = ++loadSequence.current
        setState('loading')
        try {
            const response = await fetchWikiSavepoints(client, requestedPageId)
            if (currentPageId.current !== requestedPageId || loadSequence.current !== sequence) return
            setSavepoints(response.savepoints)
            setState('ready')
        } catch (error) {
            if (currentPageId.current !== requestedPageId || loadSequence.current !== sequence) return
            console.error(error)
            setState('error')
        }
    }, [client, pageId])

    const create = useCallback(async (): Promise<boolean> => {
        if (changeVersion.current === savedVersion.current) return true
        const requestedPageId = pageId
        const targetVersion = changeVersion.current
        setState('saving')
        try {
            if (!(await flushSnapshot())) throw new Error('snapshot_save_failed')
            const response = await createWikiSavepoint(client, requestedPageId)
            if (currentPageId.current !== requestedPageId) return false
            const savepoint = response.savepoint
            if (savepoint) {
                setSavepoints((current) => [savepoint, ...current.filter((entry) => entry.id !== savepoint.id)])
            }
            savedVersion.current = targetVersion
            setState('ready')
            if (changeVersion.current !== savedVersion.current) scheduleRef.current()
            return true
        } catch (error) {
            if (currentPageId.current !== requestedPageId) return false
            console.error(error)
            setState('error')
            return false
        }
    }, [client, flushSnapshot, pageId])

    useEffect(() => {
        createRef.current = create
    }, [create])

    useEffect(() => {
        currentPageId.current = pageId
        changeVersion.current = 0
        savedVersion.current = 0
        setSavepoints([])
        void load()
        return () => {
            loadSequence.current += 1
            if (timer.current !== null) window.clearTimeout(timer.current)
            timer.current = null
        }
    }, [load, pageId])

    const schedule = useCallback(function armTimer(delay = SAVEPOINT_INTERVAL_MS): void {
        if (timer.current !== null) return
        timer.current = window.setTimeout(async () => {
            timer.current = null
            const saved = await createRef.current()
            if (!saved && changeVersion.current !== savedVersion.current) armTimer(SAVEPOINT_RETRY_MS)
        }, delay)
    }, [])

    useEffect(() => {
        scheduleRef.current = schedule
    }, [schedule])

    const markChanged = useCallback((): void => {
        changeVersion.current += 1
        schedule()
    }, [schedule])

    const createNow = useCallback(async (): Promise<void> => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current)
            timer.current = null
        }
        if (!(await create())) schedule(SAVEPOINT_RETRY_MS)
    }, [create, schedule])

    const restore = useCallback(
        async (savepointId: string): Promise<WikiSnapshotDto | null> => {
            const requestedPageId = pageId
            setState('restoring')
            try {
                if (!(await flushSnapshot())) throw new Error('snapshot_save_failed')
                const response = await restoreWikiSavepoint(
                    client,
                    requestedPageId,
                    savepointId,
                    getSnapshotUpdatedAt()
                )
                if (currentPageId.current !== requestedPageId) return null
                savedVersion.current = changeVersion.current
                setState('ready')
                await load()
                return response.snapshot
            } catch (error) {
                if (currentPageId.current !== requestedPageId) return null
                console.error(error)
                setState('error')
                return null
            }
        },
        [client, flushSnapshot, getSnapshotUpdatedAt, load, pageId]
    )

    const retry = useCallback(async (): Promise<void> => {
        if (changeVersion.current !== savedVersion.current) await createNow()
        else await load()
    }, [createNow, load])

    return { savepoints, state, markChanged, createNow, restore, retry }
}
