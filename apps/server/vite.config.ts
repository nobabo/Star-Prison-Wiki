import { defineConfig } from 'vite'

export default defineConfig({
    ssr: {
        noExternal: ['@coconut-studio/wiki-contracts', '@coconut-studio/wiki-markdown', '@coconut-studio/wiki-server']
    },
    build: {
        ssr: 'src/main.ts',
        target: 'node22',
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: { entryFileNames: 'main.js' }
        }
    }
})
