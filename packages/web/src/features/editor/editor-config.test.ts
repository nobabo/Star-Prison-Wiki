import { describe, expect, it } from 'vitest'

import { HIGHLIGHT_PRESETS } from './editor-config'

describe('highlight presets', () => {
    it('offers the serif lead design as 인삿말', () => {
        expect(HIGHLIGHT_PRESETS.find((preset) => preset.id === 'lead')).toMatchObject({
            label: '인삿말',
            variant: 'lead'
        })
    })

    it('uses empty document nodes so prompt copy remains presentation-only', () => {
        for (const preset of HIGHLIGHT_PRESETS) {
            expect(JSON.stringify(preset.content)).not.toContain('"text"')
        }
    })
})
