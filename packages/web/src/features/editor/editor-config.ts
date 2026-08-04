import { Minus, Quote, Type } from 'lucide-react'

import type { ColorSwatch, HighlightPreset, HighlightWidthChoice } from './editor-types'

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

export const HIGHLIGHT_PRESETS: HighlightPreset[] = [
    {
        id: 'hero',
        label: '메인 배너',
        description: '큰 제목과 보조 문구',
        variant: 'hero',
        Icon: Type,
        content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '강조 제목' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '보조 문구를 입력하세요.' }] }
        ]
    },
    {
        id: 'panel',
        label: '안내 박스',
        description: '여러 줄 안내 영역',
        variant: 'panel',
        Icon: Quote,
        content: [
            { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '안내 제목' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '내용을 입력하세요.' }] }
        ]
    },
    {
        id: 'strip',
        label: '문장 강조',
        description: '짧은 공지 한 줄',
        variant: 'strip',
        Icon: Minus,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '강조 문구를 입력하세요.' }] }]
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
