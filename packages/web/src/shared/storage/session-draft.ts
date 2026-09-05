const prefix = 'wiki:session-draft:'
export type SessionDraft = { markdown: string; updatedAt: string }
const key = (actorId: string, pageId: string) => prefix + JSON.stringify([actorId, pageId])
export function readSessionDraft(actorId: string, pageId: string): SessionDraft | null {
    try {
        const draft = JSON.parse(window.sessionStorage.getItem(key(actorId, pageId)) ?? 'null')
        return draft && typeof draft.markdown === 'string' && typeof draft.updatedAt === 'string' ? draft : null
    } catch {
        return null
    }
}
export function writeSessionDraft(actorId: string, pageId: string, markdown: string): void {
    try {
        window.sessionStorage.setItem(
            key(actorId, pageId),
            JSON.stringify({ markdown, updatedAt: new Date().toISOString() })
        )
    } catch {
        /* The editor also warns before closing an unsaved tab. */
    }
}
export function clearSessionDraft(actorId: string, pageId: string, expectedMarkdown?: string): void {
    try {
        if (expectedMarkdown !== undefined && readSessionDraft(actorId, pageId)?.markdown !== expectedMarkdown) return
        window.sessionStorage.removeItem(key(actorId, pageId))
    } catch {
        /* Storage can be disabled. */
    }
}
export function clearSessionDrafts(): void {
    try {
        for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
            const storageKey = window.sessionStorage.key(index)
            if (storageKey?.startsWith(prefix)) window.sessionStorage.removeItem(storageKey)
        }
    } catch {
        /* Storage can be disabled. */
    }
}
