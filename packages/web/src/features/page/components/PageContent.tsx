import { lazy, Suspense } from 'react'
import { FileText } from 'lucide-react'

import type { WikiPageDetailDto, WikiPageDto, WikiPageResponse } from '@coconut-studio/wiki-contracts'

import type { WikiBrandConfig } from '../../../app/wiki-brand'
import type { ApiClient } from '../../../shared/api/wiki-api'
import { EditorErrorBoundary } from './EditorErrorBoundary'

const LazyWikiEditor = lazy(() => import('../../editor/WikiEditor').then(({ WikiEditor }) => ({ default: WikiEditor })))

export type PageLoadStatus = 'loading' | 'ready' | 'empty' | 'error'

type PageContentProps = {
    status: PageLoadStatus
    response: WikiPageResponse | null
    client: ApiClient
    brand: WikiBrandConfig
    pages: WikiPageDto[]
    canEdit: boolean
    onCreatePage(title: string): Promise<WikiPageDto>
    onPageUpdated(page: WikiPageDetailDto): void
}

export function PageContent({
    status,
    response,
    client,
    brand,
    pages,
    canEdit,
    onCreatePage,
    onPageUpdated
}: PageContentProps) {
    if (status === 'loading') {
        return <PageStatus label="불러오는 중" />
    }

    if (status === 'empty') {
        return (
            <div className="state-panel">
                <div className="empty-state">
                    <span className="empty-icon" aria-hidden="true">
                        <FileText size={22} />
                    </span>
                    <h2>아직 문서가 없습니다</h2>
                </div>
            </div>
        )
    }

    if (status === 'error' || !response) {
        return <div className="state-panel document-error-state">문서를 불러오지 못했습니다.</div>
    }

    if (!canEdit || !response.permissions.write) {
        return <article className="wiki-document" dangerouslySetInnerHTML={{ __html: response.page.renderedHtml }} />
    }

    return (
        <EditorErrorBoundary key={response.page.id}>
            <Suspense fallback={<PageStatus label="편집기 불러오는 중" />}>
                <LazyWikiEditor
                    key={response.page.id}
                    client={client}
                    page={response.page}
                    pages={pages}
                    collaborationUrl={brand.collaborationUrl}
                    onCreatePage={onCreatePage}
                    onPageUpdated={onPageUpdated}
                />
            </Suspense>
        </EditorErrorBoundary>
    )
}

function PageStatus({ label }: { label: string }) {
    return (
        <section className="editor-frame" aria-label={label}>
            <div className="editor-workspace">
                <div className="save-indicator loading" role="status">
                    <span className="save-dot" />
                    <span>{label}</span>
                </div>
            </div>
        </section>
    )
}
