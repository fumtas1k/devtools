import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

// #176 A-1: <meta> CSP の style-src ディレクティブを除去するインライン統合。
// Astro の security.csp は style-src にも sha256 ハッシュを付与するが、
// CSP Level 2+ の仕様では 'unsafe-inline' はハッシュが存在すると無効化される。
// React の style="" 属性 (200+ 箇所) を段階的に廃止する B 案 PR まで、
// <meta> CSP から style-src を除き HTTP ヘッダ側 (_headers) の
// style-src 'self' 'unsafe-inline' のみで制御する。
// 参照: docs/decisions.md [064]
function stripMetaStyleSrc() {
  return {
    name: 'strip-meta-style-src',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const distDir = fileURLToPath(dir);
        const htmlFiles = [];
        for await (const f of glob('**/*.html', { cwd: distDir })) {
          htmlFiles.push(`${distDir}/${f}`);
        }
        for (const htmlFile of htmlFiles) {
          const content = readFileSync(htmlFile, 'utf-8');
          const modified = content.replace(
            /(<meta[^>]*http-equiv="content-security-policy"[^>]*content=")([^"]*?)(")/gi,
            (_, before, cspValue, after) => {
              // style-src ディレクティブ (セミコロンまたは末尾まで) を除去
              const stripped = cspValue
                .replace(/\s*style-src\s+[^;]+(;\s*|$)/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
              return `${before}${stripped}${after}`;
            }
          );
          if (modified !== content) {
            writeFileSync(htmlFile, modified, 'utf-8');
          }
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://devtools-d9w.pages.dev',
  integrations: [react(), sitemap(), stripMetaStyleSrc()],
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
    build: {
      // #246: Vite デフォルト 4KB 未満の asset を data: URI として CSS にインライン化
      // するが、`public/_headers` の CSP は `font-src` を明示しておらず default-src 'self'
      // で data:font が block される（@fontsource/jetbrains-mono の小さな subset font (cyrillic-ext 等)
      // が該当）。inline 化を無効化し dev/preview/prod の挙動を一致させる。
      assetsInlineLimit: 0,
    },
  },
});
