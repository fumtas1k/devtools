// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CertDecoder } from '@/components/tools/CertDecoder';
import { makeTestChain, type TestChain } from '@/utils/__tests__/cert-fixtures';

afterEach(() => {
  cleanup();
});

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

describe('CertDecoder', () => {
  it('入力欄が表示される', () => {
    render(<CertDecoder />);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('PEM を貼り付けると Subject が表示される', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: chain.leafPem } });
    await waitFor(() => {
      // 複数の CN= 表示があるため getAllByText を使用
      expect(screen.getAllByText(/CN=/).length).toBeGreaterThan(0);
    });
  });

  it('不正な入力でエラーが表示される', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not a cert' } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('単独の leaf 証明書を「ルート CA」と誤表示しない（自己署名のみ Root 扱い）', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: chain.leafPem } });
    await waitFor(() => {
      expect(screen.getByText(/リーフ（サーバ証明書）/)).toBeTruthy();
    });
    // leaf は自己署名ではないため「ルート CA」ラベルは出ない
    expect(screen.queryByText(/ルート CA/)).toBeNull();
  });

  it('自己署名のルート証明書は「ルート CA（自己署名）」と表示する', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: chain.rootPem } });
    await waitFor(() => {
      expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
    });
  });

  it('「サンプルを入力」でサンプルチェーンが解析・表示される', async () => {
    render(<CertDecoder />);
    fireEvent.click(screen.getByRole('button', { name: 'サンプルを入力' }));
    await waitFor(() => {
      // サンプルは root→intermediate→leaf の 3 枚。自己署名 root とリーフが表示される
      expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
      expect(screen.getByText(/リーフ（サーバ証明書）/)).toBeTruthy();
    });
  });
});
