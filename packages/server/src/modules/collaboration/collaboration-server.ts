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

export function createCollaborationServer(
    options: CollaborationServerOptions
): Server & { mutatePage: import('./page-mutation').PageMutation } {
    type Session = {
        token: string
        userId: string | null
        name: string
        picture?: string
        roles: string[]
        permission: string
    }
    const validate = async (document: import('@hocuspocus/server').Document) => {
        const page = await options.repositories.pages.getPageById(pageIdFromDocumentName(document.name))
        for (const connection of document.getConnections()) {
            const session = connection.context as Session
            const auth = session.token ? await options.authService.authenticateToken(session.token) : null
            const permission = auth
                ? await options.repositories.permissions.resolvePagePermission({
                      pageId: page?.id ?? '',
                      userId: auth.userId,
                      roles: auth.roles
                  })
                : 'none'
            if (
                !page ||
                (session.token && !auth) ||
                !canReadPage(page, permission) ||
                (!connection.readOnly && !canWritePage(permission))
            ) {
                connection.close({ code: 4403, reason: 'Access changed; reconnect to continue' })
            }
        }
    }
    let timer: ReturnType<typeof setInterval> | undefined
    let checking = false
    const paused = new Set<string>()
    const server = new Server<Session>({
        name: options.name,
        address: '127.0.0.1',
        port: options.port,
        debounce: 250,
        maxDebounce: 500,
        websocketOptions: { maxPayload: 5 * 1024 * 1024 },
        async onAuthenticate(data) {
            const pageId = pageIdFromDocumentName(data.documentName)
            if (paused.has(pageId)) throw new Error('document_busy')
            const page = await options.repositories.pages.getPageById(pageId)
            if (!page) throw new Error('page_not_found')
            const auth = data.token ? await options.authService.authenticateToken(data.token) : null
            if (data.token && !auth) throw new Error('unauthorized')
            const permission = auth
                ? await options.repositories.permissions.resolvePagePermission({
                      pageId,
                      userId: auth.userId,
                      roles: auth.roles
                  })
                : 'none'
            if (!canReadPage(page, permission)) throw new Error('forbidden')
            data.connectionConfig.readOnly = !canWritePage(permission)
            return {
                token: data.token,
                userId: auth?.userId ?? null,
                name: auth?.name ?? 'anonymous',
                picture: auth?.picture,
                roles: auth?.roles ?? [],
                permission
            }
        },
        async beforeHandleMessage({ document, connection }) {
            if (paused.has(pageIdFromDocumentName(document.name))) throw new Error('document_busy')
            await validate(document)
            if (!document.hasConnection(connection)) throw new Error('forbidden')
        },
        async beforeHandleAwareness({ context, states }) {
            for (const state of states.values()) {
                state.collaborator =
                    context?.userId &&
                    canWritePage(context.permission as import('@coconut-studio/wiki-contracts').PagePermission)
                        ? { userId: context.userId, name: context.name, picture: context.picture }
                        : null
            }
        },
        async onLoadDocument({ documentName }) {
            return (await options.repositories.collaboration.loadYState(documentName)) ?? new Y.Doc()
        },
        async onStoreDocument({ document, documentName }) {
            const pageId = pageIdFromDocumentName(documentName)
            if (!(await options.repositories.pages.getPageById(pageId))) return
            await options.repositories.collaboration.saveYState(documentName, pageId, Y.encodeStateAsUpdate(document))
        },
        async onListen() {
            timer = setInterval(async () => {
                if (checking) return
                checking = true
                try {
                    for (const document of server.hocuspocus.documents.values()) await validate(document)
                } catch {
                    for (const document of server.hocuspocus.documents.values())
                        for (const connection of document.getConnections()) connection.close()
                } finally {
                    checking = false
                }
            }, 30_000)
            timer.unref()
        },
        async onDestroy() {
            if (timer) clearInterval(timer)
        }
    })
    return Object.assign(server, {
        async mutatePage<T>(pageId: string, operation: () => Promise<T>): Promise<T> {
            if (paused.has(pageId)) throw new Error('document_busy')
            paused.add(pageId)
            const documentName = `wiki:${pageId}`
            const document = server.hocuspocus.documents.get(documentName)
            try {
                if (!document) return await operation()
                document.addDirectConnection()
                const connections = document.getConnections()
                for (const connection of connections)
                    connection.close({ code: 4410, reason: 'Document updated; reconnect' })
                await Promise.all(connections.map((connection) => connection.waitForPendingMessages()))
                return await document.saveMutex.runExclusive(async () => {
                    await options.repositories.collaboration.saveYState(
                        documentName,
                        pageId,
                        Y.encodeStateAsUpdate(document)
                    )
                    const result = await operation()
                    const state = await options.repositories.collaboration.loadYState(documentName)
                    if (state) Y.applyUpdate(document, state)
                    return result
                })
            } finally {
                paused.delete(pageId)
                if (document) {
                    document.removeDirectConnection()
                    await server.hocuspocus.unloadDocument(document)
                }
            }
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
