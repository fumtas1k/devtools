// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuoteStyle, QUOTE_OPTIONS } from '@/hooks/useQuoteStyle';

describe('useQuoteStyle', () => {
  describe('初期値', () => {
    it('引数なしの場合 none で初期化される', () => {
      const { result } = renderHook(() => useQuoteStyle());
      expect(result.current.quoteStyle).toBe('none');
    });

    it('initial 引数で初期スタイルを指定できる', () => {
      const { result } = renderHook(() => useQuoteStyle('double'));
      expect(result.current.quoteStyle).toBe('double');
    });
  });

  describe('formatId', () => {
    it('none では ID をそのまま返す', () => {
      const { result } = renderHook(() => useQuoteStyle('none'));
      expect(result.current.formatId('abc')).toBe('abc');
    });

    it('double では ID をダブルクォートで囲む', () => {
      const { result } = renderHook(() => useQuoteStyle('double'));
      expect(result.current.formatId('abc')).toBe('"abc"');
    });

    it('single では ID をシングルクォートで囲む', () => {
      const { result } = renderHook(() => useQuoteStyle('single'));
      expect(result.current.formatId('abc')).toBe("'abc'");
    });
  });

  describe('formatAll', () => {
    it('none では改行区切りで結合し comma を付けない', () => {
      const { result } = renderHook(() => useQuoteStyle('none'));
      expect(result.current.formatAll(['a', 'b', 'c'])).toBe('a\nb\nc');
    });

    it('double では各 ID をダブルクォートで囲み trailing comma を付ける（最終行を除く）', () => {
      const { result } = renderHook(() => useQuoteStyle('double'));
      expect(result.current.formatAll(['a', 'b', 'c'])).toBe('"a",\n"b",\n"c"');
    });

    it('single では各 ID をシングルクォートで囲み trailing comma を付ける（最終行を除く）', () => {
      const { result } = renderHook(() => useQuoteStyle('single'));
      expect(result.current.formatAll(['a', 'b', 'c'])).toBe("'a',\n'b',\n'c'");
    });

    it('空配列では空文字列を返す', () => {
      const { result } = renderHook(() => useQuoteStyle('double'));
      expect(result.current.formatAll([])).toBe('');
    });

    it('単一要素では comma を付けない', () => {
      const { result } = renderHook(() => useQuoteStyle('double'));
      expect(result.current.formatAll(['x'])).toBe('"x"');
    });
  });

  describe('setQuoteStyle', () => {
    it('setQuoteStyle で style を切り替えられる', () => {
      const { result } = renderHook(() => useQuoteStyle('none'));
      act(() => result.current.setQuoteStyle('single'));
      expect(result.current.quoteStyle).toBe('single');
      expect(result.current.formatId('x')).toBe("'x'");
    });
  });

  describe('QUOTE_OPTIONS', () => {
    it('none / double / single の 3 種類が定義されている', () => {
      expect(QUOTE_OPTIONS.map((o) => o.value)).toEqual(['none', 'double', 'single']);
    });

    it('日本語ラベルが定義されている', () => {
      const noneOption = QUOTE_OPTIONS.find((o) => o.value === 'none');
      expect(noneOption?.label).toBe('なし');
    });
  });
});
