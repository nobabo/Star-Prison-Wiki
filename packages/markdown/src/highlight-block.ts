export type HighlightBlockVariant = 'lead' | 'hero' | 'panel' | 'strip'
export type HighlightBlockShape = 'rectangle' | 'diamond'

export type HighlightBlockAttrs = {
    width: string
    height: string
    variant: HighlightBlockVariant
    attached: boolean
    rowStart: boolean
    shape: HighlightBlockShape
    backgroundColor: string
}

type HighlightBlockInputAttrs = {
    width?: unknown
    height?: unknown
    variant?: unknown
    attached?: unknown
    rowStart?: unknown
    shape?: unknown
    backgroundColor?: unknown
}

export const HIGHLIGHT_BLOCK_MARKDOWN_NAME = 'wiki-highlight'
export const HIGHLIGHT_BLOCK_DEFAULT_WIDTH = '100%'
export const HIGHLIGHT_BLOCK_DEFAULT_HEIGHT = ''
export const HIGHLIGHT_BLOCK_DEFAULT_VARIANT: HighlightBlockVariant = 'panel'
export const HIGHLIGHT_BLOCK_DEFAULT_ATTACHED = false
export const HIGHLIGHT_BLOCK_DEFAULT_ROW_START = false
export const HIGHLIGHT_BLOCK_DEFAULT_SHAPE: HighlightBlockShape = 'diamond'
export const HIGHLIGHT_BLOCK_MIN_PERCENT = 25
export const HIGHLIGHT_BLOCK_MAX_PERCENT = 100
export const HIGHLIGHT_BLOCK_SNAP_TOLERANCE = 2.5
export const HIGHLIGHT_BLOCK_SNAP_POINTS = [100, 75, 66.6667, 50, 33.3333, 25] as const

const HIGHLIGHT_VARIANTS = new Set<HighlightBlockVariant>(['lead', 'hero', 'panel', 'strip'])
const HIGHLIGHT_SHAPES = new Set<HighlightBlockShape>(['rectangle', 'diamond'])
const WIDTH_ATTR_PATTERN = /\b(width|height|variant|attached|rowStart|shape|backgroundColor)\s*=\s*["']([^"']+)["']/g

export function normalizeHighlightBlockWidth(value: unknown): string {
    if (typeof value !== 'string') {
        return HIGHLIGHT_BLOCK_DEFAULT_WIDTH
    }

    const trimmed = value.trim()
    const match = /^(\d+(?:\.\d+)?)%$/.exec(trimmed)

    if (!match) {
        return HIGHLIGHT_BLOCK_DEFAULT_WIDTH
    }

    return formatHighlightBlockWidth(clampHighlightBlockPercent(Number(match[1])))
}

export function normalizeHighlightBlockHeight(value: unknown): string {
    if (typeof value !== 'string') return HIGHLIGHT_BLOCK_DEFAULT_HEIGHT

    const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
    if (!match) return HIGHLIGHT_BLOCK_DEFAULT_HEIGHT

    const pixels = Math.max(132, Math.min(1200, Number(match[1])))
    return Number(pixels.toFixed(1)) + 'px'
}

export function normalizeHighlightBlockVariant(value: unknown): HighlightBlockVariant {
    return typeof value === 'string' && HIGHLIGHT_VARIANTS.has(value as HighlightBlockVariant)
        ? (value as HighlightBlockVariant)
        : HIGHLIGHT_BLOCK_DEFAULT_VARIANT
}

export function normalizeHighlightBlockAttached(value: unknown): boolean {
    return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true')
}

export function normalizeHighlightBlockRowStart(value: unknown): boolean {
    return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true')
}

export function normalizeHighlightBlockShape(value: unknown): HighlightBlockShape {
    return typeof value === 'string' && HIGHLIGHT_SHAPES.has(value as HighlightBlockShape)
        ? (value as HighlightBlockShape)
        : HIGHLIGHT_BLOCK_DEFAULT_SHAPE
}

export function normalizeHighlightBlockBackgroundColor(value: unknown): string {
    if (typeof value !== 'string') return ''
    const trimmed = value.trim()
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : ''
}

export function parseHighlightBlockWidthPercent(value: unknown): number {
    const width = normalizeHighlightBlockWidth(value)
    return Number(width.replace('%', ''))
}

