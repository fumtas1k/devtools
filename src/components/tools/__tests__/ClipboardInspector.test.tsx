// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClipboardInspectorTool } from '@/components/tools/ClipboardInspector';

afterEach(() => {
  cleanup();
});

/** jsdom には DataTransfer がないため、コンポーネントが参照する範囲のみモック */
function mockClipboardData(flavors: Record<string, string>): DataTransfer {
  const items = Object.entries(flavors).map(([type, content]) => ({
    kind: 'string',
    type,
    getAsString: (cb: ((data: string) => void) | null) => {
      if (cb) setTimeout(() => cb(content), 0);
    },
    getAsFile: () => null,
  }));
  return { items: Object.assign([...items], { length: items.length }) } as unknown as DataTransfer;
}

describe('ClipboardInspector — 初期表示', () => {
  it('貼り付け/ドロップ受付領域と SR 向け live region が常設される', () => {
    const { container } = render(<ClipboardInspectorTool />);
    expect(screen.getByText(/Ctrl\+V/)).toBeTruthy();
    const live = container.querySelector('[data-testid="clipboard-announcement"]');
    expect(live).not.toBeNull();
    expect(live!.getAttribute('role')).toBe('status');
    expect(live!.getAttribute('aria-live')).toBe('polite');
  });
});

describe('ClipboardInspector — paste 捕捉', () => {
  it('text/plain と text/html のフレーバーカードを表示する', async () => {
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({
        'text/plain': 'こんにちは',
        'text/html': '<p>こんにちは</p>',
      }),
    });
    await waitFor(() => {
      expect(screen.getByText('text/plain')).toBeTruthy();
      expect(screen.getByText('text/html')).toBeTruthy();
      expect(screen.getByText('こんにちは')).toBeTruthy();
    });
    // 経路バッジ
    expect(screen.getByText('貼り付け')).toBeTruthy();
  });

  it('text/html カードのプレビュー切替で iframe が表示され、安全なタグは保持される（陽性対照）', async () => {
    // sanitizeHtml が何もしない実装でも <p>safe</p> は残るため、
    // このテストは「サニタイズが通る経路であること」を確認する陽性対照として機能する
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({
        'text/html': '<p>safe</p><script>alert(1)</script>',
      }),
    });
    await waitFor(() => expect(screen.getByText('text/html')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'サニタイズ後プレビュー' }));
    const iframe = await screen.findByTitle('サニタイズ後プレビュー');
    const srcdoc = iframe.getAttribute('srcdoc')!;
    // 陽性対照: 安全タグはサニタイズ後も保持される（sanitizeHtml が srcdoc に反映されている経路確認）
    expect(srcdoc).toContain('<p>safe</p>');
  });

  it('text/html プレビューで危険なスクリプトタグが除去される（陽性対照: sanitizeHtml の検知能力証明）', async () => {
    // このテストは sanitizeHtml が空実装（入力をそのまま返す）だと fail する設計になっている。
    // 旧実装（sanitize なし）に当てると srcdoc に <script が残るため fail → 検知能力の証明。
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({
        'text/html': '<p>ok</p><script>alert("xss")</script><img onerror="evil()">',
      }),
    });
    await waitFor(() => expect(screen.getByText('text/html')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'サニタイズ後プレビュー' }));
    const iframe = await screen.findByTitle('サニタイズ後プレビュー');
    const srcdoc = iframe.getAttribute('srcdoc')!;
    // 危険要素が除去されていること（sanitizeHtml が空実装なら fail する）
    expect(srcdoc).not.toContain('<script');
    expect(srcdoc).not.toContain('onerror');
  });

  it('クリアボタンで結果をリセットする', async () => {
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ 'text/plain': 'abc' }),
    });
    await waitFor(() => expect(screen.getByText('text/plain')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    expect(screen.queryByText('text/plain')).toBeNull();
  });
});
