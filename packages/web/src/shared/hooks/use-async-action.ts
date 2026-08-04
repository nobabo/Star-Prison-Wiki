import { useCallback, useRef, useState } from 'react'

import { WikiApiError } from '../api/wiki-api'

export function useAsyncAction() {
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const pendingRef = useRef(false)

    const run = useCallback((action: () => Promise<void>): void => {
        if (pendingRef.current) return
        pendingRef.current = true
        setPending(true)
        setError(null)
        void Promise.resolve()
            .then(action)
            .catch((reason: unknown) => {
                console.error(reason)
                setError(toActionErrorMessage(reason))
            })
            .finally(() => {
                pendingRef.current = false
                setPending(false)
            })
    }, [])

    return { run, pending, error, clearError: () => setError(null) }
}

function toActionErrorMessage(error: unknown): string {
    if (error instanceof WikiApiError) {
        if (error.status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.'
        if (error.status === 403) return '이 작업을 수행할 권한이 없습니다.'
        if (error.status === 409) return '다른 변경과 충돌했습니다. 새로고침 후 다시 시도해 주세요.'
    }
    return '작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}
