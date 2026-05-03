import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

// #176 A-1 / [064]: <meta> CSP の style-src ディレクティブを除去するインライン統合。
// Astro の security.csp は style-src にも sha256 ハッシュを付与するが、
// CSP Level 2+ の仕様では 'unsafe-inline' はハッシュが存在すると無効化される。
// React の style="" 属性 (200+ 箇所) を段階的に廃止する B 案 PR まで、
// <meta> CSP から style-src を除き HTTP ヘッダ側 (_headers) の
// style-src 'self' 'unsafe-inline' のみで制御する。
// 参照: docs/decisions.md [064]
//
// 実装: regex で `<meta>` タグを attribute 順序非依存に検出し、
// http-equiv が "content-security-policy" のものだけ content から style-src を除去する。
// 失敗時 (HTML ファイル無し / 書き込み失敗 / CSP meta 1 件も見つからず) は明示的に throw し
// silent-pass を防ぐ（B 案完了まで暫定の defense-in-depth）。
function stripMetaStyleSrc() {
  return {
    name: 'strip-meta-style-src',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const htmlFiles = [];
        for await (const f of glob('**/*.html', { cwd: distDir })) {
          htmlFiles.push(`${distDir}/${f}`);
        }
        if (htmlFiles.length === 0) {
          throw new Error(
            'strip-meta-style-src: dist に HTML ファイルが 1 件も無い。' +
              'build 失敗 or 出力先の不一致を疑う。'
          );
        }

        let strippedCount = 0;
        for (const htmlFile of htmlFiles) {
          const content = readFileSync(htmlFile, 'utf-8');
          // <meta ...> タグを順次列挙し、attribute 順序非依存に http-equiv と content を抽出する
          const modified = content.replace(/<meta\s+([^>]+?)\s*\/?>/gi, (full, attrs) => {
            const httpEquivMatch = attrs.match(/\bhttp-equiv\s*=\s*"([^"]*)"/i);
            if (!httpEquivMatch) return full;
            if (httpEquivMatch[1].toLowerCase() !== 'content-security-policy') return full;
            const contentMatch = attrs.match(/\bcontent\s*=\s*"([^"]*)"/i);
            if (!contentMatch) return full;
            const cspValue = contentMatch[1];
            const stripped = cspValue
              .replace(/\s*style-src\s+[^;]+(;\s*|$)/g, ' ')
              .trim()
              .replace(/\s+/g, ' ');
            // 元の attributes 文字列内で content="..." だけを書き換える
            const newAttrs = attrs.replace(/\bcontent\s*=\s*"[^"]*"/i, `content="${stripped}"`);
            return full.replace(attrs, newAttrs);
          });
          if (modified !== content) {
            try {
              writeFileSync(htmlFile, modified, 'utf-8');
            } catch (err) {
              throw new Error(`strip-meta-style-src: ${htmlFile} の書き込みに失敗: ${err.message}`);
            }
            strippedCount++;
          }
        }

        if (strippedCount === 0) {
          throw new Error(
            'strip-meta-style-src: ' +
              `dist の ${htmlFiles.length} 件の HTML から CSP meta tag を 1 件も見つけられず、` +
              'style-src を除去できなかった。security.csp の設定や Astro の <meta> 出力仕様変更を疑う。'
          );
        }

        logger.info?.(
          `strip-meta-style-src: ${strippedCount}/${htmlFiles.length} HTML から style-src を除去`
        );
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
