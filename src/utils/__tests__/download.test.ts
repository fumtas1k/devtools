import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob } from '@/utils/download';

/**
 * downloadBlob のスモークテスト。
 * vitest の environment は node なので DOM API は存在しない。
 * テストごとに必要な API（document, URL.createObjectURL/revokeObjectURL）を
 * vi.stubGlobal でモックし、終了後にリセットする。
 */
describe('downloadBlob', () => {
  let createdAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createdAnchor = { href: '', download: '', click: vi.fn() };
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: vi.fn(() => createdAnchor),
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Blob から ObjectURL を作成して anchor.click() を呼ぶ', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    downloadBlob(blob, 'hello.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(createdAnchor.click).toHaveBeenCalledTimes(1);
  });

  it('anchor.download に渡された filename がセットされる', () => {
    downloadBlob(new Blob(['x']), 'report.csv');
    expect(createdAnchor.download).toBe('report.csv');
  });

  it('anchor.href に ObjectURL がセットされる', () => {
    downloadBlob(new Blob(['x']), 'a.txt');
    expect(createdAnchor.href).toBe('blob:mock-url');
  });

  it('生成した ObjectURL は revokeObjectURL で解放される', () => {
    downloadBlob(new Blob(['x']), 'a.txt');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
