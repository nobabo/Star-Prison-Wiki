export type WikiApiErrorCode =
    | 'bad_request'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'conflict'
    | 'internal_server_error'
    | `oauth_${string}`

export type WikiApiErrorDto = {
    error: {
        code: WikiApiErrorCode | string
        message: string
    }
}

export function isWikiApiErrorDto(value: unknown): value is WikiApiErrorDto {
    if (!value || typeof value !== 'object') return false
    const error = (value as { error?: unknown }).error
    return Boolean(
        error &&
        typeof error === 'object' &&
        typeof (error as { code?: unknown }).code === 'string' &&
        typeof (error as { message?: unknown }).message === 'string'
    )
}
