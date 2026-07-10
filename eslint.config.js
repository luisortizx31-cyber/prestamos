import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['src/sw.js', 'api/**/*.js'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Service worker: entorno propio (self, importScripts, caches...),
    // no el de un navegador normal.
    files: ['src/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      // "firebase" es el global que agrega importScripts() de
      // firebase-messaging-compat.js en runtime, no viene tipado.
      globals: { ...globals.serviceworker, firebase: 'readonly' },
    },
  },
  {
    // Funciones serverless de Vercel: corren en Node, no en el browser.
    files: ['api/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
])
