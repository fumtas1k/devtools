import { describe, it, expect } from 'vitest';
import { validateFile } from '@/utils/file-validation';

const MB = 1024 * 1024;
const MAX_BYTES = 2 * MB;

/**
 * 指定された先頭バイト列 + ゼロ埋めでファイルを生成するヘルパ。
 * magic-byte 検証に対応するため先頭バイトを指定できるよう拡張した。
 * @param magic 先頭に配置するバイト列（省略時は全ゼロ）
 * @param totalBytes ファイル全体のバイト数
 * @param name ファイル名
 * @param type MIME タイプ
 */
function makeFile(totalBytes: number, name: string, type: string, magic: number[] = []): File {
  const data = new Uint8Array(totalBytes);
  // 先頭に magic バイトを配置する
  for (let i = 0; i < magic.length && i < totalBytes; i++) {
    data[i] = magic[i];
  }
  return new File([data], name, { type });
}

// PNG magic: 0x89 0x50 0x4E 0x47
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
// JPEG magic: 0xFF 0xD8 0xFF
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
// GIF magic: "GIF8"
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38];
// WebP: "RIFF" (offset 0) + 4 bytes サイズ + "WEBP" (offset 8)
const WEBP_MAGIC = [
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x00,
  0x00,
  0x00,
  0x00, // サイズ（ダミー）
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
];
// PDF magic（画像ではない非画像バイト列、陽性対照に使用）
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
// RIFF だが offset 8 が "WAVE"（WebP ではない）。offset 8 チェックの退行検知用。
const RIFF_WAVE = [
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x00,
  0x00,
  0x00,
  0x00, // サイズ（ダミー）
  0x57,
  0x41,
  0x56,
  0x45, // WAVE
];

// ──────────────────────────────────────────────
// サイズ境界テスト（magic 不問: EMPTY は size 0、TOO_LARGE は size チェックが先行）
// ──────────────────────────────────────────────

