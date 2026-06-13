import { formatBytes } from '@/utils/format';

export type FileKind = 'image' | 'text';

export interface ValidateOptions {
  maxBytes: number;
  kind: FileKind;
  acceptExtensions?: readonly string[];
}

export type ValidationResult =
  | { ok: true; file: File }
  | { ok: false; code: 'TOO_LARGE' | 'WRONG_TYPE' | 'EMPTY'; message: string };

// ──────────────────────────────────────────────
// Magic-byte 判定ヘルパ
//
// file.type は OS/browser 由来の advisory 値であり、
// 拡張子を偽装したファイルでも image/png 等が返る。
// 実際のバイト列（magic number）を読み取ることで堅牢に判定する。
// ──────────────────────────────────────────────

/** バイト配列が指定オフセットから期待バイト列で始まるか確認する */
function startsWith(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

/** 先頭 16 バイトのバイナリ magic で画像フォーマットを判定する（SVG は別途テキスト sniff）*/
function matchesBinaryImageMagic(bytes: Uint8Array): boolean {
  // PNG: 0x89 0x50 0x4E 0x47
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return true;
  // JPEG: 0xFF 0xD8 0xFF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return true;
  // GIF: "GIF8" (0x47 0x49 0x46 0x38)
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return true;
  // WebP: "RIFF" (offset 0) + "WEBP" (offset 8)
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return true;
  }
  return false;
}

/**
 * SVG はバイナリ magic を持たないため XML テキストとして sniff する。
 * 先頭 1KB を UTF-8 デコードし、前方空白を除いた小文字テキストで判定する。
 * - `<svg` 直開始
 * - もしくは XML 宣言 `<?xml` 始まり **かつ** `<svg` が出現する場合
 * `<?xml` の単純包含だけで通すと RSS / SOAP / plist 等の任意 XML まで
 * image 扱いになるため、SVG 要素の存在を必須にして誤検知を抑える。
 */
function matchesSvgText(bytes: Uint8Array): boolean {
  // TextDecoder は既定（ignoreBOM: false）で先頭 BOM を消費・除去するため
  // 別途 BOM を strip する必要はない。前方空白のみ trim して判定する。
  const trimmed = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes)
    .trimStart()
    .toLowerCase();
  return trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && trimmed.includes('<svg'));
}

/**
 * ファイルのバリデーションを実施する。
 *
 * - EMPTY: 0 バイトのファイル
 * - TOO_LARGE: maxBytes 超過
 * - WRONG_TYPE: ファイル種別が期待と異なる
 *
 * 画像は先頭バイトの magic number を検証する。SVG は XML テキストとして sniff する。
 * text kind は MIME タイプ + 拡張子による判定（従来ロジック）を維持する。
 */
export async function validateFile(file: File, opts: ValidateOptions): Promise<ValidationResult> {
  if (file.size === 0) {
    return { ok: false, code: 'EMPTY', message: 'ファイルが空です' };
  }

  if (file.size > opts.maxBytes) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `${formatBytes(opts.maxBytes)} を超えるファイルは読み込めません（選択: ${formatBytes(file.size)}）`,
    };
  }

  if (opts.kind === 'image') {
    // file.type は advisory のため実バイトの magic を検証する。
    // 先頭 1KB を 1 回だけ読み、binary magic（先頭数バイト）と
    // SVG テキスト sniff の両方で共用して I/O を 1 回に抑える。
    const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());

    if (matchesBinaryImageMagic(header) || matchesSvgText(header)) {
      return { ok: true, file };
    }

    return {
      ok: false,
      code: 'WRONG_TYPE',
      message: '画像ファイルを選択してください（PNG/JPEG/WebP/GIF 等）',
    };
  } else {
    const isTextMime =
      file.type.startsWith('text/') ||
      file.type === 'application/json' ||
      file.type === 'application/xml' ||
      file.type === 'application/toml';

    const isAcceptedExtension =
      opts.acceptExtensions !== undefined &&
      opts.acceptExtensions.some((ext) => file.name.toLowerCase().endsWith(ext.toLowerCase()));

    if (!isTextMime && !isAcceptedExtension) {
      return {
        ok: false,
        code: 'WRONG_TYPE',
        message: 'テキストファイルを選択してください（.txt/.csv/.json/.xml 等）',
      };
    }
  }

  return { ok: true, file };
}
