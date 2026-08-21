import { BookOpenText, Minus, Quote, Type } from 'lucide-react'

import type {
    CodeLanguageChoice,
    ColorSwatch,
    HighlightPreset,
    HighlightWidthChoice,
    QuoteToneChoice
} from './editor-types'

export const CODE_LANGUAGE_CHOICES: CodeLanguageChoice[] = [
    { label: '자동 감지', value: null },
    { label: '일반 텍스트', value: 'plaintext' },
    { label: 'JavaScript', value: 'javascript' },
    { label: 'TypeScript', value: 'typescript' },
    { label: 'HTML / XML', value: 'xml' },
    { label: 'CSS', value: 'css' },
    { label: 'JSON', value: 'json' },
    { label: 'Markdown', value: 'markdown' },
    { label: 'Bash / Shell', value: 'bash' },
    { label: 'Python', value: 'python' },
    { label: 'Java', value: 'java' },
    { label: 'Kotlin', value: 'kotlin' },
    { label: 'C', value: 'c' },
    { label: 'C++', value: 'cpp' },
    { label: 'C#', value: 'csharp' },
    { label: 'Go', value: 'go' },
    { label: 'Rust', value: 'rust' },
    { label: 'SQL', value: 'sql' },
    { label: 'YAML', value: 'yaml' },
    { label: 'PHP', value: 'php' },
    { label: 'Ruby', value: 'ruby' },
    { label: 'Swift', value: 'swift' }
]

export const COLOR_SWATCHES: ColorSwatch[] = [
    { value: '#c65a1e', className: 'swatch-fg-orange', label: '구리 주황' },
    { value: '#19703b', className: 'swatch-fg-green', label: '기록 녹색' },
    { value: '#2559b7', className: 'swatch-fg-blue', label: '청색 잉크' },
    { value: '#ffb7de', className: 'swatch-fg-rose', label: '코코넛 핑크' }
]

export const BACKGROUND_SWATCHES: ColorSwatch[] = [
    { value: '#fff3bd', className: 'swatch-bg-yellow', label: '노란 표식' },
    { value: '#d9f1df', className: 'swatch-bg-green', label: '녹색 표식' },
    { value: '#dae6fb', className: 'swatch-bg-blue', label: '청색 표식' },
    { value: '#f9d9e1', className: 'swatch-bg-rose', label: '장미 표식' }
]

export const QUOTE_TONE_CHOICES: QuoteToneChoice[] = [
    { tone: 'info', label: '분홍', className: 'quote-tone-info' },
    { tone: 'error', label: '빨강', className: 'quote-tone-error' },
    { tone: 'warning', label: '노랑', className: 'quote-tone-warning' },
    { tone: 'correct', label: '초록', className: 'quote-tone-correct' },
    { tone: 'blue', label: '파랑', className: 'quote-tone-blue' }
]

export const HIGHLIGHT_PRESETS: HighlightPreset[] = [
    {
        id: 'lead',
        label: '인삿말',
        description: '인용 부호로 장식한 명조체 첫 단락',
        variant: 'lead',
        Icon: BookOpenText,
        content: [{ type: 'paragraph' }]
    },
    {
        id: 'hero',
        label: '메인 배너',
        description: '큰 제목과 보조 문구',
        variant: 'hero',
        Icon: Type,
        content: [{ type: 'heading', attrs: { level: 1 } }, { type: 'paragraph' }]
    },
    {
        id: 'panel',
        label: '안내 박스',
        description: '여러 줄 안내 영역',
        variant: 'panel',
        Icon: Quote,
        content: [{ type: 'heading', attrs: { level: 3 } }, { type: 'paragraph' }]
    },
    {
        id: 'strip',
        label: '문장 강조',
        description: '짧은 공지 한 줄',
        variant: 'strip',
        Icon: Minus,
        content: [{ type: 'paragraph' }]
    }
]

export const HIGHLIGHT_WIDTH_CHOICES: HighlightWidthChoice[] = [
    { label: '전체', width: '100%' },
    { label: '3/4', width: '75%' },
    { label: '2/3', width: '66.6667%' },
    { label: '1/2', width: '50%' },
    { label: '1/3', width: '33.3333%' },
    { label: '1/4', width: '25%' }
]
