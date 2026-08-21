import type {
    PagePermission,
    WikiPageAccessDto,
    WikiPageDetailDto,
    WikiPageDto,
    WikiPageSearchResultDto,
    WikiSearchMatch
} from '@coconut-studio/wiki-contracts'

import type { AuthContext } from '../auth/types'
import type { WikiRepositories } from '../../persistence/repository'
import { forbidden, unauthorized } from '../../shared/http/http-error'
import { canAdminPage, canReadPage, canWritePage } from './page-policy'

export class WikiPageService {
    constructor(private readonly repositories: WikiRepositories) {}

    async listReadablePages(auth: AuthContext | null): Promise<WikiPageDto[]> {
        return this.filterReadablePages(await this.repositories.pages.listPages(), auth)
    }

    async searchReadablePages(query: string, auth: AuthContext | null): Promise<WikiPageSearchResultDto[]> {
        const normalizedQuery = normalizeSearchText(query).trim()
        if (!normalizedQuery) return []

        const pages = await this.filterReadablePages(await this.repositories.pages.listPageDetails(), auth)
        return pages
            .flatMap((page) => {
                const match = searchMatch(page, normalizedQuery)
                return match ? [{ page: toPageDto(page), match }] : []
            })
            .sort((left, right) => {
                const rankDifference = SEARCH_MATCH_RANK[left.match] - SEARCH_MATCH_RANK[right.match]
                return rankDifference || left.page.title.localeCompare(right.page.title, 'ko')
            })
    }

    private async filterReadablePages<T extends WikiPageDto>(pages: T[], auth: AuthContext | null): Promise<T[]> {
        if (!auth) return pages.filter((page) => page.visibility === 'public')
        if (auth.roles.includes('wiki:admin') || auth.roles.includes('wiki:writer')) return pages

        const privatePageIds = pages.filter((page) => page.visibility === 'private').map((page) => page.id)
        if (privatePageIds.length === 0) return pages
        const permissions = await this.repositories.permissions.resolvePagePermissions({
            pageIds: privatePageIds,
            userId: auth.userId,
            roles: auth.roles
        })
        return pages.filter(
            (page) => page.visibility === 'public' || canReadPage(page, permissions.get(page.id) ?? 'none')
        )
    }

    async getReadablePageBySlug(
        slug: string,
        auth: AuthContext | null
    ): Promise<{ page: WikiPageDetailDto; permissions: WikiPageAccessDto } | null> {
        const page = await this.repositories.pages.getPageBySlug(slug)
        return page ? this.authorizeRead(page, auth) : null
    }

    async getReadablePageById(
        pageId: string,
        auth: AuthContext | null
    ): Promise<{ page: WikiPageDetailDto; permissions: WikiPageAccessDto } | null> {
        const page = await this.repositories.pages.getPageById(pageId)
        return page ? this.authorizeRead(page, auth) : null
    }

    requireAuthenticated(auth: AuthContext | null): AuthContext {
        if (!auth) throw unauthorized()
        return auth
    }

    async requireGlobalWriter(auth: AuthContext | null): Promise<AuthContext> {
        const actor = this.requireAuthenticated(auth)
        if (!actor.roles.includes('wiki:admin') && !actor.roles.includes('wiki:writer')) throw forbidden()
        return actor
    }

    async requireGlobalAdmin(auth: AuthContext | null): Promise<AuthContext> {
        if (!auth) throw unauthorized()
        if (!auth.roles.includes('wiki:admin')) throw forbidden()
        return auth
    }

    async requirePageWriter(pageId: string, auth: AuthContext | null): Promise<AuthContext> {
        if (!auth) throw unauthorized()
        if (!canWritePage(await this.permissionFor(pageId, auth))) throw forbidden()
        return auth
    }

    async requirePageAdmin(pageId: string, auth: AuthContext | null): Promise<AuthContext> {
        if (!auth) throw unauthorized()
        if (!canAdminPage(await this.permissionFor(pageId, auth))) throw forbidden()
        return auth
    }

    async permissionFor(pageId: string, auth: AuthContext | null): Promise<PagePermission> {
        if (!auth) return 'none'
        return this.repositories.permissions.resolvePagePermission({
            pageId,
            userId: auth.userId,
            roles: auth.roles
        })
    }

    private async authorizeRead(page: WikiPageDetailDto, auth: AuthContext | null) {
        const permission = await this.permissionFor(page.id, auth)
        if (!canReadPage(page, permission)) throw forbidden()
        return {
            page,
            permissions: {
                read: true,
                write: canWritePage(permission)
            }
        }
    }
}

const SEARCH_MATCH_RANK: Record<WikiSearchMatch, number> = {
    'title-exact': 1,
    'title-contains': 2,
    'content-exact': 3,
    'content-contains': 4
}

function searchMatch(page: WikiPageDetailDto, query: string): WikiSearchMatch | null {
    const title = normalizeSearchText(page.title)
    if (title === query) return 'title-exact'
    if (title.includes(query)) return 'title-contains'

    const content = normalizeSearchText(page.markdown)
    if (containsExactKeyword(content, query)) return 'content-exact'
    if (content.includes(query)) return 'content-contains'

    const keywords = [...new Set(query.split(/\s+/u).filter(Boolean))]
    return keywords.length > 1 && keywords.every((keyword) => content.includes(keyword)) ? 'content-contains' : null
}

function containsExactKeyword(content: string, query: string): boolean {
    let start = content.indexOf(query)
    while (start >= 0) {
        const end = start + query.length
        const startsAtBoundary = start === 0 || !isSearchWordCharacter(content[start - 1] ?? '')
        const endsAtBoundary = end === content.length || !isSearchWordCharacter(content[end] ?? '')
        if (startsAtBoundary && endsAtBoundary) return true
        start = content.indexOf(query, start + 1)
    }
    return false
}

function isSearchWordCharacter(value: string): boolean {
    return /[\p{L}\p{N}]/u.test(value)
}

function normalizeSearchText(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase('ko')
}

function toPageDto(page: WikiPageDetailDto): WikiPageDto {
    const {
        markdown: _markdown,
        renderedHtml: _renderedHtml,
        updatedBy: _updatedBy,
        snapshotUpdatedAt: _snapshotUpdatedAt,
        ...dto
    } = page
    return dto
}
