export type ColorAttrs = {
    fg?: string
    bg?: string
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const COLOR_DIRECTIVE_PATTERN = /:color\[([^\]]+)]\{([^}]*)}/g
const COLOR_SPAN_PATTERN = /<span\b([^>]*)>(.*?)<\/span>/gis

export function normalizeColor(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }

    const trimmed = value.trim()
    if (!HEX_COLOR_PATTERN.test(trimmed)) {
        return undefined
    }

    return trimmed.toLowerCase()
}

export function parseColorAttrs(rawAttrs: string): ColorAttrs {
    const attrs: ColorAttrs = {}
    const attrPattern = /\b(fg|bg)\s*=\s*["']([^"']+)["']/g
    let match: RegExpExecArray | null

    while ((match = attrPattern.exec(rawAttrs)) !== null) {
        const color = normalizeColor(match[2])
        if (!color) {
            continue
        }

        if (match[1] === 'fg') {
            attrs.fg = color
        }

        if (match[1] === 'bg') {
            attrs.bg = color
        }
    }

    return attrs
}

export function colorAttrsToStyle(attrs: ColorAttrs): string {
    const declarations: string[] = []

    if (attrs.fg) {
        declarations.push(`color: ${attrs.fg}`)
    }

    if (attrs.bg) {
        declarations.push(`background-color: ${attrs.bg}`)
    }

    return declarations.join('; ')
}

export function colorAttrsToDirective(attrs: ColorAttrs): string {
    const parts: string[] = []

    if (attrs.fg) {
        parts.push(`fg="${attrs.fg}"`)
    }

    if (attrs.bg) {
        parts.push(`bg="${attrs.bg}"`)
    }

    return parts.join(' ')
}

export function encodeColorDirectives(markdown: string): string {
    return markdown.replace(COLOR_DIRECTIVE_PATTERN, (_match, text: string, rawAttrs: string) => {
        const attrs = parseColorAttrs(rawAttrs)
        const style = colorAttrsToStyle(attrs)

        if (!style) {
            return escapeHtml(text)
        }

        return `<span data-wiki-color="true" style="${escapeHtmlAttribute(style)}">${escapeHtml(text)}</span>`
    })
}

export function decodeColorHtml(markdown: string): string {
    return markdown.replace(COLOR_SPAN_PATTERN, (match, rawAttrs: string, text: string) => {
        if (!/\bdata-wiki-color=["']true["']/.test(rawAttrs) && !/\bstyle=/.test(rawAttrs)) {
            return match
        }

        const attrs = parseStyleAttrs(rawAttrs)
        const directiveAttrs = colorAttrsToDirective(attrs)

        if (!directiveAttrs) {
            return stripHtml(text)
        }

        return `:color[${stripHtml(text)}]{${directiveAttrs}}`
    })
}

function parseStyleAttrs(rawAttrs: string): ColorAttrs {
    const styleMatch = /\bstyle\s*=\s*["']([^"']+)["']/i.exec(rawAttrs)
    const style = styleMatch?.[1] ?? ''
    const attrs: ColorAttrs = {}

    for (const declaration of style.split(';')) {
        const [rawName, rawValue] = declaration.split(':')
        const name = rawName?.trim().toLowerCase()
        const color = normalizeColor(rawValue)

        if (!color) {
            continue
        }

        if (name === 'color') {
            attrs.fg = color
        }

        if (name === 'background-color') {
            attrs.bg = color
        }
    }

    return attrs
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function escapeHtmlAttribute(value: string): string {
    return escapeHtml(value).replace(/`/g, '&#96;')
}

function stripHtml(value: string): string {
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
}
