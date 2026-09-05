import { randomUUID } from 'node:crypto'

import type {
    PagePermission,
    WikiPageDetailDto,
    WikiPageDto,
    WikiNavigationPreferencesDto,
    WikiSavepointDto,
    WikiSnapshotDto
} from '@coconut-studio/wiki-contracts'
import { renderMarkdownToHtml } from '@coconut-studio/wiki-markdown'
import { replaceMarkdownYState } from '../../modules/collaboration/markdown-y-state'
import pg from 'pg'

import { strongestPermission } from '../../modules/pages/page-policy'
import { normalizePageIcon } from '../../shared/page-normalization'
import type {
    AdminAccountRepository,
    CollaborationStateRepository,
    CreatePageInput,
    NavigationPreferencesRepository,
    PageRepository,
    PermissionRepository,
    UpdatePageAddressInput,
    UpdatePageMetaInput,
    WikiRepositories
} from '../repository'

const { Pool } = pg

export class PostgresWikiRepository
    implements
        PageRepository,
        PermissionRepository,
        AdminAccountRepository,
        CollaborationStateRepository,
        NavigationPreferencesRepository
{
    private readonly pool: pg.Pool

    constructor(databaseUrl: string) {
        this.pool = new Pool({ connectionString: databaseUrl })
    }

    async listPages(): Promise<WikiPageDto[]> {
        const { rows } = await this.pool.query(`
            SELECT id, slug, title, icon, visibility, created_by, created_at, updated_at, deleted_at, deleted_by
            FROM wiki_pages
            WHERE deleted_at IS NULL
            ORDER BY title ASC
        `)
        return rows.map(mapPage)
    }

    async listPageDetails(): Promise<WikiPageDetailDto[]> {
        const { rows } = await this.pool.query(`
            SELECT p.id, p.slug, p.title, p.icon, p.visibility, p.created_by, p.created_at,
                   p.updated_at, p.deleted_at, p.deleted_by, s.markdown, s.rendered_html,
                   s.updated_by, s.updated_at AS snapshot_updated_at
            FROM wiki_pages p
            JOIN wiki_markdown_snapshots s ON s.page_id = p.id
            WHERE p.deleted_at IS NULL
            ORDER BY p.title ASC
        `)
        return rows.map(mapPageDetail)
    }

    async getPageById(pageId: string): Promise<WikiPageDetailDto | null> {
        return this.getPage('p.id = $1', pageId)
    }

    async searchPages(input: import('../../shared/page-search').PageSearchInput) {
        const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')
        const query = input.query.normalize('NFKC').toLocaleLowerCase('ko')
        const keywords = [...new Set(query.split(/\s+/u).filter(Boolean))].map((word) => `%${escapeLike(word)}%`)
        const { rows } = await this.pool.query(
            `WITH candidates AS (
                SELECT id FROM wiki_pages
                WHERE deleted_at IS NULL AND lower(normalize(title, NFKC)) LIKE $1
                UNION
                SELECT page_id AS id FROM wiki_markdown_snapshots
                WHERE lower(normalize(markdown, NFKC)) LIKE ALL($2::text[])
             )
             SELECT p.id, p.slug, p.title, p.icon, p.visibility, p.created_by, p.created_at,
                    p.updated_at, p.deleted_at, p.deleted_by,
                    CASE WHEN lower(normalize(p.title, NFKC)) = $3 THEN 'title-exact'
                         WHEN lower(normalize(p.title, NFKC)) LIKE $1 THEN 'title-contains'
                         WHEN lower(normalize(s.markdown, NFKC)) ~ $6 THEN 'content-exact'
                         ELSE 'content-contains' END AS match
             FROM candidates c JOIN wiki_pages p ON p.id = c.id
             JOIN wiki_markdown_snapshots s ON s.page_id = p.id
             WHERE p.deleted_at IS NULL AND (
                 p.visibility = 'public' OR $4::boolean OR EXISTS (
                     SELECT 1 FROM wiki_permissions acl WHERE acl.page_id = p.id AND (
                         (acl.subject_type = 'user' AND acl.subject_id = $5) OR
                         (acl.subject_type = 'role' AND acl.subject_id = ANY($7::text[]))
                     ) AND acl.access IN ('read', 'write', 'admin')
                 )
             )
             ORDER BY CASE WHEN lower(normalize(p.title, NFKC)) = $3 THEN 1
                           WHEN lower(normalize(p.title, NFKC)) LIKE $1 THEN 2
                           WHEN lower(normalize(s.markdown, NFKC)) ~ $6 THEN 3 ELSE 4 END, p.title, p.id
             LIMIT $8`,
            [
                `%${escapeLike(query)}%`,
                keywords,
                query,
                input.roles.some((role) => role === 'wiki:admin' || role === 'wiki:writer'),
                input.userId,
                `(^|[^[:alnum:]])${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^[:alnum:]]|$)`,
                input.roles,
                input.limit
            ]
        )
        return rows.map((row) => ({
            page: mapPage(row),
            match: row.match as import('@coconut-studio/wiki-contracts').WikiSearchMatch
        }))
    }

    async getPageBySlug(slug: string): Promise<WikiPageDetailDto | null> {
        return this.getPage('p.slug = $1', slug)
    }

    async createPage(input: CreatePageInput): Promise<WikiPageDetailDto> {
        const id = randomUUID()
        const renderedHtml = await renderMarkdownToHtml(input.markdown)
        await this.transaction(async (client) => {
            await client.query(
                `INSERT INTO wiki_pages (id, slug, title, icon, visibility, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, input.slug, input.title, normalizePageIcon(input.icon), input.visibility, input.actorId]
            )
            await client.query(
                `INSERT INTO wiki_markdown_snapshots (page_id, markdown, rendered_html, updated_by)
                 VALUES ($1, $2, $3, $4)`,
                [id, input.markdown, renderedHtml, input.actorId]
            )
            await client.query(
                `INSERT INTO wiki_revisions (page_id, markdown, rendered_html, actor_id)
                 VALUES ($1, $2, $3, $4)`,
                [id, input.markdown, renderedHtml, input.actorId]
            )
        })
        const page = await this.getPageById(id)
        if (!page) throw new Error('created_page_unreadable')
        return page
    }

    async updatePageMeta(input: UpdatePageMetaInput): Promise<WikiPageDetailDto | null> {
        const { rowCount } = await this.pool.query(
            `UPDATE wiki_pages
             SET title = COALESCE($2, title),
                 icon = CASE WHEN $3::boolean THEN $4 ELSE icon END,
                 visibility = COALESCE($5, visibility), updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL`,
            [
                input.pageId,
                input.title ?? null,
                input.icon !== undefined,
                normalizePageIcon(input.icon),
                input.visibility ?? null
            ]
        )
        return rowCount ? this.getPageById(input.pageId) : null
    }

    async updatePageAddress(input: UpdatePageAddressInput): Promise<WikiPageDetailDto | null> {
        const { rowCount } = await this.pool.query(
            `UPDATE wiki_pages
             SET slug = $2, updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL`,
            [input.pageId, input.slug]
        )
        return rowCount ? this.getPageById(input.pageId) : null
    }

    async saveMarkdownSnapshot(input: {
        pageId: string
        markdown: string
        actorId: string
        expectedUpdatedAt: string
    }): Promise<WikiSnapshotDto> {
        const renderedHtml = await renderMarkdownToHtml(input.markdown)
        const updatedAt = await this.transaction(async (client) => {
            const snapshot = await client.query(
                `WITH locked_page AS (
                     SELECT id
                     FROM wiki_pages
                     WHERE id = $1 AND deleted_at IS NULL
                     FOR UPDATE
                 ), updated_snapshot AS (
                     UPDATE wiki_markdown_snapshots AS s
                     SET markdown = $2,
                         rendered_html = $3,
                         updated_by = $4,
                         updated_at = NOW()
                     FROM locked_page AS p
                     WHERE s.page_id = p.id
                       -- node-postgres exposes timestamptz as millisecond Date values.
                       AND s.updated_at >= $5::timestamptz
                       AND s.updated_at < ($5::timestamptz + INTERVAL '1 millisecond')
                     RETURNING s.page_id, s.updated_at
                 )
                 UPDATE wiki_pages AS p
                 SET updated_at = updated_snapshot.updated_at
                 FROM updated_snapshot
                 WHERE p.id = updated_snapshot.page_id
                 RETURNING p.updated_at`,
                [input.pageId, input.markdown, renderedHtml, input.actorId, input.expectedUpdatedAt]
            )
            if (!snapshot.rows[0]) {
                const page = await client.query('SELECT id FROM wiki_pages WHERE id = $1 AND deleted_at IS NULL', [
                    input.pageId
                ])
                throw new Error(page.rowCount ? 'snapshot_conflict' : 'page_not_found')
            }
            return toIso(snapshot.rows[0].updated_at)
        })
        return {
            pageId: input.pageId,
            markdown: input.markdown,
            renderedHtml,
            updatedBy: input.actorId,
            updatedAt
        }
    }

    async listSavepoints(pageId: string, limit: number): Promise<WikiSavepointDto[]> {
        const { rows } = await this.pool.query(
            `SELECT id, page_id, markdown, actor_id, created_at
             FROM wiki_revisions
             WHERE page_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT $2`,
            [pageId, limit]
        )
        return rows.map(mapSavepoint)
    }

    async createSavepoint(input: { pageId: string; actorId: string }): Promise<WikiSavepointDto | null> {
        return this.transaction(async (client) => {
            const current = await client.query(
                `SELECT s.markdown, s.rendered_html
                 FROM wiki_pages p
                 JOIN wiki_markdown_snapshots s ON s.page_id = p.id
                 WHERE p.id = $1 AND p.deleted_at IS NULL
                 FOR UPDATE OF p, s`,
                [input.pageId]
            )
            if (!current.rows[0]) throw new Error('page_not_found')
            const latest = await client.query(
                `SELECT markdown FROM wiki_revisions
                 WHERE page_id = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1`,
                [input.pageId]
            )
            if (latest.rows[0]?.markdown === current.rows[0].markdown) return null

            const { rows } = await client.query(
                `INSERT INTO wiki_revisions (page_id, markdown, rendered_html, actor_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, page_id, markdown, actor_id, created_at`,
                [input.pageId, current.rows[0].markdown, current.rows[0].rendered_html, input.actorId]
            )
            return mapSavepoint(rows[0])
        })
    }

    async restoreSavepoint(input: {
        pageId: string
        savepointId: string
        actorId: string
        expectedUpdatedAt: string
    }): Promise<WikiSnapshotDto | null> {
        const target = await this.pool.query(
            `SELECT markdown FROM wiki_revisions WHERE page_id = $1 AND id::text = $2`,
            [input.pageId, input.savepointId]
        )
        if (!target.rows[0]) return null
        const markdown = String(target.rows[0].markdown)
        const renderedHtml = await renderMarkdownToHtml(markdown)

        const updatedAt = await this.transaction(async (client) => {
            const current = await client.query(
                `SELECT s.markdown, s.rendered_html, s.updated_at
                 FROM wiki_pages p
                 JOIN wiki_markdown_snapshots s ON s.page_id = p.id
                 WHERE p.id = $1 AND p.deleted_at IS NULL
                 FOR UPDATE OF p, s`,
                [input.pageId]
            )
            if (!current.rows[0]) throw new Error('page_not_found')
            if (toIso(current.rows[0].updated_at) !== input.expectedUpdatedAt) {
                throw new Error('snapshot_conflict')
            }

            const lockedTarget = await client.query(
                `SELECT 1 FROM wiki_revisions WHERE page_id = $1 AND id::text = $2 FOR SHARE`,
                [input.pageId, input.savepointId]
            )
            if (!lockedTarget.rows[0]) return null

            const latest = await client.query(
                `SELECT markdown FROM wiki_revisions
                 WHERE page_id = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1`,
                [input.pageId]
            )
            if (latest.rows[0]?.markdown !== current.rows[0].markdown) {
                await client.query(
                    `INSERT INTO wiki_revisions (page_id, markdown, rendered_html, actor_id)
                     VALUES ($1, $2, $3, $4)`,
                    [input.pageId, current.rows[0].markdown, current.rows[0].rendered_html, input.actorId]
                )
            }

            const restored = await client.query(
                `UPDATE wiki_markdown_snapshots
                 SET markdown = $2, rendered_html = $3, updated_by = $4, updated_at = NOW()
                 WHERE page_id = $1
                 RETURNING updated_at`,
                [input.pageId, markdown, renderedHtml, input.actorId]
            )
            const documentName = `wiki:${input.pageId}`
            const previous = await client.query(
                'SELECT y_state FROM wiki_doc_states WHERE document_name = $1 FOR UPDATE',
                [documentName]
            )
            const state = await replaceMarkdownYState(previous.rows[0]?.y_state ?? null, markdown)
            await client.query(
                `INSERT INTO wiki_doc_states (document_name, page_id, y_state, stored_at) VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (document_name) DO UPDATE SET y_state = EXCLUDED.y_state, stored_at = NOW()`,
                [documentName, input.pageId, Buffer.from(state)]
            )
            await client.query('UPDATE wiki_pages SET updated_at = NOW() WHERE id = $1', [input.pageId])
            return restored.rows[0] ? toIso(restored.rows[0].updated_at) : null
        })
        if (!updatedAt) return null
        return { pageId: input.pageId, markdown, renderedHtml, updatedBy: input.actorId, updatedAt }
    }

    async getNavigationPreferences(userId: string) {
        const { rows } = await this.pool.query(
            `SELECT categories, root_page_slugs, favorite_slugs, theme, revision
             FROM wiki_navigation_preferences
             WHERE user_id = $1`,
            [userId]
        )
        return rows[0] ? { preferences: mapNavigationPreferences(rows[0]), version: Number(rows[0].revision) } : null
    }

    async saveNavigationPreferences(input: {
        userId: string
        preferences: WikiNavigationPreferencesDto
        expectedVersion: number | null
    }) {
        const values = [
            input.userId,
            JSON.stringify(input.preferences.categories),
            JSON.stringify(input.preferences.rootPageSlugs),
            JSON.stringify(input.preferences.favoriteSlugs),
            input.preferences.theme
        ]
        const { rows } =
            input.expectedVersion === null
                ? await this.pool.query(
                      `INSERT INTO wiki_navigation_preferences
                       (user_id, categories, root_page_slugs, favorite_slugs, theme, revision, updated_at)
                   VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, 1, NOW())
                   ON CONFLICT (user_id) DO NOTHING
                   RETURNING categories, root_page_slugs, favorite_slugs, theme, revision`,
                      values
                  )
                : await this.pool.query(
                      `UPDATE wiki_navigation_preferences
                   SET categories = $2::jsonb,
                       root_page_slugs = $3::jsonb,
                       favorite_slugs = $4::jsonb,
                       theme = $5,
                       revision = revision + 1,
                       updated_at = NOW()
                   WHERE user_id = $1 AND revision = $6
                   RETURNING categories, root_page_slugs, favorite_slugs, theme, revision`,
                      [...values, input.expectedVersion]
                  )
        if (!rows[0]) throw new Error('preferences_conflict')
        return { preferences: mapNavigationPreferences(rows[0]), version: Number(rows[0].revision) }
    }

    async listAdminEmails(): Promise<string[]> {
        const { rows } = await this.pool.query('SELECT email FROM wiki_admin_accounts ORDER BY email ASC')
        return rows.flatMap((row) => (typeof row.email === 'string' ? [row.email] : []))
    }

    async isAdminEmail(email: string): Promise<boolean> {
        const { rowCount } = await this.pool.query('SELECT 1 FROM wiki_admin_accounts WHERE email = $1', [
            requireAdminEmail(email)
        ])
        return (rowCount ?? 0) > 0
    }

    async addAdminEmail(email: string): Promise<void> {
        await this.pool.query('INSERT INTO wiki_admin_accounts (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [
            requireAdminEmail(email)
        ])
    }

    async removeAdminEmail(email: string): Promise<boolean> {
        const { rowCount } = await this.pool.query('DELETE FROM wiki_admin_accounts WHERE email = $1', [
            requireAdminEmail(email)
        ])
        return (rowCount ?? 0) > 0
    }

    async listTrashedPages(): Promise<WikiPageDto[]> {
        const { rows } = await this.pool.query(`
            SELECT id, slug, title, icon, visibility, created_by, created_at, updated_at, deleted_at, deleted_by
            FROM wiki_pages
            WHERE deleted_at IS NOT NULL
            ORDER BY deleted_at DESC
        `)
        return rows.map(mapPage)
    }

    async trashPage(input: { pageId: string; actorId: string }): Promise<WikiPageDto | null> {
        const { rowCount, rows } = await this.pool.query(
            `UPDATE wiki_pages SET deleted_at = NOW(), deleted_by = $2
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING id, slug, title, icon, visibility, created_by, created_at, updated_at, deleted_at, deleted_by`,
            [input.pageId, input.actorId]
        )
        return rowCount ? mapPage(rows[0]) : null
    }

    async trashPages(input: { pageIds: string[]; actorId: string }): Promise<WikiPageDto[]> {
        if (input.pageIds.length === 0) return []
        const { rows } = await this.pool.query(
            `UPDATE wiki_pages SET deleted_at = NOW(), deleted_by = $2
             WHERE id = ANY($1::text[]) AND deleted_at IS NULL
             RETURNING id, slug, title, icon, visibility, created_by, created_at, updated_at, deleted_at, deleted_by`,
            [input.pageIds, input.actorId]
        )
        return rows.map(mapPage)
    }

    async restorePage(pageId: string): Promise<WikiPageDto | null> {
        const { rowCount, rows } = await this.pool.query(
            `UPDATE wiki_pages SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NOT NULL
             RETURNING id, slug, title, icon, visibility, created_by, created_at, updated_at, deleted_at, deleted_by`,
            [pageId]
        )
        return rowCount ? mapPage(rows[0]) : null
    }

    async purgePage(pageId: string): Promise<boolean> {
        const { rowCount } = await this.pool.query('DELETE FROM wiki_pages WHERE id = $1', [pageId])
        return (rowCount ?? 0) > 0
    }

    async purgePages(pageIds: string[]): Promise<number> {
        if (pageIds.length === 0) return 0
        const { rowCount } = await this.pool.query('DELETE FROM wiki_pages WHERE id = ANY($1::text[])', [pageIds])
        return rowCount ?? 0
    }

    async loadYState(documentName: string): Promise<Uint8Array | null> {
        const { rows } = await this.pool.query('SELECT y_state FROM wiki_doc_states WHERE document_name = $1', [
            documentName
        ])
        const value = rows[0]?.y_state
        return value instanceof Buffer ? new Uint8Array(value) : null
    }

    async saveYState(documentName: string, pageId: string, state: Uint8Array): Promise<void> {
        await this.pool.query(
            `INSERT INTO wiki_doc_states (document_name, page_id, y_state, stored_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (document_name)
             DO UPDATE SET y_state = $3, stored_at = NOW()
             WHERE wiki_doc_states.y_state IS DISTINCT FROM EXCLUDED.y_state`,
            [documentName, pageId, Buffer.from(state)]
        )
    }

    async resolvePagePermission(input: { pageId: string; userId: string; roles: string[] }): Promise<PagePermission> {
        if (input.roles.includes('wiki:admin')) return 'admin'
        if (input.roles.includes('wiki:writer')) return 'write'

        const { rows } = await this.pool.query(
            `SELECT access FROM wiki_permissions
             WHERE page_id = $1
               AND ((subject_type = 'user' AND subject_id = $2)
                 OR (subject_type = 'role' AND subject_id = ANY($3::text[])))`,
            [input.pageId, input.userId, input.roles]
        )
        return rows.reduce<PagePermission>((strongest, row) => strongestPermission(strongest, row.access), 'none')
    }

    async resolvePagePermissions(input: {
        pageIds: string[]
        userId: string
        roles: string[]
    }): Promise<Map<string, PagePermission>> {
        const globalPermission: PagePermission | null = input.roles.includes('wiki:admin')
            ? 'admin'
            : input.roles.includes('wiki:writer')
              ? 'write'
              : null
        if (globalPermission) {
            return new Map(input.pageIds.map((pageId) => [pageId, globalPermission]))
        }
        if (input.pageIds.length === 0) return new Map()

        const { rows } = await this.pool.query(
            `SELECT page_id, access FROM wiki_permissions
             WHERE page_id = ANY($1::text[])
               AND ((subject_type = 'user' AND subject_id = $2)
                 OR (subject_type = 'role' AND subject_id = ANY($3::text[])))`,
            [input.pageIds, input.userId, input.roles]
        )
        const permissions = new Map<string, PagePermission>()
        for (const row of rows) {
            const pageId = String(row.page_id)
            permissions.set(pageId, strongestPermission(permissions.get(pageId) ?? 'none', row.access))
        }
        return permissions
    }

    async close(): Promise<void> {
        await this.pool.end()
    }

    private async getPage(predicate: string, value: string): Promise<WikiPageDetailDto | null> {
        const { rows } = await this.pool.query(
            `SELECT p.id, p.slug, p.title, p.icon, p.visibility, p.created_by, p.created_at,
                    p.updated_at, p.deleted_at, p.deleted_by,
                    COALESCE(s.markdown, '') AS markdown,
                    COALESCE(s.rendered_html, '') AS rendered_html,
                    COALESCE(s.updated_by, p.created_by) AS updated_by,
                    COALESCE(s.updated_at, p.updated_at) AS snapshot_updated_at
             FROM wiki_pages p
             LEFT JOIN wiki_markdown_snapshots s ON s.page_id = p.id
             WHERE ${predicate} AND p.deleted_at IS NULL`,
            [value]
        )
        return rows[0] ? mapPageDetail(rows[0]) : null
    }

    private async transaction<T>(operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
        const client = await this.pool.connect()
        try {
            await client.query('BEGIN')
            const result = await operation(client)
            await client.query('COMMIT')
            return result
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }
    }
}

export function createPostgresRepositories(databaseUrl: string): WikiRepositories {
    const repository = new PostgresWikiRepository(databaseUrl)
    return {
        pages: repository,
        permissions: repository,
        adminAccounts: repository,
        collaboration: repository,
        navigation: repository,
        mode: 'postgres',
        close: () => repository.close()
    }
}

function requireAdminEmail(email: string): string {
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('invalid_admin_email')
    return normalizedEmail
}

function mapPage(row: Record<string, unknown>): WikiPageDto {
    return {
        id: String(row.id),
        slug: String(row.slug),
        title: String(row.title),
        icon: normalizePageIcon(row.icon),
        visibility: row.visibility === 'private' ? 'private' : 'public',
        createdBy: String(row.created_by),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
        deletedBy: typeof row.deleted_by === 'string' ? row.deleted_by : null
    }
}

function mapPageDetail(row: Record<string, unknown>): WikiPageDetailDto {
    return {
        ...mapPage(row),
        markdown: String(row.markdown ?? ''),
        renderedHtml: String(row.rendered_html ?? ''),
        updatedBy: String(row.updated_by),
        snapshotUpdatedAt: toIso(row.snapshot_updated_at)
    }
}

function mapSavepoint(row: Record<string, unknown>): WikiSavepointDto {
    return {
        id: String(row.id),
        pageId: String(row.page_id),
        createdBy: String(row.actor_id),
        createdAt: toIso(row.created_at),
        markdown: String(row.markdown ?? '')
    }
}

function mapNavigationPreferences(row: Record<string, unknown>): WikiNavigationPreferencesDto {
    const categories = Array.isArray(row.categories)
        ? row.categories.flatMap((entry): WikiNavigationPreferencesDto['categories'] => {
              if (!entry || typeof entry !== 'object') return []
              const category = entry as Record<string, unknown>
              if (
                  typeof category.id !== 'string' ||
                  typeof category.title !== 'string' ||
                  typeof category.icon !== 'string'
              ) {
                  return []
              }
              return [
                  {
                      id: category.id,
                      title: category.title,
                      icon: category.icon,
                      ...(typeof category.documentSlug === 'string' ? { documentSlug: category.documentSlug } : {}),
                      pageSlugs: asStringArray(category.pageSlugs),
                      collapsed: category.collapsed === true
                  }
              ]
          })
        : []
    return {
        categories,
        rootPageSlugs: asStringArray(row.root_page_slugs),
        favoriteSlugs: asStringArray(row.favorite_slugs),
        theme: row.theme === 'light' ? 'light' : 'dark'
    }
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString()
    return String(value)
}
