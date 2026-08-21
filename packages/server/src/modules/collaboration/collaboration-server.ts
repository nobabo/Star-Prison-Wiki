import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'

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
        address: '127.0.0.1',
        port: options.port,
        debounce: 250,
        maxDebounce: 500,
        async onAuthenticate(data) {
            const pageId = pageIdFromDocumentName(data.documentName)
            const page = await options.repositories.pages.getPageById(pageId)
            if (!page) throw new Error('page_not_found')

            const auth = await options.authService.authenticateToken(data.token)
            if (!auth) {
                const access = resolveAnonymousCollaborationAccess(page)
                if (!access) throw new Error('unauthorized')
                data.connectionConfig.readOnly = access.readOnly
                return { userId: null, name: 'anonymous', roles: [], permission: access.permission }
            }

            const permission = await options.repositories.permissions.resolvePagePermission({
                pageId,
                userId: auth.userId,
                roles: auth.roles
            })
            if (!canReadPage(page, permission)) throw new Error('forbidden')
            if (!canWritePage(permission)) {
                data.connectionConfig.readOnly = true
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

export function resolveAnonymousCollaborationAccess(page: WikiPageDto): { permission: 'none'; readOnly: true } | null {
    return canReadPage(page, 'none') ? { permission: 'none', readOnly: true } : null
}

export function pageIdFromDocumentName(documentName: string): string {
    const match = /^wiki:([A-Za-z0-9_-]+)$/.exec(documentName)
    if (!match?.[1]) throw new Error('invalid_document_name')
    return match[1]
}
