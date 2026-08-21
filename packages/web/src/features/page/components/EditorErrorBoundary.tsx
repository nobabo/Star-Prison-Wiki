import { Component, type ErrorInfo, type ReactNode } from 'react'

type EditorErrorBoundaryProps = { children: ReactNode }
type EditorErrorBoundaryState = { error: Error | null }

export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
    state: EditorErrorBoundaryState = { error: null }

    static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[wiki-editor] rendering failed', { error, componentStack: info.componentStack })
    }

    render(): ReactNode {
        if (!this.state.error) return this.props.children
        return (
            <div className="state-panel document-error-state" role="alert">
                <p>문서를 불러오지 못했습니다.</p>
                <button type="button" onClick={() => window.location.reload()}>
                    페이지 새로고침
                </button>
            </div>
        )
    }
}
