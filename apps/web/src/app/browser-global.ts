declare global {
    interface Window {
        global?: typeof globalThis
    }
}

if (typeof window !== 'undefined' && typeof window.global === 'undefined') {
    window.global = globalThis
}

export {}
