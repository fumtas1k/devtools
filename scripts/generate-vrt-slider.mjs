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

function sanitizeId(s) {
  return s.replace(/[^\w]/g, '_').slice(0, 80);
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateHTML(comparisons) {
  const navItems = comparisons
    .map(({ label, id }) => `<li><a href="#${id}">${esc(label)}</a></li>`)
    .join('\n      ');

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
  <script type="module" src="https://unpkg.com/img-comparison-slider@8/dist/index.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/img-comparison-slider@8/dist/styles.css">
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
    img-comparison-slider{width:100%;--default-handle-color:#1e40af;--default-handle-width:3px}
    img-comparison-slider img{width:100%;display:block}
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
  <p>← スライドして比較 &nbsp;|&nbsp; 左: <strong>Baseline（期待値）</strong> &nbsp; 右: <strong>Actual（実際）</strong></p>
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

  const comparisons = [];
  const seenIds = new Set();

  for (const actualPath of actualFiles) {
    const dir = dirname(actualPath);
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
    // retry attempt は別 dir になるため最初のものだけ slider に載せる。
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
