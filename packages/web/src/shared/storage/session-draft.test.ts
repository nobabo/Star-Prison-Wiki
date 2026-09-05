import { afterEach, expect, it, vi } from 'vitest'
import { clearSessionDraft, clearSessionDrafts, readSessionDraft, writeSessionDraft } from './session-draft'

afterEach(() => vi.unstubAllGlobals())
it('isolates drafts by account and does not delete newer edits after an older save', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
        sessionStorage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
            key: (index: number) => [...values.keys()][index] ?? null,
            get length() {
                return values.size
            }
        }
    })
    writeSessionDraft('alice', 'page', 'first')
    expect(readSessionDraft('bob', 'page')).toBeNull()
    writeSessionDraft('alice', 'page', 'newer')
    clearSessionDraft('alice', 'page', 'first')
    expect(readSessionDraft('alice', 'page')?.markdown).toBe('newer')
    clearSessionDrafts()
    expect(readSessionDraft('alice', 'page')).toBeNull()
})
