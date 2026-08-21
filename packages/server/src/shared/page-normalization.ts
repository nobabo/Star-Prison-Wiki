export function normalizePageIcon(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const icon = firstGrapheme(value.trim())
    return icon || null
}

function firstGrapheme(value: string): string {
    if (!value) return ''
    return (
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)[Symbol.iterator]().next().value
            ?.segment ?? ''
    )
}
