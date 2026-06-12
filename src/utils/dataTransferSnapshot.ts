/**
 * DataTransfer（paste / drop イベント）の全フレーバーをスナップショット化する。
 *
 * DataTransferItemList はイベントハンドラの同期実行中しかアクセスできない
 * （ハンドラ終了後は項目が無効化される）ため、getAsString / getAsFile の
 * 呼び出しは本関数の同期パスで全件発行し、結果の解決のみを await する。
 * イベントハンドラからは同期的に本関数を呼ぶこと。
 */

export type CaptureSource = 'paste' | 'drop';

export interface StringFlavor {
  type: string;
  content: string;
  /** UTF-8 バイト長 */
  byteSize: number;
}

export interface FileFlavor {
  type: string;
  name: string;
  size: number;
  lastModified: number;
  file: File;
}

export interface DataTransferSnapshot {
  source: CaptureSource;
  strings: StringFlavor[];
  files: FileFlavor[];
}

export function snapshotDataTransfer(
  dt: DataTransfer,
  source: CaptureSource
): Promise<DataTransferSnapshot> {
  const stringPromises: Promise<StringFlavor>[] = [];
  const files: FileFlavor[] = [];

  // DataTransferItemList の iterable 実装はブラウザ差があるため index アクセスで走査
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i];
    if (item.kind === 'string') {
      const type = item.type;
      stringPromises.push(
        new Promise((resolve) => {
          item.getAsString((content) => {
            resolve({
              type,
              content,
              byteSize: new TextEncoder().encode(content).length,
            });
          });
        })
      );
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        files.push({
          type: file.type,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          file,
        });
      }
    }
  }

  return Promise.all(stringPromises).then((strings) => ({ source, strings, files }));
}
