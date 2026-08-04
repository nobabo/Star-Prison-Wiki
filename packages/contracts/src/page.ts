export type WikiVisibility = 'public' | 'private'
export type PagePermission = 'none' | 'read' | 'write' | 'admin'

export type WikiPageDto = {
    id: string
    slug: string
    title: string
    icon: string | null
    visibility: WikiVisibility
    createdBy: string
    createdAt: string
    updatedAt: string
    deletedAt: string | null
    deletedBy: string | null
}

export type WikiSnapshotDto = {
    pageId: string
    markdown: string
    renderedHtml: string
    updatedBy: string
    updatedAt: string
}

export type WikiPageDetailDto = WikiPageDto & {
    markdown: string
    renderedHtml: string
    updatedBy: string
    snapshotUpdatedAt: string
}

export type WikiPageAccessDto = {
    read: boolean
    write: boolean
}

export type WikiPageResponse = {
    page: WikiPageDetailDto
    permissions: WikiPageAccessDto
}

export type WikiPageListResponse = {
    pages: WikiPageDto[]
}

export type CreateWikiPageRequest = {
    title: string
    icon?: string | null
    slug: string
    visibility: WikiVisibility
    markdown: string
}

export type UpdateWikiPageMetaRequest = Omit<CreateWikiPageRequest, 'markdown'>

export type SaveWikiSnapshotRequest = {
    markdown: string
}