export function clampHighlightBlockPercent(value: number): number {
    if (!Number.isFinite(value)) {
        return HIGHLIGHT_BLOCK_MAX_PERCENT
    }

    return Math.min(HIGHLIGHT_BLOCK_MAX_PERCENT, Math.max(HIGHLIGHT_BLOCK_MIN_PERCENT, value))
}

export function snapHighlightBlockPercent(value: number): number {
    const clamped = clampHighlightBlockPercent(value)
    const snapPoint = HIGHLIGHT_BLOCK_SNAP_POINTS.find(
        (point) => Math.abs(point - clamped) <= HIGHLIGHT_BLOCK_SNAP_TOLERANCE
    )

    return snapPoint ?? clamped
}

export function formatHighlightBlockWidth(value: number): string {
    const clamped = clampHighlightBlockPercent(value)
    return `${Number(clamped.toFixed(4))}%`
}

export function parseHighlightBlockMarkdownAttrs(rawAttrs: string): HighlightBlockAttrs {
    const attrs: HighlightBlockInputAttrs = {}
    let match: RegExpExecArray | null

    while ((match = WIDTH_ATTR_PATTERN.exec(rawAttrs)) !== null) {
        if (match[1] === 'width') {
            attrs.width = normalizeHighlightBlockWidth(match[2])
        }

        if (match[1] === 'height') {
            attrs.height = normalizeHighlightBlockHeight(match[2])
        }

        if (match[1] === 'variant') {
            attrs.variant = normalizeHighlightBlockVariant(match[2])
        }

        if (match[1] === 'attached') {
            attrs.attached = normalizeHighlightBlockAttached(match[2])
        }

        if (match[1] === 'rowStart') {
            attrs.rowStart = normalizeHighlightBlockRowStart(match[2])
        }

        if (match[1] === 'shape') {
            attrs.shape = normalizeHighlightBlockShape(match[2])
        }

        if (match[1] === 'backgroundColor') {
            attrs.backgroundColor = normalizeHighlightBlockBackgroundColor(match[2])
        }
    }

    return normalizeHighlightBlockAttrs(attrs)
}

export function normalizeHighlightBlockAttrs(attrs: HighlightBlockInputAttrs): HighlightBlockAttrs {
    return {
        width: normalizeHighlightBlockWidth(attrs.width),
        height: normalizeHighlightBlockHeight(attrs.height),
        variant: normalizeHighlightBlockVariant(attrs.variant),
        attached: normalizeHighlightBlockAttached(attrs.attached),
        rowStart: normalizeHighlightBlockRowStart(attrs.rowStart),
        shape: normalizeHighlightBlockShape(attrs.shape),
        backgroundColor: normalizeHighlightBlockBackgroundColor(attrs.backgroundColor)
    }
}

export function serializeHighlightBlockMarkdownAttrs(attrs: HighlightBlockInputAttrs): string {
    const normalized = normalizeHighlightBlockAttrs(attrs)
    const heightAttribute = normalized.height ? ` height="${normalized.height}"` : ''
    const backgroundAttribute = normalized.backgroundColor ? ` backgroundColor="${normalized.backgroundColor}"` : ''
    return `width="${normalized.width}"${heightAttribute} variant="${normalized.variant}" attached="${normalized.attached}" rowStart="${normalized.rowStart}" shape="${normalized.shape}"${backgroundAttribute}`
}

export function getHighlightBlockHtmlAttrs(attrs: HighlightBlockInputAttrs) {
    const normalized = normalizeHighlightBlockAttrs(attrs)

    return {
        className: ['wiki-highlight-block', `wiki-highlight-block-${normalized.variant}`],
        dataWikiHighlightBlock: 'true',
        dataWidth: normalized.width,
        dataHeight: normalized.height || undefined,
        dataVariant: normalized.variant,
        dataAttached: String(normalized.attached),
        dataRowStart: String(normalized.rowStart),
        dataShape: normalized.shape,
        dataBackgroundColor: normalized.backgroundColor || undefined,
        style: `width: ${normalized.width}${normalized.height ? `; height: ${normalized.height}` : ''}${normalized.backgroundColor ? `; --wiki-card-color: ${normalized.backgroundColor}` : ''}`
    }
}
