import react from 'eslint-plugin-react';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['src/**/*.{tsx,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react },
    linterOptions: {
      // 未インストールのプラグインへの eslint-disable コメント（react-hooks 等）を
      // エラーにしない。本 config は react/button-has-type のみを対象とするため最小構成を保つ。
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // #569: button の type 漏れ（デフォルト submit 化による意図しない form 送信）を機械検出。
      // recommended ルールセットは導入せず、本ルール 1 本のみに限定する（最小 blast radius）。
      'react/button-has-type': 'error',
    },
  },
];
