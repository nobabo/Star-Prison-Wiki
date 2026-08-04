import type { MouseEvent } from 'react'
import type { EmojiClickData } from 'emoji-picker-react'
import {
    Eraser,
    Heading1,
    Heading2,
    Heading3,
    MoreHorizontal,
    PaintBucket,
    Pilcrow,
    SmilePlus,
    Type
} from 'lucide-react'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'
import type { HighlightBlockShape } from '@coconut-studio/wiki-markdown'
import { normalizeHighlightBlockWidth } from '@coconut-studio/wiki-markdown'

import { BACKGROUND_SWATCHES, COLOR_SWATCHES, HIGHLIGHT_PRESETS, HIGHLIGHT_WIDTH_CHOICES } from '../editor-config'
import type {
    ContextMenuState,
    ContextSubmenuKind,
    ContextSubmenuState,
    ExtraMenuAction,
    HighlightPreset,
    ToolbarAction
} from '../editor-types'
import { ContextMenuButton } from './ContextMenuButton'
import { LazyEmojiPicker } from './LazyEmojiPicker'

type EditorContextMenusProps = {
    menu: Exclude<ContextMenuState, null>
    submenu: ContextSubmenuState
    blockValue: string
    inlineActions: ToolbarAction[]
    blockActions: ToolbarAction[]
    extraActions: ExtraMenuAction[]
    pages: WikiPageDto[]
    highlightActive: boolean
    highlightWidth: string
    highlightShape: HighlightBlockShape
    onSetBlockStyle(value: string): void
    onToggleSubmenu(kind: ContextSubmenuKind, event: MouseEvent<HTMLButtonElement>): void
    onSetTextColor(color: string): void
    onUnsetTextColor(): void
    onSetBackgroundColor(color: string): void
    onUnsetBackgroundColor(): void
    onInsertHighlight(preset: HighlightPreset): void
    onSetHighlightWidth(width: string): void
    onSetHighlightShape(shape: HighlightBlockShape): void
    onInsertEmoji(data: EmojiClickData): void
    onRunExtraAction(action: ExtraMenuAction): void
    onSelectPageLink(page: WikiPageDto): void
}

