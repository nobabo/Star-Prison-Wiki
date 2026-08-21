import type { MouseEvent } from 'react'
import type { EmojiClickData } from 'emoji-picker-react'
import {
    Eraser,
    FileCode2,
    Heading1,
    Heading2,
    Heading3,
    MoreHorizontal,
    PaintBucket,
    Pilcrow,
    Palette,
    SmilePlus,
    Table2,
    Type
} from 'lucide-react'

import type { WikiPageDto } from '@coconut-studio/wiki-contracts'
import type { HighlightBlockShape, QuoteTone } from '@coconut-studio/wiki-markdown'
import { normalizeHighlightBlockWidth } from '@coconut-studio/wiki-markdown'

import {
    BACKGROUND_SWATCHES,
    CODE_LANGUAGE_CHOICES,
    COLOR_SWATCHES,
    HIGHLIGHT_PRESETS,
    HIGHLIGHT_WIDTH_CHOICES,
    QUOTE_TONE_CHOICES
} from '../editor-config'
import type {
    ContextMenuState,
    ContextSubmenuKind,
    ContextSubmenuState,
    ExtraMenuAction,
    HighlightPreset,
    ToolbarAction,
    WikiLinkCategory
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
    tableActions: ExtraMenuAction[]
    pages: WikiPageDto[]
    categories: WikiLinkCategory[]
    highlightActive: boolean
    tableActive: boolean
    codeBlockActive: boolean
    codeLanguage: string | null
    highlightWidth: string
    quoteTone: QuoteTone
    quoteColor: string
    highlightShape: HighlightBlockShape
    highlightBackgroundColor: string
    tableHeaderBackground: string
    onSetBlockStyle(value: string): void
    onToggleSubmenu(kind: ContextSubmenuKind, event: MouseEvent<HTMLButtonElement>): void
    onSetTextColor(color: string): void
    onUnsetTextColor(): void
    onSetBackgroundColor(color: string): void
    onUnsetBackgroundColor(): void
    onInsertHighlight(preset: HighlightPreset): void
    onSetHighlightWidth(width: string): void
    onSetHighlightShape(shape: HighlightBlockShape): void
    onSetHighlightBackgroundColor(color: string): void
    onUnsetHighlightBackgroundColor(): void
    onSetTableHeaderBackground(color: string): void
    onUnsetTableHeaderBackground(): void
    onSetCodeLanguage(language: string | null): void
    onSetQuoteTone(tone: QuoteTone): void
    onSetQuoteColor(color: string): void
    onInsertEmoji(data: EmojiClickData): void
    onRunExtraAction(action: ExtraMenuAction): void
    onSelectPageLink(page: WikiPageDto): void
    onSelectCategoryLink(category: WikiLinkCategory): void
}

