import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LevelFileLogger } from './level-file-logger'

const temporaryDirectories: string[] = []

afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
})

describe('LevelFileLogger', () => {
    it('writes each log level to a separate file and flushes fatal errors', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const directory = await mkdtemp(join(tmpdir(), 'star-prison-wiki-logs-'))
        temporaryDirectories.push(directory)
        const logger = new LevelFileLogger(directory)

        logger.log('started', { port: 5174 })
        logger.error('request failed', new Error('database unavailable'))
        await logger.fatal('worker crashed', new Error('fatal'))

        expect(await readFile(join(directory, 'info.log'), 'utf8')).toContain('started')
        expect(await readFile(join(directory, 'error.log'), 'utf8')).toContain('database unavailable')
        expect(await readFile(join(directory, 'fatal.log'), 'utf8')).toContain('worker crashed')
    })
})
