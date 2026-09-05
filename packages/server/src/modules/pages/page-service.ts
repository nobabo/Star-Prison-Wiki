import type {
    PagePermission,
    WikiPageAccessDto,
    WikiPageDetailDto,
    WikiPageDto,
    WikiPageSearchResultDto
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
        const normalizedQuery = query.normalize('NFKC').toLocaleLowerCase('ko').trim()
        if (!normalizedQuery) return []
        return this.repositories.pages.searchPages({
            query: normalizedQuery,
            userId: auth?.userId ?? null,
            roles: auth?.roles ?? [],
            limit: 50
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
