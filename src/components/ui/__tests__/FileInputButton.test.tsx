// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FileInputButton } from '@/components/ui/FileInputButton';

afterEach(() => {
  cleanup();
});

describe('FileInputButton', () => {
  // ────────────────────────────────────────────
  // 基本レンダリング
  // ────────────────────────────────────────────

  it('children がラベルとして表示される', () => {
    render(<FileInputButton onChange={() => {}}>画像を選択</FileInputButton>);
    expect(screen.getByText('画像を選択')).toBeTruthy();
  });

  it('label 内包の input が file type で描画される', () => {
    render(<FileInputButton onChange={() => {}}>選択</FileInputButton>);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.tagName).toBe('INPUT');
    expect(fileInput.type).toBe('file');
  });

  it('getByLabelText でラベルテキストから input を取得できる (label-input 関連が正しい)', () => {
    // label 内包構造のため、Testing Library は label のテキストで input を解決できる
    render(
      <FileInputButton onChange={() => {}} id="test-file-input">
        ファイルを選択
      </FileInputButton>
    );
    const input = screen.getByLabelText('ファイルを選択') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('file');
  });

  // ────────────────────────────────────────────
  // onChange コールバック
  // ────────────────────────────────────────────

  it('ファイル選択時に onChange が呼ばれる', () => {
    const handler = vi.fn();
    render(<FileInputButton onChange={handler}>画像を選択</FileInputButton>);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('onChange は 1 回だけ呼ばれる (二重発火しない)', () => {
    const handler = vi.fn();
    render(<FileInputButton onChange={handler}>選択</FileInputButton>);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ────────────────────────────────────────────
  // disabled 状態 — 陽性対照 (検知できることを確認)
  // ────────────────────────────────────────────

  it('[陽性対照] disabled=true のとき aria-disabled="true" が label に付く', () => {
    render(
      <FileInputButton onChange={() => {}} disabled>
        選択不可
      </FileInputButton>
    );
    const label = screen.getByText('選択不可').closest('label');
    // 旧実装 (disabled prop なし) ではこのテストは fail する → 陽性対照として成立
    expect(label?.getAttribute('aria-disabled')).toBe('true');
  });

  it('[陽性対照] disabled=true のとき input に disabled 属性が付く', () => {
    render(
      <FileInputButton onChange={() => {}} disabled>
        選択不可
      </FileInputButton>
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);
  });

  // ────────────────────────────────────────────
  // disabled 状態 — 陰性対照 (誤検知しないことを確認)
  // ────────────────────────────────────────────

  it('[陰性対照] disabled=false のとき aria-disabled が label に付かない', () => {
    render(
      <FileInputButton onChange={() => {}} disabled={false}>
        有効
      </FileInputButton>
    );
    const label = screen.getByText('有効').closest('label');
    expect(label?.getAttribute('aria-disabled')).toBeNull();
  });

  it('[陰性対照] disabled 未指定のとき aria-disabled が label に付かない', () => {
    render(<FileInputButton onChange={() => {}}>有効</FileInputButton>);
    const label = screen.getByText('有効').closest('label');
    expect(label?.getAttribute('aria-disabled')).toBeNull();
  });

  it('[陰性対照] disabled=false のとき input に disabled 属性が付かない', () => {
    render(
      <FileInputButton onChange={() => {}} disabled={false}>
        有効
      </FileInputButton>
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.disabled).toBe(false);
  });

  // ────────────────────────────────────────────
  // className / props の伝播
  // ────────────────────────────────────────────

  it('className prop が label に追加される', () => {
    render(
      <FileInputButton onChange={() => {}} className="extra-class another-class">
        ラベル
      </FileInputButton>
    );
    const label = screen.getByText('ラベル').closest('label');
    expect(label?.className).toContain('btn-file-input');
    expect(label?.className).toContain('extra-class');
    expect(label?.className).toContain('another-class');
  });

  it('className prop 未指定のとき btn-file-input クラスのみ付く', () => {
    render(<FileInputButton onChange={() => {}}>ラベル</FileInputButton>);
    const label = screen.getByText('ラベル').closest('label');
    expect(label?.className).toBe('btn-file-input');
  });

  it('accept prop が input 要素に渡される', () => {
    render(
      <FileInputButton onChange={() => {}} accept="image/*">
        画像を選択
      </FileInputButton>
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toBe('image/*');
  });

  it('id prop が input 要素に渡される', () => {
    render(
      <FileInputButton onChange={() => {}} id="my-file-input">
        選択
      </FileInputButton>
    );
    const fileInput = document.getElementById('my-file-input') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.type).toBe('file');
  });
});
