import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { typedRules } from '../../eslint.typed.js'

// The site may use React, @nostube/core and @nostube/widgets.
export default tseslint.config({ ignores: ['dist'] }, typedRules(import.meta.dirname), {
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  files: ['**/*.{ts,tsx}'],
  languageOptions: { ecmaVersion: 2020, globals: globals.browser },
  linterOptions: { reportUnusedDisableDirectives: 'error' },
  plugins: { 'react-hooks': reactHooks },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
  },
})
