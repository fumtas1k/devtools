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

  it('folder 指定時はサブフォルダ配下のエントリパスになる', async () => {
    await downloadZip(
      [
        { name: 'ticket-001.svg', folder: 'tickets', content: '<svg/>' },
        { name: 'ticket-002.svg', folder: 'tickets', content: '<svg/>' },
      ],
      'tickets.zip'
    );
    const fileMock = zipState.instances[0].file;
    expect(fileMock.mock.calls[0][0]).toBe('tickets/ticket-001.svg');
    expect(fileMock.mock.calls[1][0]).toBe('tickets/ticket-002.svg');
  });

  it('folder 未指定時は従来通りフラットなエントリ名になる', async () => {
    await downloadZip(
      [
        { name: 'a.svg', content: '<svg/>' },
        { name: 'b.svg', content: '<svg/>' },
      ],
      'archive.zip'
    );
    const fileMock = zipState.instances[0].file;
    expect(fileMock.mock.calls[0][0]).toBe('a.svg');
    expect(fileMock.mock.calls[1][0]).toBe('b.svg');
  });

  it('folder もサニタイズされる（path traversal の試みは _ に置換）', async () => {
    await downloadZip([{ name: 'a.svg', folder: '../etc', content: '<svg/>' }], 'archive.zip');
    const fileMock = zipState.instances[0].file;
    const passedPath = fileMock.mock.calls[0][0] as string;
    // `../etc` → `..` は先頭ドットが除去され、`/` は分離処理対象。
    // sanitizeFilename は ext 分離後に base の連続ドットを除去するため
    // 最終的な folder 部分に `..` や `/` が混入しないことを保証する。
    expect(passedPath).not.toContain('..');
    // path separator は entryPath の区切り `/` 1 つだけ存在する想定
    expect(passedPath.split('/').length).toBe(2);
    // folder 部分・name 部分とも英数字・._- のみ
    const [folderPart, namePart] = passedPath.split('/');
    expect(folderPart).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(namePart).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('folder と name 両方が同時にサニタイズされる', async () => {
    await downloadZip(
      [{ name: 'foo bar.svg', folder: 'my folder', content: '<svg/>' }],
      'archive.zip'
    );
    const fileMock = zipState.instances[0].file;
    // 半角スペースは _ に置換される
    expect(fileMock.mock.calls[0][0]).toBe('my_folder/foo_bar.svg');
  });

  it('folder にスラッシュを含めても `_` に置換され単一階層に強制される', async () => {
    await downloadZip(
      [{ name: 'a.svg', folder: 'gs1-databars/sub', content: '<svg/>' }],
      'archive.zip'
    );
    const fileMock = zipState.instances[0].file;
    const passedPath = fileMock.mock.calls[0][0] as string;
    // sanitizeFilename が `/` を `_` に置換するため、最終 entryPath に
    // 含まれる `/` は entryFolder と entryName の境界の 1 つだけ
    expect(passedPath.split('/').length).toBe(2);
  });
});
