import { createWikiServer } from '@coconut-studio/wiki-server'

import { readServerConfig } from './config'

const config = readServerConfig()
const runtime = createWikiServer(config)
let stopping = false
let fatalHold: ReturnType<typeof setInterval> | null = null

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
process.on('uncaughtException', (error) => void handleFatal(error))
process.on('unhandledRejection', (error) => void handleFatal(error))

try {
    await runtime.start()
} catch (error) {
    await handleFatal(error)
}

async function handleFatal(error: unknown): Promise<void> {
    console.error('[star-prison-wiki] fatal server error', error)
    if (process.env.WIKI_EXIT_ON_FATAL === '1') {
        await shutdown(1)
        return
    }
    fatalHold ??= setInterval(() => undefined, 60_000)
    console.error('[star-prison-wiki] Press Ctrl+C to close the server.')
}

async function shutdown(exitCode: number): Promise<void> {
    if (stopping) return
    stopping = true
    if (fatalHold) clearInterval(fatalHold)
    try {
        await runtime.stop()
    } catch (error) {
        console.error('[star-prison-wiki] shutdown failed', error)
        exitCode = 1
    }
    process.exit(exitCode)
}
