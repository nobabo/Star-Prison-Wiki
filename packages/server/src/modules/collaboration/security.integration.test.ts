import { afterEach, describe, expect, it, vi } from 'vitest'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import type { AddressInfo } from 'node:net'
import { createCollaborationServer, type CollaborationServerOptions } from './collaboration-server'
import { replaceMarkdownYState } from './markdown-y-state'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function setup() {
    let revoked = false
    let visibility = 'public'
    let stored: Uint8Array | null = null
    const server = createCollaborationServer({
        name: 'security-test',
        port: 0,
        authService: {
            authenticateToken: async () => (revoked ? null : { userId: 'owner', name: 'Owner', roles: ['wiki:admin'] })
        },
        repositories: {
            pages: { getPageById: async () => ({ id: 'test', visibility }) },
            permissions: { resolvePagePermission: async () => 'admin' },
            collaboration: {
                loadYState: async () => stored,
                saveYState: async (_name: string, _page: string, state: Uint8Array) => {
                    stored = state
                }
            }
        }
    } as unknown as CollaborationServerOptions)
    server.configuration.quiet = true
    server.configuration.stopOnSignals = false
    await server.listen()
    cleanups.push(() => server.destroy())
    async function connect(token: string) {
        const document = new Y.Doc()
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`,
            name: 'wiki:test',
            token,
            document
        })
        cleanups.push(async () => {
            provider.destroy()
            document.destroy()
        })
        await vi.waitFor(() => expect(provider.isSynced).toBe(true))
        return { document, provider }
    }
    return {
        server,
        connect,
        revoke: () => {
            revoked = true
        },
        makePrivate: () => {
            visibility = 'private'
        },
        restore: async () => {
            stored = await replaceMarkdownYState(stored, '# Restored\n\nSafe content')
        }
    }
}

describe('live collaboration security', () => {
    it('rejects writes from a revoked session', async () => {
        const api = await setup()
        const { document } = await api.connect('owner')
        const live = api.server.hocuspocus.documents.get('wiki:test')!
        api.revoke()
        document.getText('probe').insert(0, 'must not persist')
        await vi.waitFor(() => expect(live.getConnections()).toHaveLength(0))
        expect(live.getText('probe').toString()).toBe('')
    })
    it('disconnects public readers before a private update is broadcast', async () => {
        const api = await setup()
        const reader = await api.connect('')
        const writer = await api.connect('owner')
        api.makePrivate()
        writer.document.getText('probe').insert(0, 'private content')
        await vi.waitFor(() =>
            expect(api.server.hocuspocus.documents.get('wiki:test')?.getText('probe').toString()).toBe(
                'private content'
            )
        )
        expect(reader.document.getText('probe').toString()).toBe('')
    })
    it('restores the persisted and live Yjs state before reconnecting', async () => {
        const api = await setup()
        const writer = await api.connect('owner')
        const state = await replaceMarkdownYState(null, '# Original')
        Y.applyUpdate(writer.document, state)
        await vi.waitFor(() =>
            expect(api.server.hocuspocus.documents.get('wiki:test')?.getXmlFragment('default').toString()).toContain(
                'Original'
            )
        )
        await api.server.mutatePage('test', api.restore)
        const next = await api.connect('owner')
        expect(next.document.getXmlFragment('default').toString()).toContain('Restored')
        expect(next.document.getXmlFragment('default').toString()).not.toContain('Original')
    })
})
