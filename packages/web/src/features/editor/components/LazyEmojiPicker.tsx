import { lazy, Suspense } from 'react'
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

type LazyEmojiPickerProps = {
    ariaLabel: string
    searchPlaceholder: string
    onEmojiClick(data: EmojiClickData): void
}

export function LazyEmojiPicker({ ariaLabel, searchPlaceholder, onEmojiClick }: LazyEmojiPickerProps) {
    return (
        <Suspense
            fallback={
                <div className="emoji-picker-loading" role="status">
                    이모지 불러오는 중
                </div>
            }
        >
            <EmojiPicker
                theme={'dark' as Theme}
                emojiStyle={'native' as EmojiStyle}
                lazyLoadEmojis
                height={320}
                width="100%"
                searchPlaceholder={searchPlaceholder}
                searchClearButtonLabel="검색 지우기"
                previewConfig={{ showPreview: false }}
                onEmojiClick={onEmojiClick}
                aria-label={ariaLabel}
            />
        </Suspense>
    )
}
