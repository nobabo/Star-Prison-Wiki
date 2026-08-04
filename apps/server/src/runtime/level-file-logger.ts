import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export type LogLevel = 'info' | 'error' | 'fatal'

export class LevelFileLogger {
    private queue: Promise<void> = Promise.resolve()

    constructor(private readonly directory: string) {}

    log(message: unknown, ...details: unknown[]): void {
        console.log(message, ...details)
        this.enqueue('info', message, details)
    }

    error(message: unknown, ...details: unknown[]): void {
        console.error(message, ...details)
        this.enqueue('error', message, details)
    }

    async fatal(message: unknown, ...details: unknown[]): Promise<void> {
        console.error(message, ...details)
        await this.write('fatal', message, details)
        await this.flush()
    }

    async flush(): Promise<void> {
        await this.queue
    }

    private enqueue(level: Exclude<LogLevel, 'fatal'>, message: unknown, details: unknown[]): void {
        this.queue = this.queue
            .then(() => this.write(level, message, details))
            .catch((error: unknown) => {
                console.error('[star-prison-wiki] failed to write log file', error)
            })
    }

    private async write(level: LogLevel, message: unknown, details: unknown[]): Promise<void> {
        await mkdir(this.directory, { recursive: true })
        const entry = JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message: serialize(message),
            details: details.map(serialize)
        })
        await appendFile(join(this.directory, `${level}.log`), `${entry}\n`, 'utf8')
    }
}

function serialize(value: unknown): unknown {
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack }
    }
    if (typeof value === 'bigint') return value.toString()
    if (value && typeof value === 'object') {
        try {
            return JSON.parse(JSON.stringify(value)) as unknown
        } catch {
            return String(value)
        }
    }
    return value
}
