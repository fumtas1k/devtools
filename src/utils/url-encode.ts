export function encodeUrl(value: string): string {
  if (!value) return '';
  return encodeURIComponent(value);
}

/**
 * デコードに失敗したら null を返す。
 * 戻り値を捨てる `decodeURIComponent(value);` だけの呼び出しは、Vite 8 の minifier (oxc) が
 * 副作用なしとみなして削除し、例外が投げられなくなる（#762）。必ず戻り値を使う形で呼ぶ。
 */
function tryDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function decodeUrl(value: string): string {
  if (!value) return '';
  return tryDecode(value) ?? '';
}

/** デコードモード時の入力バリデーション。エラーメッセージを返す（正常時は空文字） */
export function validateDecodeInput(value: string): string {
  if (!value) return '';
  return tryDecode(value) === null ? '不正なURLエンコード文字列です' : '';
}
