import type { WikiApiErrorCode, WikiApiErrorDto } from '@coconut-studio/wiki-contracts'

export class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly code: WikiApiErrorCode | string,
        message: string
    ) {
        super(message)
        this.name = 'HttpError'
    }
}

export function errorResponse(code: WikiApiErrorCode | string, message: string): WikiApiErrorDto {
    return { error: { code, message } }
}

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Authentication is required')
export const forbidden = () => new HttpError(403, 'forbidden', 'You do not have permission for this action')
export const notFound = (message = 'The requested resource was not found') => new HttpError(404, 'not_found', message)
export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, code, message)
