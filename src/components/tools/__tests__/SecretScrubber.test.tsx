// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { SecretScrubberTool } from '@/components/tools/SecretScrubber';
import { copyToClipboard } from '@/utils/clipboard';

// コピー内容の検証用にクリップボード書き込みをモックする
vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// a11y: live region 常設テスト（陽性対照）
// ─────────────────────────────────────────────────────────────────────────────

describe('SecretScrubber — a11y live region 常設（陽性対照）', () => {
  it('検出サマリ用 sr-only live region が入力前から role="status" aria-live="polite" で常設される', () => {
    const { container } = render(<SecretScrubberTool />);
    const el = container.querySelector('[data-testid="scrubber-announcement"]');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('status');
    expect(el!.getAttribute('aria-live')).toBe('polite');
    // 入力前は文言が空
    expect(el!.textContent).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 陽性対照: 検出機能の動作確認
// ─────────────────────────────────────────────────────────────────────────────

describe('SecretScrubber — 陽性対照（実際に検出・マスクする）', () => {
  it('AWS ダミーキーを貼り付けると出力にプレースホルダが表示され元の値が消える', async () => {
    render(<SecretScrubberTool />);
    const awsKey = 'AKIAIOSFODNN7EXAMPLE';
    const textarea = screen.getByLabelText('テキストを貼り付け');

    act(() => {
      fireEvent.change(textarea, { target: { value: awsKey } });
    });

    // debounce 後に出力が現れるのを待つ
    await waitFor(
      () => {
        const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
        expect(output.value).toContain('[REDACTED:');
      },
      { timeout: 2000 }
    );

    const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
    expect(output.value).not.toContain(awsKey);
  });

  it('メールアドレスを入力すると APIキーチップのカウントバッジは更新される', async () => {
    render(<SecretScrubberTool />);
    const email = 'user@example.com';
    const textarea = screen.getByLabelText('テキストを貼り付け');

    act(() => {
      fireEvent.change(textarea, { target: { value: email } });
    });

    // メールカテゴリのカウントが表示されるまで待つ
    await waitFor(
      () => {
        const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
        expect(output.value).toContain('[REDACTED:EMAIL_1]');
      },
      { timeout: 2000 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 陰性対照: 平文では検出されない
// ─────────────────────────────────────────────────────────────────────────────

describe('SecretScrubber — 陰性対照（平文を誤検出しない）', () => {
  it('機密情報を含まない平文では出力が入力と同じになる', async () => {
    render(<SecretScrubberTool />);
    const plain = 'Hello, World! This is just a plain text.';
    const textarea = screen.getByLabelText('テキストを貼り付け');

    act(() => {
      fireEvent.change(textarea, { target: { value: plain } });
    });

    // debounce 完了後、出力が入力そのままになる（pending 中は前回結果 = 空のまま）
    await waitFor(
      () => {
        const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
        expect(output.value).toBe(plain);
      },
      { timeout: 2000 }
    );

    const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
    expect(output.value).not.toContain('[REDACTED:');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// トグル OFF のテスト
// ─────────────────────────────────────────────────────────────────────────────

describe('SecretScrubber — トグル OFF', () => {
  it('EMAIL チップを OFF にするとメールが素通しされる', async () => {
    render(<SecretScrubberTool />);
    const email = 'user@example.com';

    // メールを入力
    const textarea = screen.getByLabelText('テキストを貼り付け');
    act(() => {
      fireEvent.change(textarea, { target: { value: email } });
    });

    // 先に検出されることを確認（陽性対照）
    await waitFor(
      () => {
        const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
        expect(output.value).toContain('[REDACTED:EMAIL_1]');
      },
      { timeout: 2000 }
    );

    // EMAIL チップを OFF にする
    const emailChip = screen.getByRole('button', { name: /メール/ });
    act(() => {
      fireEvent.click(emailChip);
    });

    // OFF 後はメールが素通しになる
    await waitFor(
      () => {
        const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
        expect(output.value).toContain(email);
        expect(output.value).not.toContain('[REDACTED:EMAIL_1]');
      },
      { timeout: 2000 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// サンプル入力ボタン
// ─────────────────────────────────────────────────────────────────────────────

describe('SecretScrubber — サンプル入力ボタン', () => {
  it('サンプルを入力ボタンクリックで入力欄にサンプルが入る', () => {
    render(<SecretScrubberTool />);
    const sampleBtn = screen.getByRole('button', { name: 'サンプルを入力' });
    act(() => {
      fireEvent.click(sampleBtn);
    });
    const textarea = screen.getByLabelText('テキストを貼り付け') as HTMLTextAreaElement;
    expect(textarea.value.length).toBeGreaterThan(0);
    expect(textarea.value).toContain('AKIAIOSFODNN7EXAMPLE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// クリアボタン
// ─────────────────────────────────────────────────────────────────────────────

describe('SecretScrubber — クリアボタン', () => {
  it('入力後にクリアボタンをクリックすると入力欄が空になる', () => {
    render(<SecretScrubberTool />);
    const textarea = screen.getByLabelText('テキストを貼り付け');
    act(() => {
      fireEvent.change(textarea, { target: { value: 'some text' } });
    });
    expect(screen.getByRole('button', { name: 'クリア' })).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    });
    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// コピー内容（issue #780: 設定変更直後の debounce 中に変更前の結果をコピーさせない）
// ─────────────────────────────────────────────────────────────────────────────

describe('SecretScrubber — コピー内容', () => {
  const email = 'user@example.com';

  async function inputEmailAndWaitMasked() {
    render(<SecretScrubberTool />);
    act(() => {
      fireEvent.change(screen.getByLabelText('テキストを貼り付け'), { target: { value: email } });
    });
    await waitFor(
      () => {
        const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
        expect(output.value).toContain('[REDACTED:EMAIL_1]');
      },
      { timeout: 2000 }
    );
  }

  it('陽性対照: マスクを OFF → ON に戻した直後（debounce 経過前）にコピーしても、マスク済みの結果がコピーされる', async () => {
    await inputEmailAndWaitMasked();

    // OFF にして、素通し（未マスク）の出力が表示されるまで待つ
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /メール/ }));
    });
    await waitFor(
      () => {
        const output = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
        expect(output.value).toContain(email);
      },
      { timeout: 2000 }
    );

    // ON に戻した直後、debounce 経過を待たずにコピーする。
    // この時点の表示（outputText）はまだ OFF 時点の未マスク結果のまま。
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /メール/ }));
    });
    const displayed = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;
    expect(displayed.value).toContain(email);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '出力テキストをコピー' }));
    });

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledTimes(1));
    const copied = vi.mocked(copyToClipboard).mock.calls[0][0];
    // 旧実装は表示中の古い出力をコピーするため、ここでメール平文が含まれて fail する
    expect(copied).not.toContain(email);
    expect(copied).toContain('[REDACTED:EMAIL_1]');
  });

  it('陰性対照: 設定を変えずにコピーすると、表示されている出力と同じ内容がコピーされる', async () => {
    await inputEmailAndWaitMasked();
    const displayed = screen.getByLabelText('マスク済みテキスト') as HTMLTextAreaElement;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '出力テキストをコピー' }));
    });

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledTimes(1));
    expect(vi.mocked(copyToClipboard).mock.calls[0][0]).toBe(displayed.value);
  });
});
