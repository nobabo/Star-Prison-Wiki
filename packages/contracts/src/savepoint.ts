export type WikiSavepointDto = {
    id: string
    pageId: string
    createdBy: string
    createdAt: string
    markdown?: string
}

export type WikiSavepointListResponse = {
    savepoints: WikiSavepointDto[]
}

export type CreateWikiSavepointResponse = {
    savepoint: WikiSavepointDto | null
}

export type RestoreWikiSavepointRequest = {
    baseSnapshotUpdatedAt: string
}
