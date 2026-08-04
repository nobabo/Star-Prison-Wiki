export const TOKEN_STORAGE_KEY = 'coconut-studio-wiki-token'

type BrowserLocation = Pick<Location, 'hash' | 'pathname' | 'search'>
type BrowserHistory = Pick<History, 'replaceState' | 'state'>
type TokenStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export function initializeAuthToken(
    location: BrowserLocation = window.location,
    history: BrowserHistory = window.history,
    storage: TokenStorage = window.localStorage
): string {
    const callbackToken = consumeGoogleOAuthCallback(location, history)
    if (callbackToken) {
        writeAuthToken(callbackToken, storage)
        return callbackToken
    }
    return readAuthToken(storage)
}

export function consumeGoogleOAuthCallback(location: BrowserLocation, history: BrowserHistory): string | null {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''))
    if (params.get('wiki_auth') !== 'google') return null

    const token = params.get('wiki_token')?.trim() ?? ''
    params.delete('wiki_auth')
    params.delete('wiki_token')
    const remainingHash = params.toString()
    history.replaceState(
        history.state,
        '',
        `${location.pathname}${location.search}${remainingHash ? `#${remainingHash}` : ''}`
    )
    return token || null
}

export function readAuthToken(storage: TokenStorage = window.localStorage): string {
    try {
        return storage.getItem(TOKEN_STORAGE_KEY) ?? ''
    } catch {
        return ''
    }
}

export function writeAuthToken(token: string, storage: TokenStorage = window.localStorage): void {
    try {
        if (token) storage.setItem(TOKEN_STORAGE_KEY, token)
        else storage.removeItem(TOKEN_STORAGE_KEY)
    } catch {
        // Authentication still works for the current page when storage is unavailable.
    }
}

export function googleOAuthStartUrl(
    apiBasePath: string | undefined,
    returnTo: string,
    origin = window.location.origin
) {
    const basePath = (apiBasePath ?? '/api/wiki').replace(/\/$/, '')
    const url = new URL(`${basePath}/auth/google/start`, origin)
    url.searchParams.set('returnTo', returnTo)
    return url.toString()
}
