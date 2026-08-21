import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EditorHeader } from './EditorHeader'
import { EditorTopBar } from './EditorTopBar'

const page = {
    id: 'welcome',
    slug: 'welcome',
    title: '별도소 공식 위키',
    icon: '🔒',
    visibility: 'public' as const,
    createdBy: 'dev-admin',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    deletedAt: null,
    deletedBy: null
}

describe('read-only wiki document chrome', () => {
    it('keeps the editor title presentation while locking its controls', () => {
        const html = renderToStaticMarkup(
            <EditorHeader
                editable={false}
                title={page.title}
                icon={page.icon}
                showIconPicker
                onTitleChange={() => undefined}
                onToggleIconPicker={() => undefined}
                onSelectIcon={() => undefined}
                onSelectEmoji={() => undefined}
            />
        )

        expect(html).toContain('readOnly')
        expect(html).toContain('aria-disabled="true"')
        expect(html).not.toContain('editor-icon-popover')
    })

    it('shows edit mode chrome only when the document is editable', () => {
        const readOnlyHtml = renderToStaticMarkup(
            <EditorTopBar client={{ token: '' }} editable={false} pages={[page]} currentSlug="welcome" />
        )
        const editableHtml = renderToStaticMarkup(
            <EditorTopBar client={{ token: '' }} editable pages={[page]} currentSlug="welcome" />
        )

        expect(readOnlyHtml).not.toContain('편집 모드')
        expect(editableHtml).toContain('편집 모드')
        expect(readOnlyHtml).toContain('검색하기')
        expect(readOnlyHtml).toContain('editor-topbar--readonly')
        expect(editableHtml).not.toContain('editor-topbar--readonly')
    })
    it('places active collaborator profiles directly before edit mode', () => {
        const html = renderToStaticMarkup(
            <EditorTopBar
                client={{ token: '' }}
                editable
                pages={[page]}
                currentSlug="welcome"
                collaborators={[
                    {
                        clientId: 7,
                        userId: 'editor@example.com',
                        name: '김별',
                        picture: 'https://example.com/profile.jpg',
                        color: '#3f8cff',
                        cursor: null,
                        local: true
                    }
                ]}
            />
        )

        expect(html).toContain('현재 공동 편집자: 김별')
        expect(html).toContain('https://example.com/profile.jpg')
        expect(html.indexOf('editor-collaborator-stack')).toBeLessThan(html.indexOf('editor-topbar-mode'))
    })
})
