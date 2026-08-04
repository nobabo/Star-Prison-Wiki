import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import type { WikiAuthMode } from '@coconut-studio/wiki-contracts'
import {
    createFileRepositories,
    createPostgresRepositories,
    type WikiAuthConfig,
    type WikiRepositories,
    type WikiServerOptions
} from '@coconut-studio/wiki-server'

import { LevelFileLogger } from './runtime/level-file-logger'

export type StarPrisonServerConfig = Omit<WikiServerOptions, 'repositories'> & {
    repositories: WikiRepositories
    logger: LevelFileLogger
}

export function readServerConfig(): StarPrisonServerConfig {
    const production = process.env.NODE_ENV === 'production'
    const logger = createServerLogger()
    const apiPort = readPort('WIKI_API_PORT', 5174)
    const collaborationPort = readPort('WIKI_SYNC_PORT', 2234)
    const auth = readAuthConfig(apiPort, production)
    const databaseUrl = optionalEnv('DATABASE_URL')
    if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production')
    const repositories = databaseUrl
        ? createPostgresRepositories(databaseUrl)
        : createFileRepositories({
              filePath:
                  optionalEnv('WIKI_DATA_FILE') ?? fileURLToPath(new URL('../.local/wiki-store.json', import.meta.url)),
              seed: {
                  id: 'welcome',
                  slug: 'welcome',
                  title: '별도소 위키 대문',
                  icon: '🔒',
                  visibility: 'public',
                  actorId: 'dev-admin',
                  markdown: '# 별도소 공식 위키\n\n별도소 서버 전용 기록과 운영 문서를 정리합니다.\n',
                  adminEmails: readDevAdminEmails()
              }
          })

    return {
        name: 'star-prison-wiki',
        apiPort,
        collaborationPort,
        repositories,
        auth,
        logger,
        forceSecureCookie: production || process.env.WIKI_COOKIE_SECURE === '1'
    }
}

export function createServerLogger(): LevelFileLogger {
    return new LevelFileLogger(
        resolve(optionalEnv('WIKI_LOG_DIR') ?? fileURLToPath(new URL('../.local/logs', import.meta.url)))
    )
}

function readAuthConfig(apiPort: number, production: boolean): WikiAuthConfig {
    const mode = readAuthMode(production)
    const jwtSecret = optionalEnv('WIKI_JWT_SECRET')
    const google = {
        clientId: optionalEnv('GOOGLE_OAUTH_CLIENT_ID') ?? undefined,
        clientSecret: optionalEnv('GOOGLE_OAUTH_CLIENT_SECRET') ?? undefined,
        redirectUri:
            optionalEnv('GOOGLE_OAUTH_REDIRECT_URI') ?? `http://127.0.0.1:${apiPort}/api/wiki/auth/google/callback`,
        hostedDomain: optionalEnv('WIKI_GOOGLE_HOSTED_DOMAIN') ?? undefined
    }

    if ((mode === 'jwt' || mode === 'google') && !jwtSecret) {
        throw new Error(`WIKI_JWT_SECRET is required when WIKI_AUTH_MODE=${mode}`)
    }
    if (mode === 'google') {
        if (!google.clientId || !google.clientSecret) {
            throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required in google mode')
        }
        if (production && !optionalEnv('GOOGLE_OAUTH_REDIRECT_URI')) {
            throw new Error('GOOGLE_OAUTH_REDIRECT_URI is required in production google mode')
        }
    }

    return { mode, jwtSecret: jwtSecret ?? undefined, sessionTtl: optionalEnv('WIKI_SESSION_TTL') ?? '8h', google }
}

function readAuthMode(production: boolean): WikiAuthMode {
    const mode = optionalEnv('WIKI_AUTH_MODE')
    if (!mode) {
        if (production) throw new Error('WIKI_AUTH_MODE is required in production')
        return 'dev'
    }
    if (mode !== 'dev' && mode !== 'jwt' && mode !== 'google') {
        throw new Error(`Unsupported WIKI_AUTH_MODE: ${mode}`)
    }
    if (production && mode === 'dev') throw new Error('WIKI_AUTH_MODE=dev is not allowed in production')
    return mode
}

function readPort(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error(`${name} must be a valid port`)
    return value
}

function optionalEnv(name: string): string | null {
    const value = process.env[name]?.trim()
    return value || null
}

function readDevAdminEmails(): string[] {
    const raw = optionalEnv('WIKI_DEV_ADMIN_EMAILS')
    if (!raw) return []
    const emails = raw.split(',').map((email) => email.trim().toLowerCase())
    if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        throw new Error('WIKI_DEV_ADMIN_EMAILS contains an invalid email')
    }
    return [...new Set(emails)]
}
