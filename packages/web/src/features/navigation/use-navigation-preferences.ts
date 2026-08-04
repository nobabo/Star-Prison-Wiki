import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react'

import type { WikiNavigationPreferencesDto, WikiPageDto } from '@coconut-studio/wiki-contracts'

import { navigationReducer } from './navigation-reducer'
import type { NavigationPreferences, NavigationPreferencesStore } from './navigation-preferences'

export type NavigationPreferencesPersistence = {
    key: string
    load(): Promise<{ preferences: WikiNavigationPreferencesDto; initialized: boolean }>
    save(preferences: WikiNavigationPreferencesDto): Promise<void>
}

export function useNavigationPreferences(
    store: NavigationPreferencesStore,
    pages: WikiPageDto[],
    persistence?: NavigationPreferencesPersistence
) {
    const [state, dispatch] = useReducer(navigationReducer, undefined, () => store.load())
    const [persistenceReady, setPersistenceReady] = useState(!persistence)
    const [persistenceState, setPersistenceState] = useState<'local' | 'loading' | 'ready' | 'error'>(
        persistence ? 'loading' : 'local'
    )
    const [retryGeneration, setRetryGeneration] = useState(0)
    const latestPages = useRef(pages)
    const pendingSave = useRef<WikiNavigationPreferencesDto | null>(null)
    const saveInFlight = useRef(false)
    const hydratedPersistenceKey = useRef<string | null>(null)
    const offlinePreferences = useRef<WikiNavigationPreferencesDto | null>(null)
    const offlinePersistenceKey = useRef<string | null>(null)

    useEffect(() => {
        latestPages.current = pages
    }, [pages])

    const flushSave = useEffectEvent(async () => {
        const target = persistence
        if (!target || hydratedPersistenceKey.current !== target.key || saveInFlight.current) return
        saveInFlight.current = true
        let failed = false
        try {
            while (pendingSave.current && hydratedPersistenceKey.current === target.key) {
                const next = pendingSave.current
                pendingSave.current = null
                try {
                    await target.save(next)
                    offlinePreferences.current = null
                    offlinePersistenceKey.current = null
                    setPersistenceState('ready')
                } catch (error) {
                    console.error(error)
                    pendingSave.current ??= next
                    failed = true
                    setPersistenceState('error')
                    break
                }
            }
        } finally {
            saveInFlight.current = false
            if (!failed && pendingSave.current && hydratedPersistenceKey.current === persistence?.key) void flushSave()
        }
    })

    useEffect(() => {
        dispatch({ type: 'reconcile', pages })
    }, [pages])

    useEffect(() => {
        if (persistence ? persistenceState !== 'error' : hydratedPersistenceKey.current !== null) return
        store.saveCategories(state.categories)
    }, [persistence, persistenceState, state.categories, store])

    useEffect(() => {
        if (persistence ? persistenceState !== 'error' : hydratedPersistenceKey.current !== null) return
        store.saveRootPageOrder(state.rootPageSlugs)
    }, [persistence, persistenceState, state.rootPageSlugs, store])

    useEffect(() => {
        if (persistence ? persistenceState !== 'error' : hydratedPersistenceKey.current !== null) return
        store.saveFavorites(state.favoriteSlugs)
    }, [persistence, persistenceState, state.favoriteSlugs, store])

    useEffect(() => {
        if (persistence ? persistenceState !== 'error' : hydratedPersistenceKey.current !== null) return
        store.saveTheme?.(state.theme)
    }, [persistence, persistenceState, state.theme, store])

    useEffect(() => {
        if (!persistence || persistenceState !== 'error') return
        offlinePersistenceKey.current = persistence.key
        offlinePreferences.current = toNavigationPreferences(state)
    }, [persistence, persistenceState, state])

    useEffect(() => {
        pendingSave.current = null
        hydratedPersistenceKey.current = null
        if (!persistence) {
            offlinePreferences.current = null
            offlinePersistenceKey.current = null
            setPersistenceState('local')
            const localPreferences = store.load()
            dispatch({ type: 'hydrate', preferences: localPreferences })
            dispatch({ type: 'reconcile', pages: latestPages.current })
            setPersistenceReady(true)
            return
        }

        setPersistenceReady(false)
        setPersistenceState('loading')
        const localFallback = store.load()
        dispatch({ type: 'hydrate', preferences: localFallback })
        dispatch({ type: 'reconcile', pages: latestPages.current })
        let active = true
        void persistence
            .load()
            .then(({ preferences, initialized }) => {
                if (!active) return
                const offline = offlinePersistenceKey.current === persistence.key ? offlinePreferences.current : null
                const nextPreferences = offline ?? (initialized ? toNavigationPreferences(preferences) : store.load())
                dispatch({ type: 'hydrate', preferences: nextPreferences })
                dispatch({ type: 'reconcile', pages: latestPages.current })
                hydratedPersistenceKey.current = persistence.key
                if (offline) {
                    pendingSave.current = offline
                    void flushSave()
                } else if (initialized) {
                    pendingSave.current = null
                } else if (hasLocalPreferences(nextPreferences)) {
                    pendingSave.current = toNavigationPreferences(nextPreferences)
                    void flushSave()
                }
                setPersistenceReady(true)
                setPersistenceState('ready')
            })
            .catch((error: unknown) => {
                if (!active) return
                console.error(error)
                setPersistenceState('error')
                setPersistenceReady(true)
            })
        return () => {
            active = false
        }
    }, [persistence, retryGeneration, store])

    useEffect(() => {
        if (!persistence || !persistenceReady || hydratedPersistenceKey.current !== persistence.key) return
        pendingSave.current = toNavigationPreferences(state)
        void flushSave()
    }, [persistence, persistenceReady, state])

    useEffect(() => {
        const retry = () => {
            if (!persistence) return
            setRetryGeneration((generation) => generation + 1)
        }
        window.addEventListener('online', retry)
        return () => window.removeEventListener('online', retry)
    }, [persistence])

    return {
        navigation: state,
        dispatch,
        persistenceState,
        retryPersistence: () => setRetryGeneration((generation) => generation + 1)
    }
}

function toNavigationPreferences(state: NavigationPreferences): WikiNavigationPreferencesDto {
    return {
        categories: state.categories.map((category) => ({
            ...category,
            pageSlugs: [...category.pageSlugs]
        })),
        rootPageSlugs: [...state.rootPageSlugs],
        favoriteSlugs: [...state.favoriteSlugs],
        theme: state.theme
    }
}

function hasLocalPreferences(state: NavigationPreferences): boolean {
    return state.categories.length > 0 || state.rootPageSlugs.length > 0 || state.favoriteSlugs.length > 0
}
