import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadZip } from '@/utils/zip';

/**
 * downloadZip のテスト。
 * - JSZip は dynamic import なので vi.mock('jszip') で軽量モックに差し替え
 * - sanitizeFilename が ZIP エントリ名と zipName に適用されることを検証
 */

interface MockZipInstance {
  file: ReturnType<typeof vi.fn>;
  generateAsync: ReturnType<typeof vi.fn>;
}

const zipState: { instances: MockZipInstance[] } = { instances: [] };

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      file: ReturnType<typeof vi.fn>;
      generateAsync: ReturnType<typeof vi.fn>;
      constructor() {
        this.file = vi.fn();
        this.generateAsync = vi.fn(async () => new Blob(['zip-mock'], { type: 'application/zip' }));
        zipState.instances.push(this as MockZipInstance);
      }
    },
  };
});

describe('downloadZip', () => {
  let createdAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    zipState.instances = [];
    createdAnchor = { href: '', download: '', click: vi.fn() };

    vi.stubGlobal('document', {
      createElement: vi.fn(() => createdAnchor),
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('渡したファイル数分だけ zip.file が呼ばれる', async () => {
    await downloadZip(
      [
        { name: 'a.svg', content: '<svg/>' },
        { name: 'b.svg', content: '<svg/>' },
      ],
      'archive.zip'
    );
    expect(zipState.instances).toHaveLength(1);
    expect(zipState.instances[0].file).toHaveBeenCalledTimes(2);
  });

  it('エントリ名はサニタイズされる（path separator 除去）', async () => {
    await downloadZip([{ name: '../etc/passwd', content: 'x' }], 'safe.zip');
    const fileMock = zipState.instances[0].file;
    const passedName = fileMock.mock.calls[0][0] as string;
    expect(passedName).not.toContain('/');
    expect(passedName).not.toContain('\\');
    expect(passedName).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('zipName はサニタイズされて .zip 拡張子に正規化される', async () => {
    await downloadZip([{ name: 'a.svg', content: 'x' }], '../evil.exe');
    // sanitizeFilename(..., ['zip']) によって、許可外拡張子は zip に置換される
    expect(createdAnchor.download).toMatch(/\.zip$/);
    expect(createdAnchor.download).not.toContain('/');
  });

  it('zipName が既に正しい .zip ならそのまま使われる', async () => {
    await downloadZip([{ name: 'a.svg', content: 'x' }], 'tickets.zip');
    expect(createdAnchor.download).toBe('tickets.zip');
  });

  it('生成された Blob が anchor 経由でダウンロードされる', async () => {
    await downloadZip([{ name: 'a.svg', content: 'x' }], 'tickets.zip');
    expect(createdAnchor.click).toHaveBeenCalledTimes(1);
    expect(createdAnchor.href).toBe('blob:mock');
  });

  it('Blob コンテンツも受け付ける', async () => {
    const blobContent = new Blob(['png-bytes'], { type: 'image/png' });
    await downloadZip([{ name: 'a.png', content: blobContent }], 'out.zip');
    const fileMock = zipState.instances[0].file;
    expect(fileMock.mock.calls[0][1]).toBe(blobContent);
  });
});
