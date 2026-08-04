import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'

import type { WikiAuthService } from '../auth/auth-service'
import { canReadPage, canWritePage } from '../pages/page-policy'
import type { WikiRepositories } from '../../persistence/repository'

export type CollaborationServerOptions = {
    name: string
    port: number
    repositories: WikiRepositories
    authService: WikiAuthService
}

export function createCollaborationServer(options: CollaborationServerOptions): Server {
    return new Server({
        name: options.name,
        port: options.port,
        debounce: 250,
        maxDebounce: 500,
        async onAuthenticate(data) {
            const auth = await options.authService.authenticateToken(data.token)
            if (!auth) throw new Error('unauthorized')

            const pageId = pageIdFromDocumentName(data.documentName)
            const page = await options.repositories.pages.getPageById(pageId)
            if (!page) throw new Error('page_not_found')

            const permission = await options.repositories.permissions.resolvePagePermission({
                pageId,
                userId: auth.userId,
                roles: auth.roles
            })
            if (!canReadPage(page, permission)) throw new Error('forbidden')
            if (!canWritePage(permission)) {
                const connection = data as typeof data & { connection: { readOnly: boolean } }
                connection.connection.readOnly = true
            }
            return { userId: auth.userId, name: auth.name, roles: auth.roles, permission }
        },
        async onLoadDocument({ documentName }) {
            return (await options.repositories.collaboration.loadYState(documentName)) ?? new Y.Doc()
        },
        async onStoreDocument({ document, documentName }) {
            await options.repositories.collaboration.saveYState(
                documentName,
                pageIdFromDocumentName(documentName),
                Y.encodeStateAsUpdate(document)
            )
        }
    })
}

export function pageIdFromDocumentName(documentName: string): string {
    const match = /^wiki:([A-Za-z0-9_-]+)$/.exec(documentName)
    if (!match?.[1]) throw new Error('invalid_document_name')
    return match[1]
}
