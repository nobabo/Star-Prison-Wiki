import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WikiModeTabs } from './WikiModeTabs'

describe('WikiModeTabs', () => {
    it('shows the edit tab only to administrators', () => {
        const viewer = renderToStaticMarkup(<WikiModeTabs mode="edit" canEdit={false} onChange={() => undefined} />)
        const admin = renderToStaticMarkup(<WikiModeTabs mode="edit" canEdit onChange={() => undefined} />)

        expect(viewer).toContain('일반 위키')
        expect(viewer).not.toContain('수정')
        expect(viewer).toContain('aria-selected="true"')
        expect(admin).toContain('일반 위키')
        expect(admin).toContain('수정')
        expect(admin).toContain('wiki-mode-tab active')
    })
})
