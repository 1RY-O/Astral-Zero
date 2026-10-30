import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/**
 * Phase 2 rewrote the backend, so those files are linted from now on.
 * Only the legacy Solar Sentinel client remains ignored until Phase 5
 * replaces it.
 */
const LEGACY_CLIENT_FILES = [
  'src/audio.js',
  'src/demoFeed.js',
  'src/main.js',
  'src/orbitalMap.js',
];

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-output/**',
      ...LEGACY_CLIENT_FILES,
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: '18.3' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
