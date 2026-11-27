import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

// Type-aware rules shared by every TS package. `dir` is the package's own directory.
export const typedRules = (dir, { react = true } = {}) => ({
  files: ['src/**/*.{ts,tsx}'],
  extends: [tseslint.configs.base],
  languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: dir } },
  plugins: react ? { 'react-hooks': reactHooks } : {},
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': [
      'error',
      { checksVoidReturn: { attributes: false } },
    ],
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-deprecated': 'error',
    ...(react ? reactHooks.configs.recommended.rules : {}),
    // React Compiler advice, not bugs: warn until the patterns are reworked.
    ...(react
      ? {
          'react-hooks/set-state-in-effect': 'warn',
          'react-hooks/refs': 'warn',
          'react-hooks/preserve-manual-memoization': 'warn',
        }
      : {}),
  },
})
