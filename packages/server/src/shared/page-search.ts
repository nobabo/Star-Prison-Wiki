import type { WikiPageDetailDto, WikiPageSearchResultDto, WikiSearchMatch } from '@coconut-studio/wiki-contracts'

export type PageSearchInput = { query: string; userId: string | null; roles: string[]; limit: number }

export const normalizeSearchText = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ko')

export function searchPageDetails(pages: WikiPageDetailDto[], input: PageSearchInput): WikiPageSearchResultDto[] {
    const query = normalizeSearchText(input.query).trim()
    const keywords = [...new Set(query.split(/\s+/u).filter(Boolean))]
    const results: WikiPageSearchResultDto[] = []
    for (const page of pages) {
        const title = normalizeSearchText(page.title)
        const content = normalizeSearchText(page.markdown)
        let match: WikiSearchMatch | null = null
        if (title === query) match = 'title-exact'
        else if (title.includes(query)) match = 'title-contains'
        else {
            let start = content.indexOf(query)
            while (start >= 0) {
                const end = start + query.length
                if (!/[\p{L}\p{N}]/u.test(content[start - 1] ?? '') && !/[\p{L}\p{N}]/u.test(content[end] ?? '')) {
                    match = 'content-exact'
                    break
                }
                start = content.indexOf(query, start + 1)
            }
            if (!match && keywords.every((keyword) => content.includes(keyword))) match = 'content-contains'
        }
        if (!match) continue
        const { markdown: _markdown, renderedHtml: _html, updatedBy: _by, snapshotUpdatedAt: _at, ...dto } = page
        results.push({ page: dto, match })
    }
    const ranks = ['title-exact', 'title-contains', 'content-exact', 'content-contains']
    return results
        .sort(
            (a, b) => ranks.indexOf(a.match) - ranks.indexOf(b.match) || a.page.title.localeCompare(b.page.title, 'ko')
        )
        .slice(0, input.limit)
}
