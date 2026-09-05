import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { replaceMarkdownYState } from './markdown-y-state'

describe('server snapshot restoration', () => {
    it('preserves deletion history when an old client resubmits its state', async () => {
        const old = await replaceMarkdownYState(null, '# Old content')
        const restored = await replaceMarkdownYState(
            old,
            '# Restored\n\n**Bold** and [link](https://example.com)\n\n- one\n- two\n\n```ts\nconst x = 1\n```'
        )
        const doc = new Y.Doc()
        Y.applyUpdate(doc, restored)
        Y.applyUpdate(doc, old)
        const result = doc.getXmlFragment('default').toString()
        expect(result).not.toContain('Old content')
        expect(result).toContain('Restored')
        expect(result).toContain('<bold>Bold</bold>')
        expect(result).toContain('<bulletlist>')
        expect(result).toContain('const x = 1')
        doc.destroy()
    })
})
