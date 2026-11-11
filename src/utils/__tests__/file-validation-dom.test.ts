// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateFile } from '@/utils/file-validation';

describe('validateFile with DOM File', () => {
  const options = { kind: 'image', maxBytes: 1024 } as const;

  it('accepts a PNG signature from an actual File', async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], 'image.png', {
      type: 'image/png',
    });
    expect(await validateFile(file, options)).toEqual({ ok: true, file });
  });

  it.each([
    ['PNG', 'image/png', 'not a PNG'],
    ['PDF', 'image/png', '%PDF-1.7'],
  ])('rejects %s MIME-spoofed bytes', async (_name, type, contents) => {
    const file = new File([contents], 'image.png', { type });
    expect(await validateFile(file, options)).toMatchObject({ ok: false, code: 'WRONG_TYPE' });
  });

  it('preserves bytes when slicing a File', async () => {
    const file = new File([new Uint8Array([0, 0x89, 0x50, 0x4e, 0x47, 255])], 'image.png');
    const bytes = new Uint8Array(await file.slice(1, 5).arrayBuffer());
    expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
