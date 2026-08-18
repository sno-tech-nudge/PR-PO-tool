import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // These three rules are React Compiler-readiness checks (new in
      // eslint-plugin-react-hooks v7's "recommended" preset). This codebase
      // predates them and consistently uses the `useEffect(() => { load() }, [dep])`
      // + `async function load() { setLoading(true); ... }` pattern throughout —
      // valid, working React, just not compiler-safe. Downgraded to warnings
      // rather than mass-rewriting ~15 components' data-fetching effects.
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    // Vercel serverless functions run in Node, not the browser — needs
    // `process`/`console` etc. instead of browser globals.
    files: ['api/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
