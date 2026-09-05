import { useEffect, useState } from 'react'
import type { WikiPageDetailDto, WikiPageDto } from '@coconut-studio/wiki-contracts'
import { fetchPageBySlug, type ApiClient } from '../../../shared/api/wiki-api'
import { EditorTopBar } from '../../editor/components/EditorTopBar'
import { EditorHeader } from '../../editor/components/EditorHeader'

export function ReadOnlyPage({
    page,
    pages,
    client,
    pageHrefForSlug
}: {
    page: WikiPageDetailDto
    pages: WikiPageDto[]
    client: ApiClient
    pageHrefForSlug?: (slug: string) => string
}) {
    const [current, setCurrent] = useState<WikiPageDetailDto | null>(page)
    const [failed, setFailed] = useState(false)
    useEffect(() => {
        let active = true
        setCurrent(page)
        setFailed(false)
        const refresh = async () => {
            try {
                const result = await fetchPageBySlug(client, page.slug)
                if (active) {
                    setCurrent(result.page)
                    setFailed(false)
                }
            } catch {
                if (active) {
                    setCurrent(null)
                    setFailed(true)
                }
            }
        }
        const timer = window.setInterval(() => {
            if (!document.hidden) void refresh()
        }, 15_000)
        const focus = () => {
            void refresh()
        }
        window.addEventListener('focus', focus)
        return () => {
            active = false
            window.clearInterval(timer)
            window.removeEventListener('focus', focus)
        }
    }, [client, page])
    if (failed || !current)
        return (
            <div className="state-panel" role="alert">
                문서를 확인할 수 없습니다. 새로고침하거나 접근 권한을 확인해 주세요.
            </div>
        )
    return (
        <section className="editor-frame is-readonly" aria-label="위키 문서">
            <EditorTopBar
                client={client}
                editable={false}
                pages={pages}
                currentSlug={current.slug}
                pageHrefForSlug={pageHrefForSlug}
            />
            <div className="editor-workspace">
                <EditorHeader
                    editable={false}
                    title={current.title}
                    icon={current.icon ?? ''}
                    showIconPicker={false}
                    onTitleChange={() => undefined}
                    onToggleIconPicker={() => undefined}
                    onSelectIcon={() => undefined}
                    onSelectEmoji={() => undefined}
                />
                <article className="wiki-document" dangerouslySetInnerHTML={{ __html: current.renderedHtml }} />
            </div>
        </section>
    )
}
