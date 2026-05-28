import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { injectSwBuildId } from './astro/integrations/inject-sw-build-id';

export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap(), injectSwBuildId()],
  // #176 A-1: Astro built-in CSP で `<meta http-equiv="content-security-policy">` を各ページに注入し、
  // bundled scripts (Astro island loader 等の inline `<script type="module">` 含む) を自動で SHA-256 hash 化。
  // 結果として `public/_headers` の `script-src` から `'unsafe-inline'` を安全に削除できる。
  // dev mode では security.csp は無効（公式仕様）。E2E は preview ベース (#247) で評価する。
  security: {
    csp: {
      algorithm: 'SHA-256',
    },
  },
  vite: {
    plugins: [tailwindcss()],
    // 正規表現ビジュアライザの recheck / regexp-tree は CJS パッケージ。
    // client 専用 chunk（RegexVisualizer が動的 import）でのみ使うため SSR graph には載らないが、
    // dev の client では CJS（`module.exports`）が未変換だと `module is not defined` になるため
    // optimizeDeps で CJS→ESM へ pre-bundle する。client build では Vite が recheck の `browser`
    // フィールド（synckit/Worker 非依存の lib/browser.js）を自動選択する。
    optimizeDeps: {
      include: ['recheck', 'regexp-tree'],
    },
    build: {
      // #246: Vite デフォルト 4KB 未満の asset を data: URI として CSS にインライン化
      // するが、`public/_headers` の CSP は `font-src` を明示しておらず default-src 'self'
      // で data:font が block される（@fontsource/jetbrains-mono の小さな subset font (cyrillic-ext 等)
      // が該当）。inline 化を無効化し dev/preview/prod の挙動を一致させる。
      assetsInlineLimit: 0,
    },
  },
});
