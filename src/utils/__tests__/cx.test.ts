import { describe, it, expect } from 'vitest';
import { cx } from '@/utils/cx';

describe('cx — 基本結合', () => {
  it('複数の文字列を単一スペースで結合する', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('1 つの文字列はそのまま返す', () => {
    expect(cx('foo')).toBe('foo');
  });
});

describe('cx — falsy 値の除去', () => {
  it('false を除去する（条件 false のクラスが消える）', () => {
    expect(cx('btn', false, 'active')).toBe('btn active');
  });

  it('null を除去する', () => {
    expect(cx('btn', null, 'active')).toBe('btn active');
  });

  it('undefined を除去する', () => {
    expect(cx('btn', undefined, 'active')).toBe('btn active');
  });

  it('空文字列を除去する', () => {
    expect(cx('btn', '', 'active')).toBe('btn active');
  });

  it('0 を除去する（falsy）', () => {
    expect(cx('btn', 0, 'active')).toBe('btn active');
  });
});

describe('cx — 連続空白を生成しない', () => {
  it('条件 falsy が中間にあっても二重空白が出ない', () => {
    expect(cx('a', '', 'b')).toBe('a b');
  });

  it('複数の falsy が連続しても二重空白が出ない', () => {
    expect(cx('a', '', false, null, 'b')).toBe('a b');
  });
});

describe('cx — 前後空白なし', () => {
  it('先頭の falsy がある場合に前置スペースが付かない', () => {
    expect(cx(false, 'btn')).toBe('btn');
  });

  it('末尾の falsy がある場合に後置スペースが付かない', () => {
    expect(cx('btn', false)).toBe('btn');
  });
});

describe('cx — 全 falsy', () => {
  it('全て falsy なら空文字列を返す', () => {
    expect(cx(false, null, undefined, '')).toBe('');
  });

  it('引数なしでも空文字列を返す', () => {
    expect(cx()).toBe('');
  });
});

describe('cx — 数値', () => {
  it('0 は除去される（falsy）', () => {
    expect(cx('btn', 0)).toBe('btn');
  });

  it('正の数値は文字列化して残る', () => {
    expect(cx('w-', 4)).toBe('w- 4');
  });
});
