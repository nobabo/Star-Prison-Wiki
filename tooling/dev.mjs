import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const apiPort = readPositiveInteger('WIKI_API_PORT', 5174, 65_535)
const startupTimeoutMs = readPositiveInteger('WIKI_API_STARTUP_TIMEOUT_MS', 30_000)
const healthUrl = `http://127.0.0.1:${apiPort}/api/wiki/health`
const children = new Set()
let shuttingDown = false

process.once('SIGINT', () => shutdown(0))
process.once('SIGTERM', () => shutdown(0))

let serverProcess = null
let serverExit = new Promise(() => undefined)

if (await isApiReady()) {
    console.log(`[wiki-dev] reusing the API already running at ${healthUrl}`)
} else {
    console.log('[wiki-dev] starting Wiki API and collaboration servers')
    serverProcess = startPnpm(['--filter', '@star-prison/wiki-server', 'dev'])
    serverExit = waitForExit(serverProcess)

    await Promise.race([
        waitForApi(),
        serverExit.then((result) => {
            throw new Error(`Wiki server exited before becoming ready (${describeExit(result)})`)
        })
    ])
}

console.log('[wiki-dev] starting Vite after API readiness')
const webProcess = startPnpm(['--filter', '@star-prison/wiki-web', 'dev'])
const webExit = waitForExit(webProcess)
const ended = await Promise.race([
    serverExit.then((result) => ({ name: 'Wiki server', result })),
    webExit.then((result) => ({ name: 'Vite', result }))
])

if (!shuttingDown) {
    console.error(`[wiki-dev] ${ended.name} stopped (${describeExit(ended.result)}); stopping remaining processes.`)
    shutdown(ended.result.code ?? 1)
}

async function waitForApi() {
    const startedAt = Date.now()
    console.log(`[wiki-dev] waiting for API readiness at ${healthUrl}`)

    while (Date.now() - startedAt < startupTimeoutMs) {
        if (await isApiReady()) {
            console.log(`[wiki-dev] API ready after ${Date.now() - startedAt}ms`)
            return
        }
        await delay(250)
    }

    throw new Error(`API did not become ready within ${startupTimeoutMs}ms: ${healthUrl}`)
}

async function isApiReady() {
    try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) })
        await response.body?.cancel()
        return response.ok
    } catch {
        return false
    }
}

function startPnpm(args) {
    const isWindows = process.platform === 'win32'
    const child = spawn(isWindows ? 'cmd.exe' : 'pnpm', isWindows ? ['/d', '/s', '/c', 'pnpm', ...args] : args, {
        cwd: repoRoot,
        detached: !isWindows,
        stdio: 'inherit',
        windowsHide: true
    })
    children.add(child)
    child.once('exit', () => children.delete(child))
    return child
}

function waitForExit(child) {
    return new Promise((resolve) => {
        child.once('error', (error) => resolve({ code: 1, signal: null, error }))
        child.once('exit', (code, signal) => resolve({ code, signal, error: null }))
    })
}

function describeExit(result) {
    if (result.error) return result.error.message
    return `code=${result.code ?? 'null'}, signal=${result.signal ?? 'null'}`
}

function shutdown(exitCode) {
    if (shuttingDown) return
    shuttingDown = true
    for (const child of children) stopProcessTree(child)
    process.exit(exitCode)
}

function stopProcessTree(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
    if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
        return
    }
    try {
        process.kill(-child.pid, 'SIGTERM')
    } catch {
        child.kill('SIGTERM')
    }
}

function readPositiveInteger(name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be a valid number`)
    return value
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
