export type QuoteTone = 'info' | 'warning' | 'error' | 'correct' | 'blue'

export type QuoteBlockAttrs = {
    tone: QuoteTone
    color: string
    emoji: string
}

type QuoteBlockInputAttrs = {
    tone?: unknown
    color?: unknown
    emoji?: unknown
}

export const QUOTE_BLOCK_MARKDOWN_NAME = 'wiki-quote'
export const QUOTE_BLOCK_DEFAULT_TONE: QuoteTone = 'info'
export const QUOTE_BLOCK_DEFAULT_EMOJI = ''

const QUOTE_TONES = new Set<QuoteTone>(['info', 'warning', 'error', 'correct', 'blue'])
const QUOTE_ATTR_PATTERN = /\b(tone|color|emoji)\s*=\s*["']([^"']*)["']/g

export function normalizeQuoteTone(value: unknown): QuoteTone {
    return typeof value === 'string' && QUOTE_TONES.has(value as QuoteTone)
        ? (value as QuoteTone)
        : QUOTE_BLOCK_DEFAULT_TONE
}

export function normalizeQuoteColor(value: unknown): string {
    if (typeof value !== 'string') return ''
    const color = value.trim().toLowerCase()
    return /^#[0-9a-f]{6}$/.test(color) ? color : ''
}

export function normalizeQuoteEmoji(value: unknown): string {
    if (typeof value !== 'string') return QUOTE_BLOCK_DEFAULT_EMOJI

    return Array.from(value.replace(/[\r\n]/g, '').trim())
        .slice(0, 16)
        .join('')
}

export function parseQuoteBlockMarkdownAttrs(rawAttrs: string): QuoteBlockAttrs {
    const attrs: QuoteBlockInputAttrs = {}
    let match: RegExpExecArray | null

    while ((match = QUOTE_ATTR_PATTERN.exec(rawAttrs)) !== null) {
        if (match[1] === 'tone') {
            attrs.tone = match[2]
        }

        if (match[1] === 'color') {
            if (QUOTE_TONES.has(match[2] as QuoteTone)) attrs.tone = match[2]
            else attrs.color = match[2]
        }

        if (match[1] === 'emoji') {
            attrs.emoji = match[2]
        }
    }

    return normalizeQuoteBlockAttrs(attrs)
}

export function normalizeQuoteBlockAttrs(attrs: QuoteBlockInputAttrs): QuoteBlockAttrs {
    const legacyTone =
        typeof attrs.color === 'string' && QUOTE_TONES.has(attrs.color as QuoteTone) ? attrs.color : undefined

    return {
        tone: normalizeQuoteTone(attrs.tone ?? legacyTone),
        color: legacyTone ? '' : normalizeQuoteColor(attrs.color),
        emoji: normalizeQuoteEmoji(attrs.emoji)
    }
}

export function serializeQuoteBlockMarkdownAttrs(attrs: QuoteBlockInputAttrs): string {
    const normalized = normalizeQuoteBlockAttrs(attrs)
    const parts: string[] = []

    if (normalized.tone !== QUOTE_BLOCK_DEFAULT_TONE) {
        parts.push(`tone="${normalized.tone}"`)
    }

    if (normalized.color) {
        parts.push('color="' + normalized.color + '"')
    }

    if (normalized.emoji) {
        parts.push(`emoji="${normalized.emoji}"`)
    }

    return parts.join(' ')
}

export function getQuoteBlockHtmlAttrs(attrs: QuoteBlockInputAttrs) {
    const normalized = normalizeQuoteBlockAttrs(attrs)

    return {
        className: ['wiki-quote', `wiki-quote-${normalized.tone}`],
        dataWikiQuote: 'true',
        dataQuoteTone: normalized.tone,
        dataQuoteColor: normalized.color || undefined,
        style: normalized.color ? '--wiki-quote-color: ' + normalized.color : undefined,
        dataQuoteEmoji: normalized.emoji || undefined
    }
}
