import type { WikiAuthMode } from '@coconut-studio/wiki-contracts'

export type AuthContext = {
    userId: string
    name: string
    email?: string
    picture?: string
    roles: string[]
}

export type WikiAuthConfig = {
    mode: WikiAuthMode
    jwtSecret?: string
    sessionTtl: string
    google: {
        clientId?: string
        clientSecret?: string
        redirectUri: string
        hostedDomain?: string
    }
}

export type GoogleOAuthTransaction = {
    state: string
    nonce: string
    codeVerifier: string
    returnTo: string
}

export type GoogleOAuthStart = {
    authorizationUrl: string
    transactionToken: string
    cookieMaxAgeSeconds: number
}

export type GoogleOAuthCallback = {
    sessionToken: string
    returnTo: string
}
