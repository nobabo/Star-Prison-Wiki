import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Extension } from '@tiptap/react'

import { countNestedDocumentElements } from '../lib/document-elements'

const preventNestedDocumentElementsKey = new PluginKey('preventNestedDocumentElements')

export const preventNestedDocumentElementsPlugin = new Plugin({
    key: preventNestedDocumentElementsKey,
    filterTransaction(transaction, state) {
        if (!transaction.docChanged) return true

        // setContent is used to load/restore existing documents. Yjs
        // synchronization must also accept the server's current state.
        if (transaction.getMeta('preventUpdate') === true || transaction.getMeta('y-sync$')) {
            return true
        }

        return countNestedDocumentElements(transaction.doc) <= countNestedDocumentElements(state.doc)
    }
})

export const PreventNestedDocumentElements = Extension.create({
    name: 'preventNestedDocumentElements',

    addProseMirrorPlugins() {
        return [preventNestedDocumentElementsPlugin]
    }
})
