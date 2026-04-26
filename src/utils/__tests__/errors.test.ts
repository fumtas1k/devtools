import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '@/utils/errors';

const FALLBACK = 'フォールバックメッセージ';

// ────────────────────────────────────────────
// Error インスタンス
// ────────────────────────────────────────────
describe('getErrorMessage — Error インスタンス', () => {
  it('Error インスタンスは message を返す', () => {
    expect(getErrorMessage(new Error('エラーが発生しました'), FALLBACK)).toBe(
      'エラーが発生しました'
    );
  });

  it('TypeError などの Error サブクラスも message を返す', () => {
    expect(getErrorMessage(new TypeError('型エラー'), FALLBACK)).toBe('型エラー');
    expect(getErrorMessage(new RangeError('範囲エラー'), FALLBACK)).toBe('範囲エラー');
  });

  it('message が空文字の Error は空文字を返す（fallback ではない）', () => {
    expect(getErrorMessage(new Error(''), FALLBACK)).toBe('');
  });
});

// ────────────────────────────────────────────
// 非 Error 値
// ────────────────────────────────────────────
describe('getErrorMessage — 非 Error 値', () => {
  it('文字列は fallback を返す', () => {
    expect(getErrorMessage('string error', FALLBACK)).toBe(FALLBACK);
  });

  it('null は fallback を返す', () => {
    expect(getErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  it('undefined は fallback を返す', () => {
    expect(getErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it('数値は fallback を返す', () => {
    expect(getErrorMessage(42, FALLBACK)).toBe(FALLBACK);
  });

  it('message プロパティを持つプレーンオブジェクトは fallback を返す', () => {
    expect(getErrorMessage({ message: 'オブジェクトエラー' }, FALLBACK)).toBe(FALLBACK);
  });
});
