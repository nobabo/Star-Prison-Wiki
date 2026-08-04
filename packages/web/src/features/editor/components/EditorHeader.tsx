import type { EmojiClickData } from 'emoji-picker-react'
import { Eraser, SmilePlus } from 'lucide-react'

import { LazyEmojiPicker } from './LazyEmojiPicker'

type EditorHeaderProps = {
    title: string
    icon: string
    showIconPicker: boolean
    onTitleChange(title: string): void
    onToggleIconPicker(): void
    onSelectIcon(icon: string): void
    onSelectEmoji(data: EmojiClickData): void
}

export function EditorHeader(props: EditorHeaderProps) {
    const { title, icon, showIconPicker, onTitleChange, onToggleIconPicker, onSelectIcon, onSelectEmoji } = props
    return (
        <div className="editor-title-row">
            <div className="editor-icon-picker">
                <button
                    type="button"
                    className={`editor-icon-button ${icon ? 'has-icon' : ''}`}
                    onClick={onToggleIconPicker}
                    title="문서 이모지 선택"
                    aria-label="문서 이모지 선택"
                    aria-expanded={showIconPicker}
                >
                    {icon ? <span aria-hidden="true">{icon}</span> : <SmilePlus aria-hidden="true" size={24} />}
                </button>
                {showIconPicker ? (
                    <div className="editor-icon-popover" role="dialog" aria-label="문서 이모지">
                        <div className="editor-emoji-picker editor-emoji-picker-compact">
                            <LazyEmojiPicker
                                ariaLabel="문서 이모지 선택"
                                searchPlaceholder="문서 이모지 검색"
                                onEmojiClick={onSelectEmoji}
                            />
                        </div>
                        <div className="editor-icon-actions">
                            <button
                                type="button"
                                className="icon-clear-button"
                                onClick={() => onSelectIcon('')}
                                title="이모지 지우기"
                                aria-label="이모지 지우기"
                            >
                                <Eraser aria-hidden="true" size={16} />
                                <span>지우기</span>
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
            <input
                className="editor-title-input"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder="제목"
                aria-label="문서 제목"
                spellCheck={false}
            />
        </div>
    )
}
