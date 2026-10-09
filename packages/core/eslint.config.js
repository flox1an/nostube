import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Core is "no React", not "no browser": IndexedDB, localStorage and workers are fine.
export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2020, globals: globals.browser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'applesauce-react', 'applesauce-react/*', '@/*'],
              message: 'core must not depend on React or on app code. Inject it instead.',
            },
          ],
        },
      ],
    },
  }
)
