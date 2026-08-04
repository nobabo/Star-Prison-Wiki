export function normalizePageIcon(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const icon = Array.from(value.trim()).slice(0, 2).join('')
    return icon || null
}
