// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClipboardInspectorTool } from '@/components/tools/ClipboardInspector';

afterEach(() => {
  cleanup();
});

/**
 * jsdom には DataTransfer がないため、コンポーネントが参照する範囲のみモック。
 * `delayMs` で getAsString コールバックの resolve を遅延でき、連続キャプチャの race を再現できる。
 */
function mockClipboardData(flavors: Record<string, string>, delayMs = 0): DataTransfer {
  const items = Object.entries(flavors).map(([type, content]) => ({
    kind: 'string',
    type,
    getAsString: (cb: ((data: string) => void) | null) => {
      if (cb) setTimeout(() => cb(content), delayMs);
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

  it('受付領域がスマホ長押しペースト用の contenteditable 属性群を持つ（issue #636）', () => {
    render(<ClipboardInspectorTool />);
    const zone = screen.getByRole('textbox', { name: /貼り付け受付領域/ });
    expect(zone.getAttribute('contenteditable')).toBe('true');
    // フォーカス時のソフトキーボード表示を抑制（長押しペーストメニューは出る想定）
    expect(zone.getAttribute('inputmode')).toBe('none');
  });

  it('受付領域への beforeinput が preventDefault され編集できない（陽性対照: 編集阻止ガード）', () => {
    // 編集阻止が無い実装（素の contenteditable）に当てると dispatchEvent が true を返し fail する設計
    render(<ClipboardInspectorTool />);
    const zone = screen.getByRole('textbox', { name: /貼り付け受付領域/ });
    const notPrevented = zone.dispatchEvent(
      new InputEvent('beforeinput', { bubbles: true, cancelable: true })
    );
    // dispatchEvent は preventDefault されると false を返す
    expect(notPrevented).toBe(false);
  });

  it('beforeinput を貫通した編集（IME 等）が input イベントで元の内容に復元される（陽性対照: 復元 fallback）', () => {
    // insertCompositionText の beforeinput は W3C Input Events 仕様で non-cancelable のため
    // preventDefault では阻止できない。貫通した DOM 編集を input イベント時に復元する fallback を検証する。
    //
    // 実 IME はキャレット位置 = 既存 <p> ノード「内部」のテキストノードを直接変異させる
    // （zone 直下への append ではない）。zone 直下 append での模擬は実 IME の挿入点を
    // bypass する偽の陽性対照だった（test-gates 鉄則 4 違反）ため、実挿入点で模擬する。
    // 同一ノード参照を保存・再装着する実装（deep clone なし）では保存ノード自体が
    // 変異済みのため復元が no-op になり、このテストは fail する設計（陽性対照）
    render(<ClipboardInspectorTool />);
    const zone = screen.getByRole('textbox', { name: /貼り付け受付領域/ });
    // 実 IME の挿入点を模擬: <p> 内部のテキストノードを直接変異させる
    const paragraph = zone.querySelector('p')!;
    const textNode = paragraph.firstChild!;
    textNode.textContent = `あいう${textNode.textContent}`;
    expect(zone.textContent).toContain('あいう');
    // 貫通編集が DOM に反映されると input イベントが発火する
    zone.dispatchEvent(new InputEvent('input', { bubbles: true }));
    // 元の案内文言へ復元され、貫通テキストは消えている
    expect(zone.textContent).not.toContain('あいう');
    expect(zone.textContent).toContain('Ctrl+V');
  });

  it('復元 fallback は連続した IME 貫通編集でも復元能力を維持する（master 汚染の回帰防止）', () => {
    // 復元時に master ノードを直接装着する実装だと、2 回目の IME 貫通で master 自体が
    // 汚染され以後の復元が壊れる。復元毎の再クローンが必要なことを 2 回連続の貫通で検証する
    render(<ClipboardInspectorTool />);
    const zone = screen.getByRole('textbox', { name: /貼り付け受付領域/ });
    for (const inserted of ['あいう', 'かきく']) {
      const paragraph = zone.querySelector('p')!;
      const textNode = paragraph.firstChild!;
      textNode.textContent = `${inserted}${textNode.textContent}`;
      zone.dispatchEvent(new InputEvent('input', { bubbles: true }));
      expect(zone.textContent).not.toContain(inserted);
      expect(zone.textContent).toContain('Ctrl+V');
    }
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

  it('クリアボタンで結果をリセットし、SR にクリアを通知する', async () => {
    const { container } = render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ 'text/plain': 'abc' }),
    });
    await waitFor(() => expect(screen.getByText('text/plain')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    expect(screen.queryByText('text/plain')).toBeNull();
    // SR 向け live region にクリア通知が流れる（空文字では SR に何も読まれない）
    const live = container.querySelector('[data-testid="clipboard-announcement"]');
    expect(live!.textContent).toBe('クリアしました');
  });

  it('クリア後に in-flight キャプチャが遅延 resolve しても結果を復活させない（陽性対照: clear の seq 無効化）', async () => {
    // Clear ハンドラが captureSeqRef を進めない実装だと、遅延 resolve が seq 一致のまま
    // snapshot を復活させ fail する設計（陽性対照）
    render(<ClipboardInspectorTool />);
    // 1 回目: 即時 resolve → snapshot 表示（クリアボタンが出る）
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ 'text/plain': '最初のデータ' }),
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'クリア' })).toBeTruthy());
    // 2 回目: resolve を 50ms 遅延（in-flight キャプチャ）
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ 'text/plain': '遅延データ' }, 50),
    });
    // 2 回目の resolve 前にクリア
    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    expect(screen.queryByText('最初のデータ')).toBeNull();
    // 遅延 resolve を待っても結果が復活しないこと
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByText('遅延データ')).toBeNull();
    expect(screen.queryByText('text/plain')).toBeNull();
  });

  it('type が空のフレーバーは表示タイトルとコピーボタンの aria-label を "(type 不明)" に揃える', async () => {
    render(<ClipboardInspectorTool />);
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ '': '型なしデータ' }),
    });
    await waitFor(() => expect(screen.getByText('型なしデータ')).toBeTruthy());
    expect(screen.getByText('(type 不明)')).toBeTruthy();
    // SR 向け名前も空 type を露出させず（" の内容をコピー" にならず）フォールバックで揃える
    expect(screen.getByRole('button', { name: '(type 不明) の内容をコピー' })).toBeTruthy();
  });

  it('連続 paste で先行キャプチャの遅延 resolve が後発の結果を上書きしない', async () => {
    render(<ClipboardInspectorTool />);
    // 1 回目: getAsString の resolve を 50ms 遅延（大きい HTML の貼り付けを模擬）
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ 'text/plain': '遅い貼り付け' }, 50),
    });
    // 2 回目: 即時 resolve（小さい text の貼り付けを模擬）
    fireEvent.paste(document, {
      clipboardData: mockClipboardData({ 'text/plain': '速い貼り付け' }),
    });
    await waitFor(() => expect(screen.getByText('速い貼り付け')).toBeTruthy());
    // 先行キャプチャ（50ms 遅延）の resolve を待ってから、stale な結果で上書きされていないことを確認
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByText('速い貼り付け')).toBeTruthy();
    expect(screen.queryByText('遅い貼り付け')).toBeNull();
  });
});
