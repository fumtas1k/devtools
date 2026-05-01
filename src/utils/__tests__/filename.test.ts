import { describe, it, expect } from 'vitest';
import { sanitizeFilename, isSafeTicketId } from '@/utils/filename';

describe('sanitizeFilename — 通常ケース', () => {
  it('英数字のみのファイル名はそのまま保持される', () => {
    expect(sanitizeFilename('report.txt')).toBe('report.txt');
  });

  it('ハイフンとアンダースコアは保持される', () => {
    expect(sanitizeFilename('my_file-2025.csv')).toBe('my_file-2025.csv');
  });

  it('拡張子の大文字小文字は base 部分の小文字化を行わない（大文字維持）', () => {
    // base 部分の英大文字は許可文字なので維持される
    expect(sanitizeFilename('Report.TXT')).toBe('Report.TXT');
  });
});

describe('sanitizeFilename — path separator / 危険文字の除去', () => {
  it('スラッシュは _ に置換される', () => {
    const out = sanitizeFilename('../../etc/passwd');
    expect(out).not.toContain('/');
    expect(out).not.toContain('\\');
    // path separator が消えていればよい
    expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('バックスラッシュは _ に置換される', () => {
    const out = sanitizeFilename('foo\\bar\\baz.txt');
    expect(out).not.toContain('\\');
  });

  it('NUL や制御文字は除去/置換される（path separator 含まない）', () => {
    const out = sanitizeFilename('foo\x00bar\x01baz.txt');
    expect(out).not.toContain('\x00');
    expect(out).not.toContain('\x01');
    expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('日本語などの記号も _ に置換される', () => {
    const out = sanitizeFilename('テスト.txt');
    // 日本語部分はすべて _ になり、最終的に許可文字＋拡張子のみになる
    expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(out.endsWith('.txt')).toBe(true);
  });

  it('スペースは _ に置換される', () => {
    const out = sanitizeFilename(' foo bar .txt');
    expect(out).not.toContain(' ');
    expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('sanitizeFilename — 拡張子フォールバック (allowExt)', () => {
  it('allowExt にない拡張子はフォールバック（既定: txt）される', () => {
    const out = sanitizeFilename('evil.html', ['txt', 'csv']);
    expect(out).toBe('evil.txt');
  });

  it('allowExt にある拡張子は維持される（小文字化される）', () => {
    const out = sanitizeFilename('FILE.TXT', ['txt']);
    expect(out).toBe('FILE.txt');
  });

  it('allowExt は大文字小文字を無視する', () => {
    const out = sanitizeFilename('data.CSV', ['csv']);
    expect(out).toBe('data.csv');
  });

  it('allowExt にドット付き表記（.txt）が指定されても受け入れる', () => {
    const out = sanitizeFilename('evil.html', ['.txt', '.csv']);
    expect(out).toBe('evil.txt');
  });

  it('allowExt 指定時、拡張子なし入力は allowExt[0] でフォールバックされる', () => {
    const out = sanitizeFilename('noext', ['txt', 'csv']);
    expect(out).toBe('noext.txt');
  });

  it('allowExt 未指定時、拡張子なしはそのまま', () => {
    const out = sanitizeFilename('noext');
    expect(out).toBe('noext');
  });

  it('多重ドット（archive.tar.gz）の拡張子は最後のドット以降のみを拡張子とみなす', () => {
    // .gz はホワイトリストにないので txt にフォールバック、base は archive.tar
    const out = sanitizeFilename('archive.tar.gz', ['txt']);
    expect(out).toBe('archive.tar.txt');
  });

  it('多重ドット（archive.tar.gz）で allowExt 未指定時はそのまま許可文字のみ', () => {
    const out = sanitizeFilename('archive.tar.gz');
    expect(out).toBe('archive.tar.gz');
  });
});

describe('sanitizeFilename — 空文字フォールバック', () => {
  it('空文字はデフォルト名 file になる', () => {
    expect(sanitizeFilename('')).toBe('file');
  });

  it('path separator のみの入力は全て _ に置換され、安全な許可文字列になる', () => {
    // /// は path separator のみ → 全て _ に置換されるが空ではない
    const out = sanitizeFilename('///');
    expect(out).not.toContain('/');
    expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(out.length).toBeGreaterThan(0);
  });

  it('先頭ドットのみの入力（"."）は隠しファイル化を防いで file にフォールバック', () => {
    const out = sanitizeFilename('.');
    expect(out).toBe('file');
  });

  it('連続した先頭ドットのみの入力（"..."）も file にフォールバック', () => {
    const out = sanitizeFilename('...');
    // .lastIndexOf('.') は 2 だが「ドット先頭」なので拡張子分離されない仕様…
    // 実装上 lastDot=2、name.length=3 → lastDot==name.length-1 となり拡張子なし扱い
    // base="..." → 先頭ドット除去で空 → file
    expect(out).toBe('file');
  });

  it('空文字 + allowExt は allowExt[0] で拡張子付与', () => {
    expect(sanitizeFilename('', ['txt'])).toBe('file.txt');
  });
});

describe('sanitizeFilename — 長さ制限', () => {
  it('100 文字の入力は 64 文字以内に切り詰められる', () => {
    const longName = 'a'.repeat(100) + '.txt';
    const out = sanitizeFilename(longName);
    expect(out.length).toBeLessThanOrEqual(64);
    // 拡張子は維持される
    expect(out.endsWith('.txt')).toBe(true);
  });

  it('長すぎる base 部分は切り詰められるが拡張子は保持される', () => {
    const longName = 'b'.repeat(200) + '.csv';
    const out = sanitizeFilename(longName, ['csv']);
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.endsWith('.csv')).toBe(true);
  });

  it('切り詰め後の末尾が `_` になるケースは再 trim される', () => {
    // .txt の場合 maxBaseLen=60。
    // 入力: 'a' x 55 + 日本語 5 + 'b' + '.txt'
    //   → base="aaa...aaa_____b" (61 文字、末尾 trim は 'b' で止まる)
    //   → 切り詰め後 60 文字目は '_' で連続するため再 trim で消える
    //   → 'a' x 55 + '.txt'
    const out = sanitizeFilename('a'.repeat(55) + 'あいうえお' + 'b' + '.txt', ['txt']);
    expect(out).toBe('a'.repeat(55) + '.txt');
    expect(out.endsWith('_.txt')).toBe(false);
  });

  it('切り詰め後 base が空になるケースは fallback に戻る', () => {
    // すべて日本語 → base 全体が `_` x N、初回末尾 trim で空 → fallback "file"
    // 切り詰めは発生しないが、念のため fallback 挙動を確認
    const out = sanitizeFilename('あ'.repeat(100) + '.txt', ['txt']);
    expect(out).toBe('file.txt');
  });
});

describe('sanitizeFilename — 隠しファイル化の防止', () => {
  it('先頭ドットは除去される', () => {
    const out = sanitizeFilename('.hidden');
    expect(out.startsWith('.')).toBe(false);
  });

  it('先頭の連続ドットは除去される（path traversal 風入力）', () => {
    const out = sanitizeFilename('...etc');
    expect(out.startsWith('.')).toBe(false);
  });
});

describe('sanitizeFilename — 末尾の連続ドット/アンダースコアの整形', () => {
  it('末尾の連続ドットは trim される（拡張子フォールバック後の base 末尾も整形）', () => {
    // foo... → base="foo..." → 末尾ドット trim → "foo"。allowExt なしなのでそのまま
    expect(sanitizeFilename('foo...')).toBe('foo');
  });

  it('末尾ドットが残らないこと（拡張子付き）', () => {
    // foo...txt は最後の . が拡張子区切りなので base="foo.." → trim → "foo" + ".txt"
    expect(sanitizeFilename('foo...txt', ['txt'])).toBe('foo.txt');
  });

  it('末尾の連続アンダースコアも trim される', () => {
    // 日本語が _ に置換されて末尾に連続するケース
    const out = sanitizeFilename('foo___', ['txt']);
    expect(out).toBe('foo.txt');
  });
});

describe('isSafeTicketId — チケット ID ホワイトリスト検証', () => {
  it('英数字・._- のみ 1〜64 文字は true', () => {
    expect(isSafeTicketId('T-00001')).toBe(true);
    expect(isSafeTicketId('ticket_2025.v1')).toBe(true);
  });

  it('スラッシュを含むと false', () => {
    expect(isSafeTicketId('a/b')).toBe(false);
  });

  it('バックスラッシュを含むと false', () => {
    expect(isSafeTicketId('a\\b')).toBe(false);
  });

  it('.. を含むと false', () => {
    expect(isSafeTicketId('..')).toBe(false);
    expect(isSafeTicketId('foo..bar')).toBe(false);
  });

  it('空文字は false', () => {
    expect(isSafeTicketId('')).toBe(false);
  });

  it('64 文字超は false', () => {
    expect(isSafeTicketId('a'.repeat(65))).toBe(false);
  });

  it('日本語は false', () => {
    expect(isSafeTicketId('チケット')).toBe(false);
  });

  it('スペースは false', () => {
    expect(isSafeTicketId('a b')).toBe(false);
  });

  it('NUL/制御文字は false', () => {
    expect(isSafeTicketId('a\x00b')).toBe(false);
  });
});
