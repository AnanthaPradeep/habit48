import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  { files: ['**/*.{ts,tsx}'], ...js.configs.recommended },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
  { files: ['scripts/**/*.mjs'], ...js.configs.recommended },
  {
    files: ['scripts/worker-template.js'],
    ...js.configs.recommended,
    languageOptions: { globals: { self: 'readonly', caches: 'readonly', URL: 'readonly', Request: 'readonly', Response: 'readonly', fetch: 'readonly' } },
  },
]
