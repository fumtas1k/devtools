import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tools } from '@/data/tools';

/**
 * meta test: ツールアイコン付与漏れ検出 (issue #496 再発防止策)
 *
 * `src/data/tools.ts` に登録した全 tool slug が `src/components/ui/ToolIcon.astro` に
 * アイコン定義（`slug === '...'` の SVG ブロック）を持つかを機械的に検証する。
 *
 * 背景: `ToolIcon` は該当 slug 不在時に fallback を持たず、トップカード / サイドバー /
 * ドロワー / ツールページヘッダで空白アイコンが無言で描画される。実際に
 * sql-formatter / regex-visualizer は #490〜#492 の追加時にアイコン付与が漏れ、
 * #494 で後追い修正したが CI も VRT も「空白アイコン」を regression として検知できなかった。
 * 本 test を CI (`npm run test`) で走らせることで、新規ツール追加 PR で付与漏れが
 * merge 前に必ず fail として検知される。
 *
 * 取得方法 (a): ToolIcon.astro のソースを read して slug を正規表現抽出する。
 * 実レンダリング元（SVG ブロック）が唯一の真実源となりドリフトしない。
 */

const iconSrcPath = fileURLToPath(
  new URL('../../src/components/ui/ToolIcon.astro', import.meta.url)
);

/** ToolIcon.astro ソースから `slug === '...'` の slug を列挙する純粋関数 (fixture 注入可能) */
function extractIconSlugs(source: string): string[] {
  const slugs: string[] = [];
  const re = /slug === '([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    slugs.push(m[1]);
  }
  return slugs;
}

/** アイコン定義を持たない tool slug を返す純粋関数 (陰性/陽性両対照で共有) */
function findMissingIcons(toolList: { slug: string }[], iconSlugs: string[]): string[] {
  const iconSet = new Set(iconSlugs);
  return toolList.filter((t) => !iconSet.has(t.slug)).map((t) => t.slug);
}

/** tools.ts に対応する slug が無い orphan アイコン slug を返す純粋関数 */
function findOrphanIcons(toolList: { slug: string }[], iconSlugs: string[]): string[] {
  const toolSet = new Set(toolList.map((t) => t.slug));
  return iconSlugs.filter((slug) => !toolSet.has(slug));
}

const realSource = readFileSync(iconSrcPath, 'utf8');
const iconSlugs = extractIconSlugs(realSource);

describe('ToolIcon アイコンカバレッジ', () => {
  it('ToolIcon.astro から slug を 1 つ以上抽出できる (regex 形式破壊の sanity)', () => {
    // 抽出が 0 件だと全ツールが「漏れ」扱いになり別 test が誤検知するため、
    // 抽出器が live ソースに対して機能していることを先に保証する。
    expect(iconSlugs.length).toBeGreaterThan(0);
  });

  it('src/data/tools.ts の全 tool slug が ToolIcon.astro にアイコン定義を持つ', () => {
    const missing = findMissingIcons(tools, iconSlugs);
    expect(missing).toEqual([]);
  });
});

describe('ToolIcon orphan 検出', () => {
  it('ToolIcon.astro に定義されているが tools.ts に対応 slug が無い orphan アイコンが無い', () => {
    const orphans = findOrphanIcons(tools, iconSlugs);
    expect(orphans).toEqual([]);
  });
});

// 陽性対照: 抽出器が空回りしていないことを保証 (test-gates skill 準拠)。
// fixture 文字列を注入し、抽出が「常に空」「常に全部」ではなく実際に拾うことを証明する。
describe('[陽性対照] extractIconSlugs 抽出機構', () => {
  it("slug === '...' ブロックを含む fixture から該当 slug を抽出する", () => {
    const fixture = `
      { slug === 'fixture-a' && (<svg><path d="M0 0" /></svg>) }
      { slug === 'fixture-b' && (<svg><circle cx="1" cy="1" r="1" /></svg>) }
    `;
    expect(extractIconSlugs(fixture)).toEqual(['fixture-a', 'fixture-b']);
  });

  it('slug 定義が無い fixture からは何も抽出しない (過検知なし)', () => {
    const fixture = `<svg><path d="M0 0" /></svg>`;
    expect(extractIconSlugs(fixture)).toEqual([]);
  });
});

// 陽性対照: 付与漏れ検知機構が空回りしていないことを保証。
describe('[陽性対照] 付与漏れ検知機構', () => {
  it('アイコン未定義の slug を fixture に注入すると findMissingIcons が検出する', () => {
    const missing = findMissingIcons([{ slug: 'no-icon-fake-tool' }], iconSlugs);
    expect(missing).toEqual(['no-icon-fake-tool']);
  });

  it('定義済み + 未定義の混在 fixture で未定義のみを列挙する (過検知なし)', () => {
    const fakeTools = [
      { slug: 'fake-a' },
      { slug: 'url-encode' }, // 既存 (アイコン定義済み)
      { slug: 'fake-b' },
    ];
    const missing = findMissingIcons(fakeTools, iconSlugs);
    expect(missing.sort()).toEqual(['fake-a', 'fake-b']);
  });

  it('全アイコン定義済み fixture では何も検出しない (過検知なし)', () => {
    const missing = findMissingIcons([{ slug: 'url-encode' }, { slug: 'qr-code' }], iconSlugs);
    expect(missing).toEqual([]);
  });
});

// 陽性対照: orphan 検知機構が空回りしていないことを保証。
describe('[陽性対照] orphan 検知機構', () => {
  it('tools.ts に無いアイコン slug を注入すると findOrphanIcons が検出する', () => {
    const orphans = findOrphanIcons([{ slug: 'url-encode' }], ['url-encode', 'orphan-fake']);
    expect(orphans).toEqual(['orphan-fake']);
  });

  it('全アイコンが tools.ts に対応する fixture では何も検出しない (過検知なし)', () => {
    const orphans = findOrphanIcons(
      [{ slug: 'url-encode' }, { slug: 'qr-code' }],
      ['url-encode', 'qr-code']
    );
    expect(orphans).toEqual([]);
  });
});
