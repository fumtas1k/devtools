export function encodeUrl(value: string): string {
  if (!value) return '';
  return encodeURIComponent(value);
}

export function decodeUrl(value: string): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

/** デコードモード時の入力バリデーション。エラーメッセージを返す（正常時は空文字） */
export function validateDecodeInput(value: string): string {
  if (!value) return '';
  try {
    decodeURIComponent(value);
    return '';
  } catch {
    return '不正なURLエンコード文字列です';
  }
}