export function EditorContextMenus(props: EditorContextMenusProps) {
    const {
        menu,
        submenu,
        blockValue,
        inlineActions,
        blockActions,
        extraActions,
        tableActions,
        pages,
        categories,
        highlightActive,
        tableActive,
        codeBlockActive,
        codeLanguage,
        highlightWidth,
        quoteTone,
        quoteColor,
        highlightBackgroundColor,
        tableHeaderBackground,
        onSetBlockStyle,
        onToggleSubmenu,
        onSetTextColor,
        onUnsetTextColor,
        onSetBackgroundColor,
        onUnsetBackgroundColor,
        onInsertHighlight,
        onSetHighlightWidth,
        onSetHighlightBackgroundColor,
        onUnsetHighlightBackgroundColor,
        onSetTableHeaderBackground,
        onUnsetTableHeaderBackground,
        onSetCodeLanguage,
        onSetQuoteTone,
        onSetQuoteColor,
        onInsertEmoji,
        onRunExtraAction,
        onSelectPageLink,
        onSelectCategoryLink
    } = props

    if (menu.kind === 'quote') {
        return (
            <div
                className="editor-context-menu editor-context-quote-panel"
                style={{ left: menu.x, top: menu.y, maxHeight: menu.maxHeight }}
                role="menu"
                aria-label="인용문 설정"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <QuoteColorControls
                    tone={quoteTone}
                    color={quoteColor}
                    onSetTone={onSetQuoteTone}
                    onSetColor={onSetQuoteColor}
                />
                <div className="quote-emoji-picker-controls">
                    <span className="context-background-label">인용문 이모지</span>
                    <div className="editor-emoji-picker editor-emoji-picker-compact">
                        <LazyEmojiPicker
                            ariaLabel="인용문 이모지 선택"
                            searchPlaceholder="인용문 이모지 검색"
                            onEmojiClick={onInsertEmoji}
                        />
                    </div>
                </div>
            </div>
        )
    }

    if (menu.kind === 'table') {
        return (
            <div
                className="editor-context-menu context-more-panel context-table-panel"
                style={{ left: menu.x, top: menu.y, maxHeight: menu.maxHeight }}
                role="menu"
                aria-label="표 편집"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <BackgroundColorControls
                    label="표 제목 배경색"
                    value={tableHeaderBackground}
                    onSet={onSetTableHeaderBackground}
                    onUnset={onUnsetTableHeaderBackground}
                />
                {tableActions.map((action) => (
                    <button
                        key={action.id}
                        type="button"
                        role="menuitem"
                        className={action.active ? 'active' : ''}
                        onClick={() => onRunExtraAction(action)}
                        disabled={action.disabled}
                        title={action.label}
                        aria-label={action.label}
                        aria-pressed={action.active}
                    >
                        <action.Icon aria-hidden="true" size={16} />
                        <span>{action.label}</span>
                    </button>
                ))}
            </div>
        )
    }

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
                    {tableActive ? (
                        <MenuIconWithEvent
                            active={submenu?.kind === 'table'}
                            label="표 편집 메뉴"
                            onClick={(event) => onToggleSubmenu('table', event)}
                        >
                            <Table2 size={16} />
                        </MenuIconWithEvent>
                    ) : null}
                    {codeBlockActive ? (
                        <MenuIconWithEvent
                            active={submenu?.kind === 'code-language'}
                            label="코드 언어 선택"
                            onClick={(event) => onToggleSubmenu('code-language', event)}
                        >
                            <FileCode2 size={16} />
                        </MenuIconWithEvent>
                    ) : null}
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
                        <ContextMenuButton key={action.id} action={action} onToggleSubmenu={onToggleSubmenu} />
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
                    style={{
                        left: submenu.x,
                        top: submenu.y,
                        maxHeight: submenu.maxHeight
                    }}
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
                    <BackgroundColorControls
                        label="카드 배경색"
                        value={highlightBackgroundColor}
                        onSet={onSetHighlightBackgroundColor}
                        onUnset={onUnsetHighlightBackgroundColor}
                        disabled={!highlightActive}
                    />
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
                    style={{
                        left: submenu.x,
                        top: submenu.y,
                        maxHeight: submenu.maxHeight
                    }}
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

            {submenu?.kind === 'code-language' ? (
                <div
                    className="editor-context-submenu code-language-menu"
                    style={{
                        left: submenu.x,
                        top: submenu.y,
                        maxHeight: submenu.maxHeight
                    }}
                    role="menu"
                    aria-label="코드 언어 선택"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {CODE_LANGUAGE_CHOICES.map((choice) => (
                        <button
                            key={choice.value ?? 'auto'}
                            type="button"
                            role="menuitemradio"
                            className={(codeLanguage ?? null) === choice.value ? 'active' : ''}
                            aria-checked={(codeLanguage ?? null) === choice.value}
                            onClick={() => onSetCodeLanguage(choice.value)}
                        >
                            <span>{choice.label}</span>
                            <code>{choice.value ?? 'auto'}</code>
                        </button>
                    ))}
                </div>
            ) : null}

            {submenu?.kind === 'table' ? (
                <div
                    className="editor-context-submenu context-more-panel context-table-panel"
                    style={{
                        left: submenu.x,
                        top: submenu.y,
                        maxHeight: submenu.maxHeight
                    }}
                    role="menu"
                    aria-label="표 편집"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {tableActions.map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            role="menuitem"
                            className={action.active ? 'active' : ''}
                            onClick={() => onRunExtraAction(action)}
                            disabled={action.disabled}
                            title={action.label}
                            aria-label={action.label}
                            aria-pressed={action.active}
                        >
                            <action.Icon aria-hidden="true" size={16} />
                            <span>{action.label}</span>
                        </button>
                    ))}
                </div>
            ) : null}

            {submenu?.kind === 'more' ? (
                <div
                    className="editor-context-submenu context-more-panel"
                    style={{
                        left: submenu.x,
                        top: submenu.y,
                        maxHeight: submenu.maxHeight
                    }}
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
                            className={action.active || submenu?.kind === action.submenu ? 'active' : ''}
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
                    style={{
                        left: submenu.x,
                        top: submenu.y,
                        maxHeight: submenu.maxHeight
                    }}
                    role="menu"
                    aria-label="일반 링크 선택"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {pages.length > 0 || categories.length > 0 ? (
                        <>
                            {pages.length > 0 ? (
                                <div className="context-page-link-group" role="group" aria-label="문서">
                                    <span className="context-page-link-heading">문서</span>
                                    {pages.map((page) => (
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
                                    ))}
                                </div>
                            ) : null}
                            {categories.length > 0 ? (
                                <div className="context-page-link-group" role="group" aria-label="카테고리">
                                    <span className="context-page-link-heading">카테고리</span>
                                    {categories.map((category) => (
                                        <button
                                            key={category.id}
                                            type="button"
                                            role="menuitem"
                                            onClick={() => onSelectCategoryLink(category)}
                                            title={category.title}
                                            aria-label={category.title}
                                        >
                                            <span className="context-page-link-icon" aria-hidden="true">
                                                {category.icon || '🗂️'}
                                            </span>
                                            <span>{category.title}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <span className="context-page-link-empty">연결할 문서나 카테고리가 없습니다.</span>
                    )}
                </div>
            ) : null}
        </>
    )
}

type QuoteColorControlsProps = {
    tone: QuoteTone
    color: string
    onSetTone(tone: QuoteTone): void
    onSetColor(color: string): void
}

function QuoteColorControls({ tone, color, onSetTone, onSetColor }: QuoteColorControlsProps) {
    return (
        <div className="quote-color-controls" role="group" aria-label="인용문 색상">
            <span className="context-background-label">인용문 색상</span>
            <div className="quote-tone-menu">
                {QUOTE_TONE_CHOICES.map((choice) => (
                    <button
                        key={choice.tone}
                        type="button"
                        role="menuitemradio"
                        className={
                            'quote-tone-choice ' + choice.className + (!color && tone === choice.tone ? ' active' : '')
                        }
                        aria-checked={!color && tone === choice.tone}
                        aria-label={choice.label}
                        onClick={() => onSetTone(choice.tone)}
                        title={choice.label}
                    />
                ))}
                <label
                    className={color ? 'quote-color-picker active' : 'quote-color-picker'}
                    style={color ? { background: color } : undefined}
                    title="사용자 지정 색상"
                    aria-label="사용자 지정 색상"
                >
                    <Palette aria-hidden="true" size={16} />
                    <input
                        type="color"
                        value={color || '#3f8cff'}
                        onChange={(event) => onSetColor(event.currentTarget.value)}
                    />
                </label>
            </div>
        </div>
    )
}

type BackgroundColorControlsProps = {
    label: string
    value: string
    disabled?: boolean
    onSet(color: string): void
    onUnset(): void
}

function BackgroundColorControls({ label, value, disabled, onSet, onUnset }: BackgroundColorControlsProps) {
    return (
        <div className="context-background-controls" role="group" aria-label={label}>
            <span className="context-background-label">{label}</span>
            <div className="context-background-swatches">
                {BACKGROUND_SWATCHES.map((swatch) => (
                    <button
                        key={swatch.value}
                        type="button"
                        className={`swatch ${swatch.className}${value === swatch.value ? ' active' : ''}`}
                        onClick={() => onSet(swatch.value)}
                        disabled={disabled}
                        title={`${label} ${swatch.label}`}
                        aria-label={`${label} ${swatch.label}`}
                        aria-pressed={value === swatch.value}
                    />
                ))}
                <label
                    className={
                        value && !BACKGROUND_SWATCHES.some((swatch) => swatch.value === value)
                            ? 'context-background-custom active'
                            : 'context-background-custom'
                    }
                    style={value ? { background: value } : undefined}
                    title={`${label} 사용자 지정`}
                >
                    <Palette aria-hidden="true" size={15} />
                    <input
                        type="color"
                        value={value || '#3f8cff'}
                        onChange={(event) => onSet(event.currentTarget.value)}
                        disabled={disabled}
                        aria-label={`${label} 사용자 지정`}
                    />
                </label>
                <button
                    type="button"
                    className="tool-button"
                    onClick={onUnset}
                    disabled={disabled || !value}
                    title={`${label} 지우기`}
                    aria-label={`${label} 지우기`}
                >
                    <Eraser size={15} />
                </button>
            </div>
        </div>
    )
}

type MenuIconProps = {
    active: boolean
    label: string
    onClick(): void
    children: React.ReactNode
}

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

type MenuIconWithEventProps = Omit<MenuIconProps, 'onClick'> & {
    onClick(event: MouseEvent<HTMLButtonElement>): void
}

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