export function EditorContextMenus(props: EditorContextMenusProps) {
    const {
        menu,
        submenu,
        blockValue,
        inlineActions,
        blockActions,
        extraActions,
        pages,
        highlightActive,
        highlightWidth,
        onSetBlockStyle,
        onToggleSubmenu,
        onSetTextColor,
        onUnsetTextColor,
        onSetBackgroundColor,
        onUnsetBackgroundColor,
        onInsertHighlight,
        onSetHighlightWidth,
        onInsertEmoji,
        onRunExtraAction,
        onSelectPageLink
    } = props

    return (
        <>
            <div
                className="editor-context-menu"
                style={{ left: menu.x, top: menu.y, maxHeight: menu.maxHeight }}
                role="menu"
                aria-label="Markdown 서식 메뉴"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="context-menu-section context-menu-top-row">
                    <MenuIcon
                        active={blockValue === 'paragraph'}
                        label="본문"
                        onClick={() => onSetBlockStyle('paragraph')}
                    >
                        <Pilcrow size={16} />
                    </MenuIcon>
                    <MenuIcon active={blockValue === 'h1'} label="제목 1" onClick={() => onSetBlockStyle('h1')}>
                        <Heading1 size={16} />
                    </MenuIcon>
                    <MenuIcon active={blockValue === 'h2'} label="제목 2" onClick={() => onSetBlockStyle('h2')}>
                        <Heading2 size={16} />
                    </MenuIcon>
                    <MenuIcon active={blockValue === 'h3'} label="제목 3" onClick={() => onSetBlockStyle('h3')}>
                        <Heading3 size={16} />
                    </MenuIcon>
                    <MenuIconWithEvent
                        active={submenu?.kind === 'highlight'}
                        label="강조 div 메뉴"
                        onClick={(event) => onToggleSubmenu('highlight', event)}
                    >
                        <Type size={16} />
                    </MenuIconWithEvent>
                    <MenuIconWithEvent
                        active={submenu?.kind === 'emoji'}
                        label="이모지 메뉴"
                        onClick={(event) => onToggleSubmenu('emoji', event)}
                    >
                        <SmilePlus size={16} />
                    </MenuIconWithEvent>
                    <MenuIconWithEvent
                        active={submenu?.kind === 'more'}
                        label="추가 메뉴"
                        onClick={(event) => onToggleSubmenu('more', event)}
                    >
                        <MoreHorizontal size={16} />
                    </MenuIconWithEvent>
                </div>

                <div className="context-menu-grid context-menu-inline-row" aria-label="인라인 서식">
                    {inlineActions.map((action) => (
                        <ContextMenuButton key={action.id} action={action} />
                    ))}
                    <details className="context-menu-popover" onClick={(event) => event.stopPropagation()}>
                        <summary title="글자색" aria-label="글자색 메뉴">
                            <Type aria-hidden="true" size={16} />
                        </summary>
                        <div className="context-menu-panel color-picker-panel" aria-label="글자색">
                            {COLOR_SWATCHES.map((swatch) => (
                                <button
                                    key={swatch.value}
                                    type="button"
                                    className={`swatch ${swatch.className}`}
                                    onClick={() => onSetTextColor(swatch.value)}
                                    title={`글자색 ${swatch.label}`}
                                    aria-label={`글자색 ${swatch.label}`}
                                />
                            ))}
                            <button
                                type="button"
                                className="tool-button"
                                onClick={onUnsetTextColor}
                                title="글자색 지우기"
                                aria-label="글자색 지우기"
                            >
                                <Eraser size={15} />
                            </button>
                        </div>
                    </details>
                </div>

                <div className="context-menu-grid context-menu-block-row" aria-label="블록 서식">
                    {blockActions.map((action) => (
                        <ContextMenuButton key={action.id} action={action} />
                    ))}
                    <details className="context-menu-popover" onClick={(event) => event.stopPropagation()}>
                        <summary title="배경색" aria-label="배경색 메뉴">
                            <PaintBucket aria-hidden="true" size={16} />
                        </summary>
                        <div className="context-menu-panel color-picker-panel" aria-label="배경색">
                            {BACKGROUND_SWATCHES.map((swatch) => (
                                <button
                                    key={swatch.value}
                                    type="button"
                                    className={`swatch ${swatch.className}`}
                                    onClick={() => onSetBackgroundColor(swatch.value)}
                                    title={`배경색 ${swatch.label}`}
                                    aria-label={`배경색 ${swatch.label}`}
                                />
                            ))}
                            <button
                                type="button"
                                className="tool-button"
                                onClick={onUnsetBackgroundColor}
                                title="배경색 지우기"
                                aria-label="배경색 지우기"
                            >
                                <Eraser size={15} />
                            </button>
                        </div>
                    </details>
                </div>
            </div>

            {submenu?.kind === 'highlight' ? (
                <div
                    className="editor-context-submenu"
                    style={{ left: submenu.x, top: submenu.y, maxHeight: submenu.maxHeight }}
                    role="menu"
                    aria-label="강조 div"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="highlight-menu-list" aria-label="강조 div 추가">
                        {HIGHLIGHT_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                role="menuitem"
                                className="highlight-preset-button"
                                onClick={() => onInsertHighlight(preset)}
                                title={preset.label}
                                aria-label={preset.label}
                            >
                                <preset.Icon aria-hidden="true" size={16} />
                            </button>
                        ))}
                    </div>
                    <div className="highlight-width-grid" aria-label="강조 div 너비">
                        {HIGHLIGHT_WIDTH_CHOICES.map((choice) => (
                            <button
                                key={choice.width}
                                type="button"
                                role="menuitem"
                                className={
                                    highlightActive && highlightWidth === normalizeHighlightBlockWidth(choice.width)
                                        ? 'active'
                                        : ''
                                }
                                onClick={() => onSetHighlightWidth(choice.width)}
                                disabled={!highlightActive}
                                title={highlightActive ? `${choice.label} 너비` : '강조 div 안에서 선택 가능'}
                                aria-label={`${choice.label} 너비`}
                            >
                                {choice.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {submenu?.kind === 'emoji' ? (
                <div
                    className="editor-context-submenu editor-context-emoji-submenu"
                    style={{ left: submenu.x, top: submenu.y, maxHeight: submenu.maxHeight }}
                    role="dialog"
                    aria-label="이모지 선택"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="editor-emoji-picker editor-emoji-picker-compact">
                        <LazyEmojiPicker
                            ariaLabel="이모지 선택"
                            searchPlaceholder="이모지 검색"
                            onEmojiClick={onInsertEmoji}
                        />
                    </div>
                </div>
            ) : null}

            {submenu?.kind === 'more' ? (
                <div
                    className="editor-context-submenu context-more-panel"
                    style={{ left: submenu.x, top: submenu.y, maxHeight: submenu.maxHeight }}
                    role="menu"
                    aria-label="추가 기능"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {extraActions.map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            role="menuitem"
                            className={submenu?.kind === action.submenu ? 'active' : ''}
                            onClick={(event) =>
                                action.submenu ? onToggleSubmenu(action.submenu, event) : onRunExtraAction(action)
                            }
                            disabled={action.disabled}
                            title={action.label}
                            aria-label={action.label}
                            aria-haspopup={action.submenu ? 'menu' : undefined}
                            aria-expanded={action.submenu ? submenu?.kind === action.submenu : undefined}
                        >
                            <action.Icon aria-hidden="true" size={16} />
                            <span>{action.label}</span>
                        </button>
                    ))}
                </div>
            ) : null}

            {submenu?.kind === 'page-link' ? (
                <div
                    className="editor-context-submenu context-more-panel context-page-link-panel"
                    style={{ left: submenu.x, top: submenu.y, maxHeight: submenu.maxHeight }}
                    role="menu"
                    aria-label="페이지 링크 선택"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {pages.length > 0 ? (
                        pages.map((page) => (
                            <button
                                key={page.id}
                                type="button"
                                role="menuitem"
                                onClick={() => onSelectPageLink(page)}
                                title={page.title}
                                aria-label={`${page.title} 페이지로 연결`}
                            >
                                <span className="context-page-link-icon" aria-hidden="true">
                                    {page.icon || '↗'}
                                </span>
                                <span>{page.title}</span>
                            </button>
                        ))
                    ) : (
                        <span className="context-page-link-empty">연결할 페이지가 없습니다.</span>
                    )}
                </div>
            ) : null}
        </>
    )
}

type MenuIconProps = { active: boolean; label: string; onClick(): void; children: React.ReactNode }

function MenuIcon({ active, label, onClick, children }: MenuIconProps) {
    return (
        <button
            type="button"
            role="menuitem"
            className={active ? 'active' : ''}
            onClick={onClick}
            title={label}
            aria-label={label}
        >
            {children}
        </button>
    )
}

type MenuIconWithEventProps = Omit<MenuIconProps, 'onClick'> & { onClick(event: MouseEvent<HTMLButtonElement>): void }

function MenuIconWithEvent({ active, label, onClick, children }: MenuIconWithEventProps) {
    return (
        <button
            type="button"
            role="menuitem"
            className={active ? 'active' : ''}
            onClick={onClick}
            title={label}
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={active}
        >
            {children}
        </button>
    )
}
