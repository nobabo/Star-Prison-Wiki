import { afterEach, describe, expect, it } from 'vitest'

import { readServerConfig } from './config'

const originalEnvironment = { ...process.env }

afterEach(async () => {
    for (const key of Object.keys(process.env)) {
        if (!(key in originalEnvironment)) delete process.env[key]
    }
    Object.assign(process.env, originalEnvironment)
})

describe('readServerConfig', () => {
    it('rejects unknown authentication modes instead of falling back to development auth', () => {
        process.env.NODE_ENV = 'development'
        process.env.WIKI_AUTH_MODE = 'gogle'
        expect(() => readServerConfig()).toThrow('Unsupported WIKI_AUTH_MODE')
    })

    it('requires explicit production authentication and database configuration', () => {
        process.env.NODE_ENV = 'production'
        delete process.env.WIKI_AUTH_MODE
        delete process.env.DATABASE_URL
        expect(() => readServerConfig()).toThrow('WIKI_AUTH_MODE is required in production')

        process.env.WIKI_AUTH_MODE = 'dev'
        expect(() => readServerConfig()).toThrow('WIKI_AUTH_MODE=dev is not allowed in production')

        process.env.WIKI_AUTH_MODE = 'jwt'
        process.env.WIKI_JWT_SECRET = 'test-secret'
        expect(() => readServerConfig()).toThrow('DATABASE_URL is required in production')
    })
})
