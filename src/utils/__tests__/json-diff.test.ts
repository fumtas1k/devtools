import { describe, expect, it } from 'vitest';
import { compareJson, MAX_JSON_DIFF_INPUT } from '../json-diff';

describe('compareJson', () => {
  it('オブジェクトのキー順と空白を無視し、文字列のエスケープを値として比較する', () => {
    expect(compareJson('{"b":"a","a":null}', '{ "a": null, "b": "\\u0061" }')).toMatchObject({
      ok: true,
      total: 0,
      changes: [],
    });
  });

  it('変更・削除・追加と曖昧でないパスを返す', () => {
    expect(compareJson('{"a/b":{"~":1},"removed":null}', '{"a/b":{"~":2},"":false}')).toMatchObject(
      {
        ok: true,
        total: 3,
        changes: [
          { kind: 'changed', path: '/a~1b/~0', before: '1', after: '2' },
          { kind: 'removed', path: '/removed', before: 'null' },
          { kind: 'added', path: '/', after: 'false' },
        ],
      }
    );
  });

  it('全文表示用の範囲は原文順で、変わった値と追加・削除のキーだけを示す', () => {
    const before = '{"remove":null,"b":2,"a":1,"same":1.0}';
    const after = '{"a":4,"b":3,"add":false,"same":1}';
    const result = compareJson(before, after);
    if (!result.ok) throw new Error('比較できませんでした');
    const excerpt = (text: string, ranges: { start: number; end: number }[]) =>
      ranges.map(({ start, end }) => text.slice(start, end));
    expect(excerpt(before, result.beforeRanges)).toEqual(['"remove":null', '2', '1']);
    expect(excerpt(after, result.afterRanges)).toEqual(['4', '3', '"add":false']);
  });

  it('配列は同じ添字で比べ、ルート値の型変更も表示する', () => {
    expect(compareJson('[1,2]', '[2,1,3]')).toMatchObject({
      ok: true,
      total: 3,
      changes: [{ path: '/0' }, { path: '/1' }, { path: '/2' }],
    });
    expect(compareJson('null', '{}')).toMatchObject({
      ok: true,
      changes: [{ path: '', before: 'null', after: '{}' }],
    });
  });

  it('丸めずに数を比較し、同値の小数・指数、-0 を同じとみなす', () => {
    expect(
      compareJson('[9007199254740992,1e999,1.00,-0]', '[9007199254740993,10e998,10e-1,0]')
    ).toMatchObject({
      ok: true,
      total: 1,
      changes: [{ path: '/0', before: '9007199254740992', after: '9007199254740993' }],
    });
  });

  it('両入力の構文エラーとエスケープ表記が異なる重複キーを拒否する', () => {
    expect(compareJson('{"a":1,"\\u0061":2}', '[1,]')).toMatchObject({
      ok: false,
      beforeError: expect.stringContaining('重複'),
      afterError: expect.stringContaining('行'),
    });
  });

  it('プロトタイプ由来の名前も普通の JSON キーとして比較する', () => {
    expect(compareJson('{"__proto__":1}', '{"constructor":2}')).toMatchObject({
      ok: true,
      total: 2,
      changes: [{ path: '/__proto__' }, { path: '/constructor' }],
    });
  });

  it('入力上限と深さ上限を超えた結果を返さない', () => {
    const max = '"' + 'a'.repeat(MAX_JSON_DIFF_INPUT - 2) + '"';
    expect(compareJson(max, max)).toMatchObject({ ok: true, total: 0 });
    expect(compareJson(max + ' ', 'null')).toMatchObject({
      ok: false,
      beforeError: expect.stringContaining('長すぎ'),
    });
    const nesting = (n: number) => '['.repeat(n) + '0' + ']'.repeat(n);
    expect(compareJson(nesting(128), nesting(128))).toMatchObject({ ok: true, total: 0 });
    expect(compareJson('null', nesting(129))).toMatchObject({
      ok: false,
      afterError: expect.stringContaining('深'),
    });
  });

  it('同じ長い先頭の後にある変更を、値の表示上限内で見せる', () => {
    const prefix = 'あ'.repeat(600);
    const result = compareJson(
      JSON.stringify({ x: prefix + '😀' }),
      JSON.stringify({ x: prefix + '😁' })
    );
    expect(result).toMatchObject({ ok: true, total: 1 });
    if (!result.ok) throw new Error('比較できませんでした');
    const [change] = result.changes;
    expect(change.before).toMatch(/^…あ+😀"$/u);
    expect(change.after).toMatch(/^…あ+😁"$/u);
    expect(change.after!.length).toBeLessThanOrEqual(502);
  });

  it('抜粋の両端でサロゲートペアを分断しない', () => {
    const prefix = 'a'.repeat(600) + '😀' + 'b'.repeat(31);
    const suffix = 'c'.repeat(465) + '😁' + 'd'.repeat(20);
    const json = (char: string) => JSON.stringify(prefix + char + suffix);
    const result = compareJson(json('X'), json('Y'));
    expect(result).toMatchObject({
      ok: true,
      changes: [
        {
          before: '…😀' + 'b'.repeat(31) + 'X' + 'c'.repeat(465) + '…',
          after: '…😀' + 'b'.repeat(31) + 'Y' + 'c'.repeat(465) + '…',
        },
      ],
    });
  });

  it('結果件数は全件集計し、表示行とプレビューだけを制限する', () => {
    const values = JSON.stringify(Array.from({ length: 201 }, () => 'a'.repeat(600)));
    const result = compareJson('[]', values);
    expect(result).toMatchObject({ ok: true, total: 201 });
    if (!result.ok) throw new Error('比較できませんでした');
    expect(result.changes).toHaveLength(200);
    expect(result.changes[0].after).toHaveLength(501);
    expect(result.changes[0].after?.endsWith('…')).toBe(true);
  });
});
