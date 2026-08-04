export type WikiBrandConfig = {
    productName: string
    brandLabel: string
    logoUrl: string
    logoAlt: string
    defaultSlug: string
    apiBasePath?: string
    collaborationUrl(pageId: string): string
}
