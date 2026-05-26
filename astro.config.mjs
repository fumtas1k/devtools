import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { injectSwBuildId } from './astro/integrations/inject-sw-build-id';
import { resolve } from 'node:path';

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
    plugins: [
      tailwindcss(),
      // regexp-tree / recheck は CJS のみのパッケージ。prerender（SSR）環境で Node ESM ローダー経由の
      // named import が失敗するため、Vite の Environment API で prerender/ssr 環境に対して
      // noExternal（Vite が CJS→ESM 変換）を適用する。
      // NOTE: Astro 6 の Environment API では vite.ssr.noExternal はグローバル設定だが
      // astro:environment プラグインが環境ごとに resolve.noExternal を上書きするため、
      // このプラグインで直接 prerender 環境の設定を拡張する必要がある。
      {
        name: 'devtools:cjs-noexternal',
        enforce: 'pre',
        configEnvironment(name, options) {
          if (name === 'prerender' || name === 'ssr') {
            const existing = Array.isArray(options.resolve?.noExternal)
              ? options.resolve.noExternal
              : [];
            return {
              resolve: {
                noExternal: [...existing, 'regexp-tree', 'recheck', 'synckit', '@pkgr/core'],
              },
            };
          }
        },
      },
    ],
    resolve: {
      // prerender/SSR 時は recheck の browser エントリ（lib/browser.js）を使用。
      // browser.js は synckit を使わない "pure" 実装で、Worker / synckit / @pkgr-core 依存がなく
      // Node.js SSR コンテキストでも安全に動作する（ブラウザでは Vite が自動的に browser フィールドを
      // 選択するため重複は無害）。
      alias: [{ find: 'recheck', replacement: resolve('node_modules/recheck/lib/browser.js') }],
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
