import { describe, it, expect } from 'vitest';
import {
  kataToHira,
  normalizeQuery,
  buildSearchText,
  queryTokens,
  matchesSearchText,
} from '@/utils/tool-search';
import { tools, categoryLabel, type Tool } from '@/data/tools';

const bySlug = (slug: string): Tool => {
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) throw new Error(`fixture tool not found: ${slug}`);
  return tool;
};

// 本番の index.astro と同じ経路: ビルド時に buildSearchText で haystack を作り、
// 実行時に matchesSearchText（トークン AND マッチ）で判定する。
const matches = (tool: Tool, query: string): boolean =>
  matchesSearchText(buildSearchText(tool, categoryLabel), query);

// ────────────────────────────────────────────
// kataToHira / normalizeQuery
// ────────────────────────────────────────────
describe('kataToHira', () => {
  it('カタカナをひらがなへ変換する', () => {
    expect(kataToHira('ジェイソン')).toBe('じぇいそん');
  });

  it('長音符・中黒・ひらがな・英数字はそのまま残す', () => {
    expect(kataToHira('コードー・abc123あ')).toBe('こーどー・abc123あ');
  });
});

describe('normalizeQuery', () => {
  it('前後空白除去・小文字化・カタカナ統一をまとめて適用する', () => {
    expect(normalizeQuery('  JSON  ')).toBe('json');
    expect(normalizeQuery('ジェイソン')).toBe('じぇいそん');
  });
});

describe('queryTokens', () => {
  it('空白区切りで複数トークンに分割し正規化する', () => {
    expect(queryTokens('  JSON  CSV ')).toEqual(['json', 'csv']);
  });

  it('空文字・空白のみは空配列になる', () => {
    expect(queryTokens('')).toEqual([]);
    expect(queryTokens('   ')).toEqual([]);
  });
});

// ────────────────────────────────────────────
// 陽性対照: マッチすべきものが確実にヒットする
// （マッチ判定が常に false を返すバグを検出できる）
// ────────────────────────────────────────────
describe('検索マッチ（陽性対照）', () => {
  const jsonTools = [bySlug('json-xml'), bySlug('json-csv')];

  it('英字 slug 由来の語「json」で JSON 系ツールにヒットする', () => {
    for (const tool of jsonTools) expect(matches(tool, 'json')).toBe(true);
  });

  it('大文字「JSON」でも小文字化されてヒットする', () => {
    for (const tool of jsonTools) expect(matches(tool, 'JSON')).toBe(true);
  });

  it('ひらがな読み「じぇいそん」で yomi にヒットする', () => {
    for (const tool of jsonTools) expect(matches(tool, 'じぇいそん')).toBe(true);
  });

  it('カタカナ「ジェイソン」もひらがな正規化でヒットする', () => {
    for (const tool of jsonTools) expect(matches(tool, 'ジェイソン')).toBe(true);
  });

  it('説明文中の語にヒットする', () => {
    // url-encode の説明: 「テキストとURLエンコード形式を相互変換します」
    expect(matches(bySlug('url-encode'), '相互変換')).toBe(true);
  });

  it('カテゴリ名にヒットする', () => {
    // base64 は encode カテゴリ（ラベル「エンコード・デコード」）
    expect(matches(bySlug('base64'), 'エンコード')).toBe(true);
  });

  it('複数語クエリ「json csv」は全トークンを含む json-csv にヒットする', () => {
    expect(matches(bySlug('json-csv'), 'json csv')).toBe(true);
  });

  it('複数語クエリはトークン順に依存しない（「csv json」でもヒット）', () => {
    expect(matches(bySlug('json-csv'), 'csv json')).toBe(true);
  });
});

// ────────────────────────────────────────────
// 陰性対照: マッチすべきでないものはヒットしない
// （マッチ判定が常に true を返すバグを検出できる）
// ────────────────────────────────────────────
describe('検索マッチ（陰性対照）', () => {
  it('どのツールにも含まれない語はゼロ件になる', () => {
    const hit = tools.filter((t) => matches(t, 'zzzqqqxxx存在しない語'));
    expect(hit).toHaveLength(0);
  });

  it('「json」は無関係なツール（QRコード生成）にヒットしない', () => {
    expect(matches(bySlug('qr-code'), 'json')).toBe(false);
  });

  it('複数語 AND: 「json csv」は csv を含まない json-xml にヒットしない', () => {
    // 単一トークンの json は一致するが csv が一致しないため AND で false。
    // （AND ではなく OR 実装だと true になり、この陰性対照が落ちる）
    expect(matches(bySlug('json-xml'), 'json csv')).toBe(false);
  });

  it('空クエリ・空白のみクエリはヒットしない', () => {
    expect(matches(bySlug('json-csv'), '')).toBe(false);
    expect(matches(bySlug('json-csv'), '   ')).toBe(false);
  });
});
