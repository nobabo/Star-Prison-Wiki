export type WikiAuthMode = 'dev' | 'jwt' | 'google'

export type WikiUserDto = {
    userId: string
    name: string
    email?: string
    picture?: string
    roles: string[]
}

export type WikiAuthStatusDto = {
    authMode: WikiAuthMode
    google: {
        enabled: boolean
    }
    user: WikiUserDto | null
}
