export type WikiLocalDraft = {
    version: 1
    pageId: string
    markdown: string
    baseMarkdown: string
    updatedAt: string
}

const DRAFT_STORAGE_PREFIX = 'cs-wiki:draft:v1:'

export function loadWikiDraft(pageId: string): WikiLocalDraft | null {
    try {
        const rawDraft = window.localStorage.getItem(storageKey(pageId))
        if (!rawDraft) return null
        const draft = JSON.parse(rawDraft) as Partial<WikiLocalDraft>
        if (
            draft.version !== 1 ||
            draft.pageId !== pageId ||
            typeof draft.markdown !== 'string' ||
            typeof draft.baseMarkdown !== 'string' ||
            typeof draft.updatedAt !== 'string'
        ) {
            window.localStorage.removeItem(storageKey(pageId))
            return null
        }
        return draft as WikiLocalDraft
    } catch {
        return null
    }
}

export function storeWikiDraft(pageId: string, markdown: string, baseMarkdown: string): WikiLocalDraft | null {
    const draft: WikiLocalDraft = {
        version: 1,
        pageId,
        markdown,
        baseMarkdown,
        updatedAt: new Date().toISOString()
    }
    try {
        window.localStorage.setItem(storageKey(pageId), JSON.stringify(draft))
        return draft
    } catch {
        return null
    }
}

export function clearWikiDraft(pageId: string, expectedMarkdown?: string): void {
    try {
        if (expectedMarkdown !== undefined && loadWikiDraft(pageId)?.markdown !== expectedMarkdown) return
        window.localStorage.removeItem(storageKey(pageId))
    } catch {
        // Storage can be unavailable in privacy modes; saving continues through the API.
    }
}

const storageKey = (pageId: string) => `${DRAFT_STORAGE_PREFIX}${pageId}`
