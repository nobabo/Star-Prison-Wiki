import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**', 'apps/server/.local/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-hooks/immutability': 'off',
            'react-hooks/set-state-in-effect': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
        }
    },
    {
        files: ['apps/web/**/*.{ts,tsx}', 'packages/web/**/*.{ts,tsx}'],
        languageOptions: { globals: globals.browser }
    },
    {
        files: ['apps/server/**/*.ts', 'packages/server/**/*.ts', 'tooling/**/*.{js,mjs,ts}', '**/*.config.ts'],
        languageOptions: { globals: globals.node }
    },
    {
        files: ['apps/web/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': ['error', { patterns: ['@star-prison/wiki-server', '**/apps/server/**'] }]
        }
    },
    {
        files: ['packages/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': ['error', { patterns: ['@star-prison/*', '**/apps/**'] }]
        }
    }
)
