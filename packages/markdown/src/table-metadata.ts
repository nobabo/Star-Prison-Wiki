export type WikiTableMetadata = {
    headerBackground: string
    widths: number[]
}

const TABLE_METADATA_PATTERN = /^<!--\s*wiki-table\s+headerBackground="([^"]*)"\s+widths="([^"]*)"\s*-->$/i

export function normalizeTableHeaderBackground(value: unknown): string {
    if (typeof value !== 'string') return ''
    const trimmed = value.trim()
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : ''
}

export function normalizeTableWidths(value: unknown): number[] {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
    return values.map((entry) => {
        const width = Number(entry)
        return Number.isFinite(width) && width >= 40 && width <= 2400 ? Math.round(width) : 0
    })
}

export function serializeWikiTableMetadata(metadata: WikiTableMetadata): string {
    const headerBackground = normalizeTableHeaderBackground(metadata.headerBackground)
    const widths = normalizeTableWidths(metadata.widths).join(',')
    return `<!-- wiki-table headerBackground="${headerBackground}" widths="${widths}" -->`
}

export function parseWikiTableMetadata(value: unknown): WikiTableMetadata | null {
    if (typeof value !== 'string') return null
    const match = TABLE_METADATA_PATTERN.exec(value.trim())
    if (!match) return null
    return {
        headerBackground: normalizeTableHeaderBackground(match[1]),
        widths: normalizeTableWidths(match[2])
    }
}
