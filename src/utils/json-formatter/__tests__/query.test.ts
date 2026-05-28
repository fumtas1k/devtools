import { describe, it, expect } from 'vitest';
import { runQuery } from '../query';

// 陰性対照: 正しい式は ok:true で期待値を返す。
describe('runQuery 陰性対照（正常系）', () => {
  it('ナビゲーションで値を取り出す', () => {
    const r = runQuery({ location: { lat: 35.6 } }, 'location.lat');
    expect(r).toEqual({ ok: true, result: 35.6 });
  });

  it('ワイルドカードで配列要素を射影する', () => {
    const r = runQuery({ items: [{ id: 1 }, { id: 2 }] }, 'items[*].id');
    expect(r.ok && r.result).toEqual([1, 2]);
  });

  it('フィルタ条件で抽出する（バッククォートはリテラル）', () => {
    const data = { items: [{ price: 5 }, { price: 20 }] };
    const r = runQuery(data, 'items[?price > `10`].price');
    expect(r.ok && r.result).toEqual([20]);
  });

  it('該当なしは null を返す（throw しない）', () => {
    const r = runQuery({ a: 1 }, 'nope');
    expect(r).toEqual({ ok: true, result: null });
  });
});

// 陽性対照（別 describe）: 不正式を必ず検知する。
// 「常に ok:true」の空回り実装に当てると fail する。
describe('runQuery 陽性対照（不正式を検知）', () => {
  it('構文エラーの式は ok:false とエラー詳細を返す', () => {
    const r = runQuery({ a: 1 }, 'items[?(');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('クエリ式が不正です');
  });
});
