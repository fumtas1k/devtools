/**
 * ファイル名・ZIP エントリ名のサニタイズユーティリティ
 *
 * ユーザー制御の文字列を `<a download>` の filename 属性や JSZip の
 * エントリ名として用いる際、path separator や制御文字を除去して
 * 想定外のパス展開や悪意ある拡張子の付与を防ぐ。
 *
 * 仕様:
 * - 英数字・`_`・`-`・`.` 以外を `_` に置換
 * - 末尾の拡張子を分離し、必要に応じてホワイトリスト検査
 * - 長さは 64 文字以内に制限（拡張子を保持）
 * - 空文字は `file` にフォールバック
 * - 先頭ドット（隠しファイル化）を防止
 */

const MAX_LENGTH = 64;
const FALLBACK_BASE = 'file';
const FALLBACK_EXT = 'txt';

/** 大文字小文字を無視するためにドットを除去して小文字化する */
function normalizeExt(ext: string): string {
  return ext.replace(/^\./, '').toLowerCase();
}

/** 許可文字以外を `_` に置換（path separator・制御文字も含む） */
function replaceUnsafeChars(input: string): string {
  // [^A-Za-z0-9._-] にマッチするすべての文字を _ に置換
  // 制御文字・スラッシュ・バックスラッシュ・スペース・日本語などはここで除去される
  // eslint-disable-next-line no-control-regex
  return input.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * ファイル名をサニタイズする
 *
 * @param name 入力ファイル名（OS 由来やユーザー入力など信頼できない値）
 * @param allowExt 許可拡張子のホワイトリスト（ドット有無どちらでも可、大文字小文字無視）
 * @returns サニタイズ済みのファイル名（必ず非空、64 文字以内、許可文字のみ）
 */
export function sanitizeFilename(name: string, allowExt?: readonly string[]): string {
  const allowList = allowExt?.map(normalizeExt) ?? null;

  // 1. 末尾の拡張子を分離
  // 多重ドット（archive.tar.gz）の場合は最後のドット以降を拡張子とみなす
  let base: string;
  let ext: string;
  const lastDot = name.lastIndexOf('.');
  // 拡張子と判定するのは「ドットがあり、ドットの後ろが 1 文字以上、かつドットが先頭でない」
  if (lastDot > 0 && lastDot < name.length - 1) {
    base = name.slice(0, lastDot);
    ext = name.slice(lastDot + 1);
  } else {
    base = name;
    ext = '';
  }

  // 2. base の許可文字以外を _ に置換
  let safeBase = replaceUnsafeChars(base);

  // 3. base 先頭の連続ドット除去（隠しファイル化防止 + path traversal 風除去）と
  //    末尾の連続ドット/アンダースコアの整形（置換結果のゴミを除去）
  safeBase = safeBase.replace(/^\.+/, '').replace(/[._]+$/, '');

  // 4. 拡張子の決定
  //    allowExt 指定時: 元の ext を **置換せず** 小文字化してホワイトリスト判定。
  //    外れたら丸ごと捨てて allowList[0] にフォールバック（`foo.cs v` のように
  //    危険文字を含む ext が `cs_v` 等に化けた状態でホワイトリスト判定するのを避ける）。
  //    allowExt 未指定時: ext を sanitize して保持（拡張子なしも許容）。
  let safeExt = '';
  if (allowList !== null) {
    const rawExtLower = ext.toLowerCase();
    if (rawExtLower && allowList.includes(rawExtLower)) {
      safeExt = rawExtLower;
    } else {
      safeExt = allowList[0] ?? FALLBACK_EXT;
    }
  } else {
    safeExt = ext ? replaceUnsafeChars(ext) : '';
  }

  // 5. base が空なら fallback
  if (!safeBase) {
    safeBase = FALLBACK_BASE;
  }

  // 6. 長さ制限（拡張子を保持して base を切り詰める）
  //    切り詰めの結果、末尾が `.` や `_` になる可能性があるため再度整形する
  //    （例: 64 文字目が `_` の入力で切れ目が末尾連続 `_` になるケース）。
  //    再 trim で空になった場合は fallback に戻す。
  const extWithDot = safeExt ? `.${safeExt}` : '';
  const maxBaseLen = Math.max(1, MAX_LENGTH - extWithDot.length);
  if (safeBase.length > maxBaseLen) {
    safeBase = safeBase.slice(0, maxBaseLen).replace(/[._]+$/, '');
    if (!safeBase) {
      safeBase = FALLBACK_BASE;
    }
  }

  return `${safeBase}${extWithDot}`;
}

/**
 * チケット ID 等のホワイトリスト検証
 *
 * 英数字 / `.` / `_` / `-` のみ、1〜64 文字、`..` を含まないことを要求する。
 * UI 入力のバリデーション（ユーザー入力時点での早期リジェクト）に使う。
 */
export function isSafeTicketId(value: string): boolean {
  if (!value || value.length > 64) return false;
  if (value.includes('..')) return false;
  return /^[A-Za-z0-9._-]+$/.test(value);
}
