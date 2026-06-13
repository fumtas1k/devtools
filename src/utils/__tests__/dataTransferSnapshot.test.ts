import { describe, it, expect } from 'vitest';
import { snapshotDataTransfer } from '@/utils/dataTransferSnapshot';

/** getAsString のコールバック API を再現するモック item */
function mockStringItem(type: string, content: string): DataTransferItem {
  return {
    kind: 'string',
    type,
    getAsString: (cb: ((data: string) => void) | null) => {
      // 実ブラウザ同様、非同期にコールバックされる
      if (cb) setTimeout(() => cb(content), 0);
    },
    getAsFile: () => null,
  } as unknown as DataTransferItem;
}

function mockFileItem(file: File): DataTransferItem {
  return {
    kind: 'file',
    type: file.type,
    getAsString: (cb: ((data: string) => void) | null) => {
      if (cb) setTimeout(() => cb(''), 0);
    },
    getAsFile: () => file,
  } as unknown as DataTransferItem;
}

function mockDataTransfer(items: DataTransferItem[]): DataTransfer {
  const list = Object.assign([...items], { length: items.length });
  return { items: list } as unknown as DataTransfer;
}

describe('snapshotDataTransfer', () => {
  it('string item を type / content / byteSize 付きで収集する', async () => {
    const dt = mockDataTransfer([mockStringItem('text/plain', 'あいう')]);
    const snap = await snapshotDataTransfer(dt, 'paste');
    expect(snap.source).toBe('paste');
    expect(snap.strings).toEqual([
      { type: 'text/plain', content: 'あいう', byteSize: 9 }, // UTF-8 で 3 バイト × 3 文字
    ]);
    expect(snap.files).toEqual([]);
  });

  it('複数の string item の順序を保持する', async () => {
    const dt = mockDataTransfer([
      mockStringItem('text/plain', 'plain'),
      mockStringItem('text/html', '<p>html</p>'),
      mockStringItem('application/x-custom', 'custom'),
    ]);
    const snap = await snapshotDataTransfer(dt, 'paste');
    expect(snap.strings.map((s) => s.type)).toEqual([
      'text/plain',
      'text/html',
      'application/x-custom',
    ]);
  });

  it('file item をメタデータ付きで収集する', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'test.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });
    const dt = mockDataTransfer([mockFileItem(file)]);
    const snap = await snapshotDataTransfer(dt, 'drop');
    expect(snap.source).toBe('drop');
    expect(snap.files).toHaveLength(1);
    expect(snap.files[0]).toMatchObject({
      type: 'image/png',
      name: 'test.png',
      size: 3,
      lastModified: 1700000000000,
    });
    expect(snap.files[0].file).toBe(file);
  });

  it('string と file の混在を扱える', async () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    const dt = mockDataTransfer([mockStringItem('text/plain', 'text'), mockFileItem(file)]);
    const snap = await snapshotDataTransfer(dt, 'drop');
    expect(snap.strings).toHaveLength(1);
    expect(snap.files).toHaveLength(1);
  });

  it('空の DataTransfer は空のスナップショットになる', async () => {
    const snap = await snapshotDataTransfer(mockDataTransfer([]), 'paste');
    expect(snap.strings).toEqual([]);
    expect(snap.files).toEqual([]);
  });
});
