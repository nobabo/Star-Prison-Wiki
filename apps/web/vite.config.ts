import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiPort = Number(process.env.WIKI_API_PORT ?? 5174)

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true }
        }
    },
    build: {
        chunkSizeWarningLimit: 500,
        rollupOptions: {
            output: {
                onlyExplicitManualChunks: true,
                manualChunks(id) {
                    if (id.includes('emoji-picker-react')) return 'emoji-picker'
                    if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor'
                    if (id.includes('@hocuspocus') || id.includes('yjs') || id.includes('lib0')) return 'collaboration'
                    return undefined
                }
            }
        }
    }
})
