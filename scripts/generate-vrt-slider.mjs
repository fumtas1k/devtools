import { readdir, copyFile, mkdir, writeFile } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';

// VRT スライダーレポート生成
// test-results/ の *-actual.png と隣接する *-expected.png を使って
// img-comparison-slider 入りの HTML を vrt-slider-report/ に生成する。
//
// ファイル名の対応:
//   actual:   test-results/**/{trimmed-base}-actual.png
//   baseline: test-results/**/{trimmed-base}-expected.png  (Playwright が物理コピー)
//   diff:     test-results/**/{trimmed-base}-diff.png
//   ラベル整形: 同 dir の error-context.md から best-effort で full title 復元
//
// Playwright 1.59 は attachment ファイル名を windowsFilesystemFriendlyLength=60 で
// truncate する (node_modules/playwright/lib/util.js の trimLongString)。
// baseline (snapshots/) と attachment の名前が一致しないため、snapshots/ は参照せず
// test-results/ 内の -expected.png を直接利用する (issue #362)。

const TEST_RESULTS_DIR = 'test-results';
const OUTPUT_DIR = 'vrt-slider-report';

// img-comparison-slider を npm dep として同梱する (#352)。
// unpkg CDN は SLA なし・SRI hash なし・patch ロード不確定のため、
// node_modules からビルド済みファイルを `vrt-slider-report/lib/` にコピーし
// HTML はローカル相対パスで参照する。
const SLIDER_LIB_SOURCE_DIR = 'node_modules/img-comparison-slider/dist';
const SLIDER_LIB_OUTPUT_DIR = 'lib';
const SLIDER_LIB_FILES = ['index.js', 'styles.css'];

