import { spawn } from 'node:child_process'
import { appendFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const serverEntry = resolve(repoRoot, 'apps/server/dist/main.js')
const logDirectory = resolve(
    process.env.WIKI_LOG_DIR?.trim() || repoRoot,
    process.env.WIKI_LOG_DIR?.trim() ? '' : 'apps/server/.local/logs'
)
const maximumCapturedErrorLength = 256 * 1024
const maximumRestartDelayMs = 30_000
const stableRunMs = 60_000
let child = null
let stopping = false
let restartAttempt = 0

process.once('SIGINT', () => stop('SIGINT'))
process.once('SIGTERM', () => stop('SIGTERM'))

while (!stopping) {
    const startedAt = Date.now()
    const result = await runWorker()
    if (stopping || result.code === 0) break

    await appendLevelLog('fatal', '[star-prison-wiki] server worker stopped unexpectedly', {
        code: result.code,
        signal: result.signal,
        error: result.error,
        stderr: result.stderr
    })

    restartAttempt = Date.now() - startedAt >= stableRunMs ? 0 : restartAttempt + 1
    const delay = Math.min(1_000 * 2 ** Math.min(restartAttempt, 5), maximumRestartDelayMs)
    const restartDetails = { code: result.code, signal: result.signal, delay }
    console.error('[star-prison-wiki] worker stopped; restarting', restartDetails)
    await appendLevelLog('error', '[star-prison-wiki] worker stopped; restarting', restartDetails)
    await delayUnlessStopped(delay)
}

function runWorker() {
    return new Promise((complete) => {
        let settled = false
        let stderr = ''
        child = spawn(process.execPath, [serverEntry], {
            cwd: repoRoot,
            env: { ...process.env, WIKI_EXIT_ON_FATAL: '1' },
            stdio: ['inherit', 'pipe', 'pipe']
        })
        child.stdout?.on('data', (chunk) => process.stdout.write(chunk))
        child.stderr?.on('data', (chunk) => {
            process.stderr.write(chunk)
            stderr = keepTail(stderr + String(chunk), maximumCapturedErrorLength)
        })
        child.once('error', (error) => finish({ code: 1, signal: null, error: serialize(error), stderr }))
        child.once('close', (code, signal) => finish({ code, signal, error: null, stderr }))

        function finish(result) {
            if (settled) return
            settled = true
            child = null
            complete(result)
        }
    })
}

function stop(signal) {
    if (stopping) return
    stopping = true
    child?.kill(signal)
}

async function appendLevelLog(level, message, details) {
    try {
        await mkdir(logDirectory, { recursive: true })
        await appendFile(
            resolve(logDirectory, `${level}.log`),
            `${JSON.stringify({ timestamp: new Date().toISOString(), level, message, details })}\n`,
            'utf8'
        )
    } catch (error) {
        console.error('[star-prison-wiki] failed to write supervisor log', error)
    }
}

function delayUnlessStopped(milliseconds) {
    return new Promise((complete) => {
        const interval = setInterval(() => {
            if (!stopping) return
            clearInterval(interval)
            clearTimeout(timeout)
            complete()
        }, 100)
        const timeout = setTimeout(() => {
            clearInterval(interval)
            complete()
        }, milliseconds)
    })
}

function keepTail(value, maximumLength) {
    return value.length <= maximumLength ? value : value.slice(value.length - maximumLength)
}

function serialize(error) {
    return error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) }
}
