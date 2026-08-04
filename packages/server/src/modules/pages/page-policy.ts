import type { PagePermission, WikiPageDto } from '@coconut-studio/wiki-contracts'

export function canReadPage(page: WikiPageDto, permission: PagePermission): boolean {
    return page.visibility === 'public' || permission !== 'none'
}

export function canWritePage(permission: PagePermission): boolean {
    return permission === 'write' || permission === 'admin'
}

export function canAdminPage(permission: PagePermission): boolean {
    return permission === 'admin'
}

export function strongestPermission(left: PagePermission, right: PagePermission): PagePermission {
    const rank: Record<PagePermission, number> = { none: 0, read: 1, write: 2, admin: 3 }
    return rank[right] > rank[left] ? right : left
}