async function findFiles(dir, suffix) {
  const results = [];
  if (!existsSync(dir)) {
    return results;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFiles(full, suffix);
      results.push(...nested);
    } else if (entry.name.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results;
}

function makeLabel(trimmedBase) {
  return trimmedBase
    .replace(/^visual-regression---/, '')
    .replace(/-の-screenshot-が-baseline-と一致-\d+-visual-regression-linux$/, '')
    .replace(/^(desktop|mobile)-(\d+x\d+)-/, '[$1 $2] ');
}

/**
 * error-context.md の Playwright literal template (`- Name:` 行) を parse して
 * `[viewport WxH] /url` 形式の整形ラベルを返す。失敗時 null。
 * Playwright 1.59 の node_modules/playwright/lib/errorContext.js が source of truth。
 * format が将来変わっても null を返すだけで slider 本体は動く。
 */
export function makeLabelFromContextContent(content) {
  if (typeof content !== 'string') return null;
  const m = content.match(/^- Name:\s*(.+)$/m);
  if (!m) return null;
  const parts = m[1].split(' >> ');
  if (parts.length < 3) return null;
  const describe = parts[parts.length - 2];
  const title = parts[parts.length - 1];
  const vp = describe.match(/(\w+)\s*\((\d+x\d+)\)/);
  const url = title.replace(/\s*の\s*screenshot.*$/, '');
  if (!vp) return null;
  return `[${vp[1]} ${vp[2]}] ${url}`;
}

// existsSync で先に確認するのは「ファイル無し」ケースを ENOENT 例外なく判別するため。
// try/catch だけでも動作するが、race condition (確認後に削除) は対象外の前提
// (本スクリプトは CI runner 上で test 直後に走るため別プロセスの干渉は想定しない)。
function makeLabelFromContextPath(errorContextPath) {
  if (!existsSync(errorContextPath)) return null;
  let content;
  try {
    content = readFileSync(errorContextPath, 'utf-8');
  } catch {
    return null;
  }
  return makeLabelFromContextContent(content);
}

// 上限 80 は念のための過剰防衛。Playwright の test directory 名は実質
// windowsFilesystemFriendlyLength=60 + SHA1 5 桁で収まるため通常 80 は超えない。
// HTML 出力サイズ膨張の予防線として残す。
function sanitizeId(s) {
  return s.replace(/[^\w]/g, '_').slice(0, 80);
}

/**
 * Playwright の retry attempt 用 dir かどうかを判定。
 * Playwright は retry 時に `<test-dir>-retry1`, `-retry2` のような suffix を付けて
 * 別 dir を作る。同じ test の再試行を slider に重複表示しないため、本判定で skip する。
 *
 * 注意: sanitize 前の raw な basename(dir) を渡すこと
 * (sanitize 後だと `slice(0, 80)` で `-retry1` が途中で切れる場合がある)。
 */
export function isRetryDir(dirName) {
  return /-retry\d+$/.test(dirName);
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateHTML(comparisons) {
  const navItems = comparisons
    .map(({ label, id }) => `<li><a href="#${id}">${esc(label)}</a></li>`)
    .join('\n      ');

  // handle slot に左右矢印 SVG を入れて「drag できる UI」であることを視覚的に示す。
  // 矢印アイコン単独では PointerDown が拾えない場合があるため、circle 背景で十分な
  // クリック領域 (40px) を確保する。
  const handleSvg = `<svg slot="handle" class="handle-icon" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="22" fill="#1e40af" stroke="#fff" stroke-width="3"/>
        <path d="M40 42 L32 50 L40 58" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M60 42 L68 50 L60 58" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

  const cards = comparisons
    .map(
      ({ label, id, hasDiff }) => `
  <section id="${id}" class="card">
    <h2>${esc(label)}</h2>
    <img-comparison-slider>
      <figure slot="first">
        <img src="images/${id}-baseline.png" alt="Baseline">
        <figcaption>Baseline（期待値）</figcaption>
      </figure>
      <figure slot="second">
        <img src="images/${id}-actual.png" alt="Actual">
        <figcaption>Actual（実際）</figcaption>
      </figure>
      ${handleSvg}
    </img-comparison-slider>${
      hasDiff
        ? `
    <details>
      <summary>Diff 画像を表示</summary>
      <img class="diff-img" src="images/${id}-diff.png" alt="Diff">
    </details>`
        : ''
    }
  </section>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>VRT Diff Viewer</title>
  <script type="module" src="lib/index.js"></script>
  <link rel="stylesheet" href="lib/styles.css">
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,sans-serif;margin:0;background:#f3f4f6;color:#111}
    header{background:#1e3a8a;color:#fff;padding:1rem 1.5rem}
    header h1{margin:0;font-size:1.2rem}
    header p{margin:.25rem 0 0;font-size:.85rem;opacity:.85}
    nav{background:#fff;border-bottom:1px solid #e5e7eb;padding:.6rem 1.5rem;position:sticky;top:0;z-index:10}
    nav ul{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:.4rem}
    nav a{font-size:.75rem;color:#1e40af;text-decoration:none;background:#eff6ff;padding:.2rem .45rem;border-radius:4px}
    nav a:hover{background:#dbeafe}
    main{max-width:1200px;margin:0 auto;padding:1.5rem}
    .badge{display:inline-block;background:#dc2626;color:#fff;font-size:.75rem;font-weight:600;padding:.2rem .5rem;border-radius:4px;margin-bottom:1rem}
    .card{background:#fff;border-radius:8px;padding:1.5rem;margin-bottom:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.1)}
    h2{margin:0 0 .75rem;font-size:.9rem;color:#374151;word-break:break-all}
    img-comparison-slider{width:100%;cursor:ew-resize;--default-handle-color:#1e40af;--default-handle-width:6px;--default-handle-opacity:1}
    img-comparison-slider img{width:100%;display:block}
    .handle-icon{width:48px;height:48px;cursor:ew-resize;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35));transition:transform .15s ease}
    @media (hover:hover){.handle-icon:hover{transform:scale(1.1)}}
    figure{margin:0;position:relative}
    figcaption{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);color:#fff;font-size:.7rem;padding:.2rem .5rem}
    details{margin-top:.75rem}
    summary{cursor:pointer;color:#1e40af;font-size:.85rem}
    .diff-img{width:100%;margin-top:.4rem;border:1px solid #fecaca}
  </style>
</head>
<body>
<header>
  <h1>🖼️ Visual Regression Diff Viewer</h1>
  <p>中央の <strong>⇆ ハンドル</strong> を左右に drag して比較 &nbsp;|&nbsp; 左半分: <strong>Baseline（期待値）</strong> &nbsp; 右半分: <strong>Actual（実際）</strong></p>
</header>
<nav>
  <ul>
      ${navItems}
  </ul>
</nav>
<main>
  <p class="badge">${comparisons.length} 件の差分</p>
  ${cards}
</main>
</body>
</html>`;
}

async function main() {
  const actualFiles = await findFiles(TEST_RESULTS_DIR, '-actual.png');

  if (actualFiles.length === 0) {
    console.log('差分なし — スライダーレポートの生成をスキップ');
    return;
  }

  const imagesDir = join(OUTPUT_DIR, 'images');
  await mkdir(imagesDir, { recursive: true });

  // img-comparison-slider のビルド済みファイルを `vrt-slider-report/lib/` にコピー (#352)。
  // node_modules 配置に依存するが、CI は本スクリプト実行前に `npm ci` を済ませており
  // ローカル実行も同様の前提。欠落時は ENOENT で早期失敗させ CDN fallback はしない
  // (silent に CDN へ落ちる旧挙動を温存すると再現性保証の意義が失われるため)。
  const libDir = join(OUTPUT_DIR, SLIDER_LIB_OUTPUT_DIR);
  await mkdir(libDir, { recursive: true });
  for (const file of SLIDER_LIB_FILES) {
    const source = join(SLIDER_LIB_SOURCE_DIR, file);
    if (!existsSync(source)) {
      throw new Error(
        `img-comparison-slider 配下のファイルが見つかりません: ${source}\n` +
          '`npm ci` を実行して devDependency を導入してから再実行してください。'
      );
    }
    await copyFile(source, join(libDir, file));
  }

  const comparisons = [];
  const seenIds = new Set();

  for (const actualPath of actualFiles) {
    const dir = dirname(actualPath);

    // retry attempt の dir (`-retry1`, `-retry2` 等) は skip。
    // 同じ test の再試行を slider に重複表示しないため (initial attempt のみ採用)。
    if (isRetryDir(basename(dir))) continue;

    const actualName = basename(actualPath);
    const trimmedBase = actualName.replace(/-actual\.png$/, '');

    // baseline は同 dir の -expected.png を使う (Playwright が物理コピー済)。
    // baseline 名を文字列復元する F 案より堅牢: attachment と baseline の
    // 名前不一致 (windowsFilesystemFriendlyLength=60 truncate) は構造的に発生しない。
    const expectedPath = join(dir, `${trimmedBase}-expected.png`);
    const diffPath = join(dir, `${trimmedBase}-diff.png`);

    if (!existsSync(expectedPath)) {
      console.warn(`expected が見つかりません (skip): ${expectedPath}`);
      continue;
    }

    // ラベルは error-context.md から best-effort で full title 復元。
    // 失敗時は truncated 名のまま (UX は劣化するが slider 機能は止まらない)。
    const errorContextPath = join(dir, 'error-context.md');
    const label = makeLabelFromContextPath(errorContextPath) ?? makeLabel(trimmedBase);

    // id は test directory 名で組む (Playwright が unique 保証)。
    // 防御的 dedup: 同 id が複数発生する未知ケース (Playwright の dir 命名衝突等)
    // でも 1 件に絞る。retry attempt は別 dir 扱いのため通常 hit しない。
    const id = sanitizeId(basename(dir));
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const hasDiff = existsSync(diffPath);
    await copyFile(actualPath, join(imagesDir, `${id}-actual.png`));
    await copyFile(expectedPath, join(imagesDir, `${id}-baseline.png`));
    if (hasDiff) {
      await copyFile(diffPath, join(imagesDir, `${id}-diff.png`));
    }

    comparisons.push({ label, id, hasDiff });
  }

  if (comparisons.length === 0) {
    console.log('有効な比較ペアなし — スキップ');
    return;
  }

  await writeFile(join(OUTPUT_DIR, 'index.html'), generateHTML(comparisons), 'utf-8');
  console.log(`VRT スライダーレポート生成完了: ${comparisons.length} 件`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
