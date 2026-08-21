export type WikiImageMetadata = {
    width: number
    height: number
}

const IMAGE_METADATA_PATTERN = /^<!--\s*wiki-image\s+width="([^"]*)"\s+height="([^"]*)"\s*-->$/i

export function normalizeImageDimension(value: unknown): number {
    const dimension = Number(value)
    return Number.isFinite(dimension) && dimension >= 40 && dimension <= 4096 ? Math.round(dimension) : 0
}

export function serializeWikiImageMetadata(metadata: WikiImageMetadata): string {
    const width = normalizeImageDimension(metadata.width)
    const height = normalizeImageDimension(metadata.height)
    return `<!-- wiki-image width="${width}" height="${height}" -->`
}

export function parseWikiImageMetadata(value: unknown): WikiImageMetadata | null {
    if (typeof value !== 'string') return null
    const match = IMAGE_METADATA_PATTERN.exec(value.trim())
    if (!match) return null
    const width = normalizeImageDimension(match[1])
    const height = normalizeImageDimension(match[2])
    return width && height ? { width, height } : null
}
