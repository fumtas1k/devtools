import { describe, it, expect } from 'vitest';
import { parseRegex, parseToRegExpTree } from '../parse';

describe('parseRegex', () => {
  it('単一文字を Char ノードにする', () => {
    const root = parseRegex('a', '');
    expect(root.children[0].type).toBe('Char');
    expect(root.children[0].label).toContain('a');
  });

  // 回帰防止: 先読み/後読みの内部式は node.assertion にあり、childrenOf がこれを参照しないと
  // 構造ツリーで lookaround が childless になる（PR #492 レビュー指摘・鉄道図との不整合）。
  it('先読み (?=foo) の内部式が子として展開される', () => {
    const root = parseRegex('(?=foo)', '');
    const assertion = root.children[0];
    expect(assertion.type).toBe('Assertion');
    expect(assertion.children.length).toBeGreaterThan(0);
  });

  it('単純アンカー ^ は子を持たない', () => {
    const root = parseRegex('^a', '');
    expect(root.children[0].type).toBe('Assertion');
    expect(root.children[0].children).toHaveLength(0);
  });

  it('量指定子付きグループを Repetition > Group で表現する', () => {
    const root = parseRegex('(ab)+', '');
    const rep = root.children[0];
    expect(rep.type).toBe('Repetition');
    expect(rep.label).toContain('1 回以上');
    expect(rep.children[0].type).toBe('Group');
  });

  it('選択肢を Disjunction にする', () => {
    const root = parseRegex('a|b', '');
    expect(root.children[0].type).toBe('Disjunction');
    expect(root.children[0].children).toHaveLength(2);
  });

  it('各ノードに pattern 基準の loc（offset-1 補正済み）を持つ', () => {
    const root = parseRegex('a+', '');
    // '/a+/' の Repetition 'a+' は offset 1..3 → pattern 基準 0..2
    expect(root.children[0].loc).toEqual({ start: 0, end: 2 });
  });

  it('不正な正規表現で例外を投げる', () => {
    expect(() => parseRegex('(', '')).toThrow();
  });

  it('不正なフラグで例外を投げる', () => {
    expect(() => parseRegex('a', 'Z')).toThrow();
  });

  // #489: engine の英語 SyntaxError を日本語見出し付きへ変換する
  it('不正な正規表現のエラーメッセージが日本語見出しで始まる', () => {
    expect(() => parseRegex('(', '')).toThrow(/^正規表現が不正です: /);
  });

  it('英語詳細（不正箇所・理由）を見出しの後に保持する', () => {
    // detail は engine 依存だが、重複する "Invalid regular expression: " 接頭辞は除去される
    let message = '';
    try {
      parseRegex('(', '');
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/^正規表現が不正です: /);
    expect(message).not.toMatch(/Invalid regular expression:/i);
    // 不正箇所の詳細（"Unterminated group" 等）が残っている
    expect(message.length).toBeGreaterThan('正規表現が不正です: '.length);
  });

  it('不正なフラグのエラーも日本語見出しで始まる', () => {
    expect(() => parseRegex('a', 'Z')).toThrow(/^正規表現が不正です: /);
  });
});

describe('parseToRegExpTree', () => {
  it('captureLocations 付きの生 AST を返す', () => {
    const ast = parseToRegExpTree('a+', '');
    expect(ast.type).toBe('RegExp');
    expect(ast.body).toBeTruthy();
    // loc.start.offset が付く（/a+/ の body は offset 1..3）
    expect((ast.body as { loc: { start: { offset: number } } }).loc.start.offset).toBe(1);
  });

  it('不正な正規表現で例外を投げる', () => {
    expect(() => parseToRegExpTree('(', '')).toThrow();
  });
});
