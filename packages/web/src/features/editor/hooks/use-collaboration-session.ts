import { useEffect, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'

import { useCardInsertControl } from './use-card-insert-control'
import { useCategoryPageCreateControl } from './use-category-page-create-control'

type CollaborationSessionInput = {
    document: Y.Doc
    pageId: string
    token: string
    url(pageId: string): string
}

export function useCollaborationSession({ document, pageId, token, url }: CollaborationSessionInput): boolean {
    const [synced, setSynced] = useState(false)
    useCardInsertControl(pageId)
    useCategoryPageCreateControl(pageId)

    useEffect(() => {
        setSynced(false)
        const provider = new HocuspocusProvider({
            url: url(pageId),
            name: `wiki:${pageId}`,
            document,
            token,
            flushDelay: 100,
            onSynced: ({ state }) => setSynced(state),
            onDisconnect: () => setSynced(false)
        } as ConstructorParameters<typeof HocuspocusProvider>[0] & { flushDelay: number })

        return () => {
            provider.destroy()
            document.destroy()
        }
    }, [document, pageId, token, url])

    return synced
}
