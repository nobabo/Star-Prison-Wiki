import type { Server as HttpServer } from 'node:http'

import type { Express } from 'express'

import { WikiAuthService } from '../modules/auth/auth-service'
import type { WikiAuthConfig } from '../modules/auth/types'
import { createCollaborationServer } from '../modules/collaboration/collaboration-server'
import type { WikiRepositories } from '../persistence/repository'
import { createWikiHttpApp } from './http-app'

export type WikiServerOptions = {
    name: string
    apiPort: number
    collaborationPort: number
    repositories: WikiRepositories
    auth: WikiAuthConfig
    forceSecureCookie?: boolean
    mediaDirectory?: string
    logger?: Pick<Console, 'log' | 'error'>
}

export type WikiServerRuntime = {
    app: Express
    authService: WikiAuthService
    start(): Promise<void>
    stop(): Promise<void>
}

export function createWikiServer(options: WikiServerOptions): WikiServerRuntime {
    const logger = options.logger ?? console
    const authService = new WikiAuthService(options.auth, options.repositories.adminAccounts)
    const app = createWikiHttpApp({
        repositories: options.repositories,
        authService,
        authRouter: {
            transactionCookieName: 'cs_wiki_google_oauth',
            forceSecureCookie: options.forceSecureCookie ?? false
        },
        mediaDirectory: options.mediaDirectory,
        logger
    })
    const collaboration = createCollaborationServer({
        name: `${options.name}-sync`,
        port: options.collaborationPort,
        repositories: options.repositories,
        authService
    })
    let httpServer: HttpServer | null = null

    return {
        app,
        authService,
        async start() {
            if (httpServer) return
            httpServer = await listen(app, options.apiPort)
            try {
                await collaboration.listen()
            } catch (error) {
                try {
                    await closeHttpServer(httpServer)
                } catch (closeError) {
                    throw new AggregateError([error, closeError], 'Wiki server startup and cleanup failed')
                }
                httpServer = null
                throw error
            }
            logger.log(
                `${options.name} API listening on http://127.0.0.1:${options.apiPort} (${options.repositories.mode})`
            )
            logger.log(`${options.name} collaboration listening on ws://127.0.0.1:${options.collaborationPort}`)
        },
        async stop() {
            const server = httpServer
            httpServer = null
            const errors: unknown[] = []
            if (server) {
                try {
                    await closeHttpServer(server)
                } catch (error) {
                    errors.push(error)
                }
            }
            try {
                await collaboration.destroy()
            } catch (error) {
                errors.push(error)
            }
            try {
                await options.repositories.close()
            } catch (error) {
                errors.push(error)
            }
            if (errors.length > 0) throw new AggregateError(errors, 'Wiki server shutdown failed')
        }
    }
}

function listen(app: Express, port: number): Promise<HttpServer> {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1', () => resolve(server))
        server.once('error', reject)
    })
}

function closeHttpServer(server: HttpServer): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
    })
}
