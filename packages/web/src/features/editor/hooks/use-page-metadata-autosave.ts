import { useCallback, useEffect, useRef, useState } from 'react'

import type { WikiPageDetailDto } from '@coconut-studio/wiki-contracts'

import { updatePageMeta, type ApiClient } from '../../../shared/api/wiki-api'
import type { SaveState } from '../editor-types'
import { normalizePageIcon } from '../lib/editor-utils'

type PageMetadataAutosaveInput = {
    client: ApiClient
    page: WikiPageDetailDto
    onPageUpdated?: (page: WikiPageDetailDto) => void
}

export function usePageMetadataAutosave({ client, page, onPageUpdated }: PageMetadataAutosaveInput) {
    const [title, setTitleState] = useState(page.title)
    const [icon, setIconState] = useState(page.icon ?? '')
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const titleRef = useRef(title)
    const iconRef = useRef(icon)
    const dirty = useRef(false)
    const version = useRef(0)
    const saving = useRef(false)
    const timer = useRef<number | null>(null)
    const flushRef = useRef<() => Promise<boolean>>(async () => true)

    const flush = useCallback(async (): Promise<boolean> => {
        if (saving.current || !dirty.current) return !dirty.current
        saving.current = true
        setSaveState('saving')
        try {
            while (dirty.current) {
                const savingVersion = version.current
                const result = await updatePageMeta(client, page.id, {
                    title: titleRef.current,
                    icon: normalizePageIcon(iconRef.current)
                })
                if (savingVersion !== version.current) continue
                dirty.current = false
                setSaveState('saved')
                onPageUpdated?.(result.page)
            }
            return true
        } catch (error) {
            console.error(error)
            setSaveState('error')
            return false
        } finally {
            saving.current = false
        }
    }, [client, onPageUpdated, page.id])

    useEffect(() => {
        flushRef.current = flush
    }, [flush])

    useEffect(() => {
        if (dirty.current) return
        titleRef.current = page.title
        iconRef.current = page.icon ?? ''
        setTitleState(page.title)
        setIconState(page.icon ?? '')
        setSaveState('idle')
    }, [page.icon, page.title])

    useEffect(() => {
        if (!dirty.current) return
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
            timer.current = null
            void flush()
        }, 600)
        return () => {
            if (timer.current !== null) {
                window.clearTimeout(timer.current)
                timer.current = null
            }
        }
    }, [flush, icon, title])

    useEffect(() => {
        const retry = () => {
            if (dirty.current) void flushRef.current()
        }
        window.addEventListener('online', retry)
        return () => window.removeEventListener('online', retry)
    }, [])

    useEffect(
        () => () => {
            if (timer.current !== null) window.clearTimeout(timer.current)
            if (dirty.current) void flushRef.current()
        },
        []
    )

    function setTitle(nextTitle: string): void {
        version.current += 1
        dirty.current = true
        titleRef.current = nextTitle
        setTitleState(nextTitle)
        setSaveState('saving')
    }

    function setIcon(nextIcon: string): void {
        version.current += 1
        dirty.current = true
        iconRef.current = nextIcon
        setIconState(nextIcon)
        setSaveState('saving')
    }

    return { title, icon, saveState, setTitle, setIcon, retrySave: flush }
}
