import { Link2, MapPinned, Table2 } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EditorContextMenus } from './EditorContextMenus'

describe('EditorContextMenus', () => {
    it('shows only table actions for a table context menu', () => {
        const html = renderToStaticMarkup(
            <EditorContextMenus
                menu={{ kind: 'table', x: 20, y: 30, maxHeight: 400 }}
                submenu={null}
                blockValue="paragraph"
                inlineActions={[]}
                blockActions={[]}
                extraActions={[]}
                tableActions={[
                    {
                        id: 'delete-table',
                        label: '표 삭제',
                        Icon: Table2,
                        run: () => undefined
                    }
                ]}
                pages={[]}
                categories={[]}
                highlightActive={false}
                tableActive
                codeBlockActive={false}
                codeLanguage={null}
                quoteTone="info"
                quoteColor=""
                highlightWidth="100%"
                highlightShape="rectangle"
                highlightBackgroundColor=""
                tableHeaderBackground=""
                onSetBlockStyle={() => undefined}
                onToggleSubmenu={() => undefined}
                onSetTextColor={() => undefined}
                onUnsetTextColor={() => undefined}
                onSetBackgroundColor={() => undefined}
                onUnsetBackgroundColor={() => undefined}
                onInsertHighlight={() => undefined}
                onSetHighlightWidth={() => undefined}
                onSetHighlightShape={() => undefined}
                onSetHighlightBackgroundColor={() => undefined}
                onUnsetHighlightBackgroundColor={() => undefined}
                onSetTableHeaderBackground={() => undefined}
                onUnsetTableHeaderBackground={() => undefined}
                onSetCodeLanguage={() => undefined}
                onSetQuoteTone={() => undefined}
                onSetQuoteColor={() => undefined}
                onInsertEmoji={() => undefined}
                onRunExtraAction={() => undefined}
                onSelectPageLink={() => undefined}
                onSelectCategoryLink={() => undefined}
            />
        )

        expect(html).toContain('aria-label="표 편집"')
        expect(html).toContain('표 삭제')
        expect(html).not.toContain('Markdown 서식 메뉴')
        expect(html).not.toContain('본문')
    })

    it('shows quote color controls and an emoji picker for a quote context menu', () => {
        const html = renderToStaticMarkup(
            <EditorContextMenus
                menu={{ kind: 'quote', x: 20, y: 30, maxHeight: 400 }}
                submenu={null}
                blockValue="paragraph"
                inlineActions={[]}
                blockActions={[]}
                extraActions={[]}
                tableActions={[]}
                pages={[]}
                categories={[]}
                highlightActive={false}
                tableActive={false}
                codeBlockActive={false}
                codeLanguage={null}
                quoteTone="warning"
                quoteColor=""
                highlightWidth="100%"
                highlightShape="rectangle"
                highlightBackgroundColor=""
                tableHeaderBackground=""
                onSetBlockStyle={() => undefined}
                onToggleSubmenu={() => undefined}
                onSetTextColor={() => undefined}
                onUnsetTextColor={() => undefined}
                onSetBackgroundColor={() => undefined}
                onUnsetBackgroundColor={() => undefined}
                onInsertHighlight={() => undefined}
                onSetHighlightWidth={() => undefined}
                onSetHighlightShape={() => undefined}
                onSetHighlightBackgroundColor={() => undefined}
                onUnsetHighlightBackgroundColor={() => undefined}
                onSetTableHeaderBackground={() => undefined}
                onUnsetTableHeaderBackground={() => undefined}
                onSetCodeLanguage={() => undefined}
                onSetQuoteTone={() => undefined}
                onSetQuoteColor={() => undefined}
                onInsertEmoji={() => undefined}
                onRunExtraAction={() => undefined}
                onSelectPageLink={() => undefined}
                onSelectCategoryLink={() => undefined}
            />
        )

        expect(html).toContain('aria-label="인용문 설정"')
        expect(html).toContain('인용문 색상')
        expect(html).toContain('인용문 이모지')
        expect(html).not.toContain('Markdown 서식 메뉴')
        expect(html).toContain('이모지 불러오는 중')
        expect(html).not.toContain('본문')
    })

    it('splits wiki links from hyperlinks and lists documents and categories', () => {
        const html = renderToStaticMarkup(
            <EditorContextMenus
                menu={{ kind: 'editor', x: 20, y: 30, maxHeight: 400 }}
                submenu={{ kind: 'page-link', x: 340, y: 30, maxHeight: 400 }}
                blockValue="paragraph"
                inlineActions={[
                    {
                        id: 'wiki-link',
                        label: '일반 링크',
                        Icon: MapPinned,
                        run: () => undefined,
                        submenu: 'page-link'
                    },
                    { id: 'hyperlink', label: '하이퍼 링크', Icon: Link2, run: () => undefined }
                ]}
                blockActions={[]}
                extraActions={[]}
                tableActions={[]}
                pages={[
                    {
                        id: 'page-1',
                        slug: 'guide',
                        title: '이용 안내',
                        icon: '📘',
                        visibility: 'public',
                        createdBy: 'test',
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                        deletedAt: null,
                        deletedBy: null
                    }
                ]}
                categories={[{ id: 'category-1', title: '설정집', icon: '🗂️', documentSlug: 'category-settings' }]}
                highlightActive={false}
                tableActive={false}
                codeBlockActive={false}
                codeLanguage={null}
                quoteTone="info"
                quoteColor=""
                highlightWidth="100%"
                highlightShape="rectangle"
                highlightBackgroundColor=""
                tableHeaderBackground=""
                onSetBlockStyle={() => undefined}
                onToggleSubmenu={() => undefined}
                onSetTextColor={() => undefined}
                onUnsetTextColor={() => undefined}
                onSetBackgroundColor={() => undefined}
                onUnsetBackgroundColor={() => undefined}
                onInsertHighlight={() => undefined}
                onSetHighlightWidth={() => undefined}
                onSetHighlightShape={() => undefined}
                onSetHighlightBackgroundColor={() => undefined}
                onUnsetHighlightBackgroundColor={() => undefined}
                onSetTableHeaderBackground={() => undefined}
                onUnsetTableHeaderBackground={() => undefined}
                onSetCodeLanguage={() => undefined}
                onSetQuoteTone={() => undefined}
                onSetQuoteColor={() => undefined}
                onInsertEmoji={() => undefined}
                onRunExtraAction={() => undefined}
                onSelectPageLink={() => undefined}
                onSelectCategoryLink={() => undefined}
            />
        )

        expect(html).toContain('aria-label="일반 링크"')
        expect(html).toContain('aria-label="하이퍼 링크"')
        expect(html).toContain('aria-label="일반 링크 선택"')
        expect(html).toContain('aria-label="문서"')
        expect(html).toContain('이용 안내')
        expect(html).toContain('aria-label="카테고리"')
        expect(html).toContain('설정집')
    })
})
