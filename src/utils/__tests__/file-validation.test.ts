import { describe, it, expect } from 'vitest';
import { validateFile } from '@/utils/file-validation';

const MB = 1024 * 1024;
const MAX_BYTES = 2 * MB;

function makeFile(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('validateFile — EMPTY', () => {
  it('0 バイトのファイルは EMPTY を返す', () => {
    const result = validateFile(makeFile(0, 'empty.png', 'image/png'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EMPTY');
  });
});

describe('validateFile — TOO_LARGE', () => {
  it('maxBytes + 1 バイトは TOO_LARGE を返す', () => {
    const result = validateFile(makeFile(MAX_BYTES + 1, 'big.png', 'image/png'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TOO_LARGE');
  });

  it('ちょうど maxBytes のファイルは ok = true（境界値）', () => {
    const result = validateFile(makeFile(MAX_BYTES, 'exact.png', 'image/png'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — image WRONG_TYPE', () => {
  it('type = application/pdf は WRONG_TYPE を返す', () => {
    const result = validateFile(makeFile(100, 'doc.pdf', 'application/pdf'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });
});

describe('validateFile — image OK', () => {
  it('type = image/png は ok = true', () => {
    const result = validateFile(makeFile(100, 'photo.png', 'image/png'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });

  it('type = image/webp は ok = true', () => {
    const result = validateFile(makeFile(100, 'photo.webp', 'image/webp'), {
      maxBytes: MAX_BYTES,
      kind: 'image',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — text OK by MIME', () => {
  it('type = text/plain は ok = true', () => {
    const result = validateFile(makeFile(100, 'note.txt', 'text/plain'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
    });
    expect(result.ok).toBe(true);
  });

  it('type = application/json は ok = true', () => {
    const result = validateFile(makeFile(100, 'data.json', 'application/json'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — text OK by extension', () => {
  it('type が空でも acceptExtensions に一致すれば ok = true', () => {
    const result = validateFile(makeFile(100, 'data.csv', ''), {
      maxBytes: MAX_BYTES,
      kind: 'text',
      acceptExtensions: ['.csv'],
    });
    expect(result.ok).toBe(true);
  });

  it('拡張子が大文字（.CSV）でも acceptExtensions に一致すれば ok = true', () => {
    const result = validateFile(makeFile(100, 'DATA.CSV', ''), {
      maxBytes: MAX_BYTES,
      kind: 'text',
      acceptExtensions: ['.csv'],
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFile — text WRONG_TYPE', () => {
  it('type = image/jpeg かつ acceptExtensions = [.csv] は WRONG_TYPE', () => {
    const result = validateFile(makeFile(100, 'photo.jpg', 'image/jpeg'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
      acceptExtensions: ['.csv'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });

  it('type = application/octet-stream かつ name = file.exe は WRONG_TYPE', () => {
    const result = validateFile(makeFile(100, 'file.exe', 'application/octet-stream'), {
      maxBytes: MAX_BYTES,
      kind: 'text',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('WRONG_TYPE');
  });
});
