import { useEffect, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'

import { useCardInsertControl } from './use-card-insert-control'
import { useCategoryPageCreateControl } from './use-category-page-create-control'

type CollaborationSessionInput = {
    document: Y.Doc
    editable: boolean
    pageId: string
    token: string
    url(pageId: string): string
}

export type CollaborationSession = {
    provider: HocuspocusProvider | null
    synced: boolean
}

export function useCollaborationSession({
    document,
    editable,
    pageId,
    token,
    url
}: CollaborationSessionInput): CollaborationSession {
    const [synced, setSynced] = useState(false)
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    useCardInsertControl(pageId, editable)
    useCategoryPageCreateControl(pageId, editable)

    useEffect(() => {
        setSynced(false)
        const nextProvider = new HocuspocusProvider({
            url: url(pageId),
            name: `wiki:${pageId}`,
            document,
            token,
            flushDelay: 100,
            onSynced: ({ state }) => setSynced(state),
            onAuthenticationFailed: () => setSynced(!editable),
            onDisconnect: () => setSynced(!editable)
        } as ConstructorParameters<typeof HocuspocusProvider>[0] & { flushDelay: number })
        setProvider(nextProvider)

        return () => {
            nextProvider.destroy()
        }
    }, [document, editable, pageId, token, url])

    return { provider, synced }
}
