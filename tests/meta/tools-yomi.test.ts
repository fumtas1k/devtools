import { describe, it, expect } from 'vitest';
import { tools } from '@/data/tools';

/**
 * meta test: tools.ts の yomi フィールド妥当性検証 (PR #468 レビュー指摘1)
 *
 * 表示順は `yomi` の五十音ソートで構造的に決まるため「順序そのもの」を強制する guard は
 * 不要だが、`yomi` の *入力値* が壊れる (カタカナ / 漢字 / 空文字 / 重複) と CI を通過した
 * まま並び順だけ静かに崩れる (漢字は読みでなく codepoint で collate される)。
 * TypeScript は `yomi: string` の存在しか保証しないため、ここで invariant を CI で強制する。
 * decisions.md [084] が明記した「yomi は読み仮名の主観が入る」保守リスクの機械的ガード。
 */

// ひらがな (小書き含む) + ゔ + 長音符 のみ許可
const HIRAGANA_YOMI = /^[ぁ-んゔー]+$/;

/** ひらがな(＋長音符)以外 / 空文字 の yomi を持つ tool slug を返す純粋関数 (陰性/陽性で共有) */
function findInvalidYomi(toolList: { slug: string; yomi: string }[]): string[] {
  return toolList.filter((t) => !HIRAGANA_YOMI.test(t.yomi)).map((t) => t.slug);
}

/** 重複している yomi 値を返す純粋関数 (陰性/陽性で共有) */
function findDuplicateYomi(toolList: { yomi: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const t of toolList) counts.set(t.yomi, (counts.get(t.yomi) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([yomi]) => yomi);
}

describe('tools.ts yomi 妥当性', () => {
  it('全 yomi がひらがな(＋長音符)のみ・非空である', () => {
    expect(findInvalidYomi(tools)).toEqual([]);
  });

  it('yomi に重複がない (重複すると同 yomi 間の順序が追加順依存になる)', () => {
    expect(findDuplicateYomi(tools)).toEqual([]);
  });
});

// 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠)。
// findInvalidYomi / findDuplicateYomi を空回り実装 (常に []) に差し替えると下記は必ず fail する。
describe('[陽性対照] yomi 妥当性 検知機構', () => {
  it('カタカナ yomi を検出する', () => {
    expect(findInvalidYomi([{ slug: 'katakana', yomi: 'カタカナ' }])).toEqual(['katakana']);
  });

  it('漢字 yomi を検出する', () => {
    expect(findInvalidYomi([{ slug: 'kanji', yomi: '漢字' }])).toEqual(['kanji']);
  });

  it('空文字 yomi を検出する', () => {
    expect(findInvalidYomi([{ slug: 'empty', yomi: '' }])).toEqual(['empty']);
  });

  it('正常 + 不正の混在で不正のみ列挙する (過検知なし)', () => {
    const fixture = [
      { slug: 'ok', yomi: 'ゆーあーる' },
      { slug: 'ng-kana', yomi: 'カタカナ' },
      { slug: 'ng-kanji', yomi: '漢字混じり' },
    ];
    expect(findInvalidYomi(fixture).sort()).toEqual(['ng-kana', 'ng-kanji']);
  });

  it('全件ひらがな (小書き / 長音符 / っ / ゔ 含む) fixture では何も検出しない (過検知なし)', () => {
    const fixture = [
      { slug: 'a', yomi: 'あいうえお' },
      { slug: 'b', yomi: 'きゅーあーる' },
      { slug: 'c', yomi: 'じょっと' },
      { slug: 'd', yomi: 'ゔぁいおりん' },
    ];
    expect(findInvalidYomi(fixture)).toEqual([]);
  });
});

describe('[陽性対照] yomi 重複検知機構', () => {
  it('重複 yomi を検出する', () => {
    const fixture = [{ yomi: 'おなじ' }, { yomi: 'べつ' }, { yomi: 'おなじ' }];
    expect(findDuplicateYomi(fixture)).toEqual(['おなじ']);
  });

  it('全件ユニーク fixture では何も検出しない (過検知なし)', () => {
    const fixture = [{ yomi: 'あ' }, { yomi: 'い' }, { yomi: 'う' }];
    expect(findDuplicateYomi(fixture)).toEqual([]);
  });
});
