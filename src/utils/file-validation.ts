export type FileKind = 'image' | 'text';

export interface ValidateOptions {
  maxBytes: number;
  kind: FileKind;
  acceptExtensions?: readonly string[];
}

export type ValidationResult =
  | { ok: true; file: File }
  | { ok: false; code: 'TOO_LARGE' | 'WRONG_TYPE' | 'EMPTY'; message: string };

export function validateFile(file: File, opts: ValidateOptions): ValidationResult {
  if (file.size === 0) {
    return { ok: false, code: 'EMPTY', message: 'ファイルが空です' };
  }

  if (file.size > opts.maxBytes) {
    const limitMB = Math.ceil(opts.maxBytes / (1024 * 1024));
    const actualMB = Math.ceil(file.size / (1024 * 1024));
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `${limitMB} MB 以上のファイルは読み込めません（選択: ${actualMB}MB）`,
    };
  }

  if (opts.kind === 'image') {
    if (!file.type.startsWith('image/')) {
      return {
        ok: false,
        code: 'WRONG_TYPE',
        message: '画像ファイルを選択してください（PNG/JPEG/WebP/GIF 等）',
      };
    }
  } else {
    const isTextMime =
      file.type.startsWith('text/') ||
      file.type === 'application/json' ||
      file.type === 'application/xml' ||
      file.type === 'application/toml';

    const isAcceptedExtension =
      opts.acceptExtensions !== undefined &&
      opts.acceptExtensions.some((ext) => file.name.endsWith(ext));

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
