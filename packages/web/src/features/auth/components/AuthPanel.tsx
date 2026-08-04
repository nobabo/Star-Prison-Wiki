import { LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react'

import type { WikiAuthStatusDto } from '@coconut-studio/wiki-contracts'

type AuthPanelProps = {
    status: WikiAuthStatusDto | null
    loading: boolean
    onLogin(): void
    onLogout(): void
}

export function AuthPanel({ status, loading, onLogin, onLogout }: AuthPanelProps) {
    const user = status?.user ?? null
    const isAdmin = user?.roles.includes('wiki:admin') ?? false

    if (loading && !status) {
        return (
            <button
                type="button"
                className="auth-panel account-button"
                disabled
                aria-label="계정 확인 중"
                title="계정 확인 중"
                aria-busy="true"
            >
                <UserRound aria-hidden="true" size={18} />
            </button>
        )
    }

    if (user) {
        return (
            <button
                type="button"
                className={`auth-panel account-button ${isAdmin ? 'admin' : ''}`}
                onClick={onLogout}
                title={`${user.name} · 로그아웃`}
                aria-label={`${user.name} 계정 로그아웃`}
            >
                <LogOut aria-hidden="true" size={18} />
            </button>
        )
    }

    const canLogin = status?.authMode === 'google' ? status.google.enabled : status?.authMode === 'dev'
    if (canLogin) {
        const label = status?.authMode === 'dev' ? '개발 관리자 로그인' : 'Google 계정 로그인'
        return (
            <button
                type="button"
                className="auth-panel account-button"
                onClick={onLogin}
                title={label}
                aria-label={label}
            >
                <LogIn aria-hidden="true" size={18} />
            </button>
        )
    }

    return (
        <button
            type="button"
            className="auth-panel account-button"
            disabled
            title="비로그인 열람"
            aria-label="비로그인 열람"
        >
            {isAdmin ? <ShieldCheck aria-hidden="true" size={18} /> : <UserRound aria-hidden="true" size={18} />}
        </button>
    )
}
