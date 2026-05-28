import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // 出荷時 client は recheck の browser ビルド（lib/browser.js）を使う（Vite が browser
      // フィールドを自動選択）。unit の陽性対照が「実際に出荷されるコード」を守るよう、
      // vitest でも同じ browser ビルドへ解決する（native/synckit エントリではなく）。
      recheck: path.resolve(__dirname, 'node_modules/recheck/lib/browser.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'tests/meta/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html'],
    },
  },
});
