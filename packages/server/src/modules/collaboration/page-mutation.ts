export type PageMutation = <T>(pageId: string, operation: () => Promise<T>) => Promise<T>
export const directPageMutation: PageMutation = (_pageId, operation) => operation()

export function mutateManyPages<T>(mutate: PageMutation, pageIds: string[], operation: () => Promise<T>): Promise<T> {
    return [...new Set(pageIds)]
        .sort()
        .reduceRight<() => Promise<T>>((next, pageId) => () => mutate(pageId, next), operation)()
}