describe('validateFile — EMPTY', () => {
  it('0 バイトのファイルは EMPTY を返す（magic チェック前にサイズで弾く）', async () => {
    const result = await validateFile(makeFile(0, 'empty.png', 'image/png'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EMPTY');
  });
});

describe('validateFile — TOO_LARGE', () => {
  it('maxBytes + 1 バイトは TOO_LARGE を返す（magic チェック前にサイズで弾く）', async () => {
    // TOO_LARGE はサイズチェックが先行するため magic は全ゼロでよい
    const result = await validateFile(makeFile(MAX_BYTES + 1, 'big.png', 'image/png'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TOO_LARGE');
  });

  it('ちょうど maxBytes のファイルは ok = true（境界値）', async () => {
    // PNG magic を先頭に置いて magic 判定を通過させる
    const result = await validateFile(makeFile(MAX_BYTES, 'exact.png', 'image/png', PNG_MAGIC), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 陰性対照（正当な画像 magic → ok = true）
// ──────────────────────────────────────────────

describe('validateFile — image OK (陰性対照: 正当な magic を持つ画像は通過する)', () => {
  it('PNG magic を持つファイルは ok = true', async () => {
    // 陰性対照: 実際の PNG バイト列で始まるファイルは正しく通過する
    const result = await validateFile(makeFile(100, 'photo.png', 'image/png', PNG_MAGIC), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });

  it('JPEG magic を持つファイルは ok = true', async () => {
    // 陰性対照: JPEG バイト列で始まるファイルは正しく通過する
    const result = await validateFile(makeFile(100, 'photo.jpg', 'image/jpeg', JPEG_MAGIC), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });

  it('WebP magic を持つファイルは ok = true', async () => {
    // 陰性対照: WebP は RIFF ヘッダ + offset 8 の "WEBP" で判定する
    const result = await validateFile(makeFile(100, 'photo.webp', 'image/webp', WEBP_MAGIC), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });

  it('GIF magic を持つファイルは ok = true', async () => {
    // 陰性対照: "GIF8" で始まるファイルは正しく通過する
    const result = await validateFile(makeFile(100, 'anim.gif', 'image/gif', GIF_MAGIC), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 陰性対照（SVG テキストとして sniff → ok = true）
// ──────────────────────────────────────────────

describe('validateFile — SVG OK (陰性対照: SVG はテキスト sniff で通過する)', () => {
  it('<svg ...> で始まる SVG は ok = true（type = image/svg+xml）', async () => {
    // 陰性対照: QR Reader が SVG アップロードを公式サポートするため SVG を通す必要がある
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
    const result = await validateFile(
      new File([svgContent], 'icon.svg', { type: 'image/svg+xml' }),
      { maxBytes: MAX_BYTES, kind: 'image' }
    );
    expect(result.ok).toBe(true);
  });

  it('<?xml ...><svg> で始まる SVG は ok = true（type 空でも通過）', async () => {
    // 陰性対照: type が空でも先頭テキストで SVG を識別できる
    const svgContent =
      '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const result = await validateFile(new File([svgContent], 'image.svg', { type: '' }), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });

  it('BOM 付き SVG も ok = true（先頭 BOM を除去して sniff）', async () => {
    // 陰性対照: BOM (U+FEFF) を除去してから小文字比較するため通過する
    const bom = '﻿';
    const svgContent = bom + '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const result = await validateFile(
      new File([svgContent], 'bom.svg', { type: 'image/svg+xml' }),
      { maxBytes: MAX_BYTES, kind: 'image' }
    );
    expect(result.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 陽性対照（検知能力の証明: 非画像バイトは reject される）
// ──────────────────────────────────────────────

describe('validateFile — image WRONG_TYPE (陽性対照: 非画像バイトは reject される)', () => {
  it('PDF バイト列で始まる photo.png（拡張子偽装）は WRONG_TYPE を返す', async () => {
    // 陽性対照: file.type = image/png でも実バイトが PDF magic なら拒否される。
    // 旧実装（file.type.startsWith("image/") チェックのみ）ではこれが ok=true で通っていた。
    // magic-byte 検証への変更により確実に WRONG_TYPE になることを保証する。
    const result = await validateFile(makeFile(100, 'photo.png', 'image/png', PDF_MAGIC), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });

  it('全ゼロバイト（magic なし）で name=photo.png type=image/png は WRONG_TYPE を返す', async () => {
    // 陽性対照: ゼロ埋めファイルは magic に合致せず SVG テキストでもないため拒否される
    const result = await validateFile(
      makeFile(100, 'photo.png', 'image/png'), // magic 引数なし = 全ゼロ
      { maxBytes: MAX_BYTES, kind: 'image' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });

  it('type = application/pdf の全ゼロファイルは WRONG_TYPE を返す', async () => {
    // 陽性対照: MIME も magic も画像でないファイルは当然拒否
    const result = await validateFile(makeFile(100, 'doc.pdf', 'application/pdf'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });

  it('PNG magic を持ち name=fake.jpg type=image/jpeg なファイルは ok = true（実体が画像なら通る）', async () => {
    // 陽性対照の逆証明: magic が正しければ拡張子・MIME が違っても ok になる。
    // これは magic 検証の正しい挙動（file.type 依存ではない証明）。
    const result = await validateFile(makeFile(100, 'fake.jpg', 'image/jpeg', PNG_MAGIC), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });

  it('RIFF だが offset 8 が "WAVE" のファイルは WRONG_TYPE を返す', async () => {
    // 陽性対照: WebP 判定は "RIFF"(0) + "WEBP"(8) の両方を要求する。
    // offset 8 チェックが将来削られると RIFF コンテナ（WAV 等）が誤って
    // 画像として通る退行になるため、それを検知する。
    const result = await validateFile(makeFile(100, 'audio.webp', 'image/webp', RIFF_WAVE), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });

  it('<?xml> 始まりでも <svg> を含まない XML は WRONG_TYPE を返す', async () => {
    // 陽性対照: XML 宣言の単純包含だけで通すと RSS / SOAP 等まで image 扱いになる。
    // SVG 要素の存在を必須にしているため、<svg> なしの XML は拒否される。
    const rss = '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>';
    const result = await validateFile(new File([rss], 'feed.xml', { type: 'application/xml' }), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });
});

// ──────────────────────────────────────────────
// text kind テスト（挙動不変: MIME/拡張子チェックを維持）
// ──────────────────────────────────────────────

describe('validateFile — text OK by MIME', () => {
  it('type = text/plain は ok = true', async () => {
    const result = await validateFile(makeFile(100, 'note.txt', 'text/plain'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
    });
    expect(result.ok).toBe(true);
  });

  it('type = application/json は ok = true', async () => {
    const result = await validateFile(makeFile(100, 'data.json', 'application/json'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — text OK by extension', () => {
  it('type が空でも acceptExtensions に一致すれば ok = true', async () => {
    const result = await validateFile(makeFile(100, 'data.csv', ''), {
      maxBytes: MAX_BYTES,
      kind: 'text',
      acceptExtensions: ['.csv'],
    });
    expect(result.ok).toBe(true);
  });

  it('拡張子が大文字（.CSV）でも acceptExtensions に一致すれば ok = true', async () => {
    const result = await validateFile(makeFile(100, 'DATA.CSV', ''), {
      maxBytes: MAX_BYTES,
      kind: 'text',
      acceptExtensions: ['.csv'],
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — text WRONG_TYPE', () => {
  it('type = image/jpeg かつ acceptExtensions = [.csv] は WRONG_TYPE', async () => {
    const result = await validateFile(makeFile(100, 'photo.jpg', 'image/jpeg'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
      acceptExtensions: ['.csv'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });

  it('type = application/octet-stream かつ name = file.exe は WRONG_TYPE', async () => {
    const result = await validateFile(makeFile(100, 'file.exe', 'application/octet-stream'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });
});
