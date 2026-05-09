import { readdir, copyFile, mkdir, writeFile } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { existsSync } from 'fs';

// VRT スライダーレポート生成
// test-results/ の *-actual.png と tests/e2e/.../snapshots/ のベースラインを突き合わせて
// img-comparison-slider 入りの HTML を vrt-slider-report/ に生成する。
//
// ファイル名の対応:
//   actual:   test-results/**/{snapshot-name}-actual.png
//   baseline: tests/e2e/visual-regression.spec.ts-snapshots/{snapshot-name}.png
//   diff:     test-results/**/{snapshot-name}-diff.png

const SNAPSHOTS_DIR = 'tests/e2e/visual-regression.spec.ts-snapshots';
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

function makeLabel(snapshotBase) {
  return snapshotBase
    .replace(/^visual-regression---/, '')
    .replace(/-の-screenshot-が-baseline-と一致-\d+-visual-regression-linux$/, '')
    .replace(/^(desktop|mobile)-(\d+x\d+)-/, '[$1 $2] ');
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

  for (const actualPath of actualFiles) {
    const actualName = basename(actualPath);
    const snapshotBase = actualName.replace(/-actual\.png$/, '');
    const snapshotFileName = snapshotBase + '.png';
    const baselinePath = join(SNAPSHOTS_DIR, snapshotFileName);
    const diffPath = join(dirname(actualPath), snapshotBase + '-diff.png');

    if (!existsSync(baselinePath)) {
      console.warn(`baseline が見つかりません: ${baselinePath}`);
      continue;
    }

    const id = snapshotBase.replace(/[^\w]/g, '_');
    const label = makeLabel(snapshotBase);
    const hasDiff = existsSync(diffPath);

    await copyFile(actualPath, join(imagesDir, `${id}-actual.png`));
    await copyFile(baselinePath, join(imagesDir, `${id}-baseline.png`));
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
