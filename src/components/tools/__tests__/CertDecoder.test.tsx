// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CertDecoder } from '@/components/tools/CertDecoder';
import { makeTestChain, type TestChain } from '@/utils/__tests__/cert-fixtures';
import { PKCS12_RSA_BASE64, PKCS12_PASSWORD } from '@/utils/__tests__/cert-pkcs12-fixtures';

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

  // PKCS#12: Base64 貼り付けでパスワード入力 UI へ振り分けられること。
  // p12 は先頭 0x30 のため detect では DER 証明書扱い（パース失敗 cert 1 件）になる。
  // certs.length での振り分けだとここで証明書カードが出てしまう（回帰防止）。
  it('PKCS#12 の Base64 を貼り付けるとパスワード入力欄が表示される', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: PKCS12_RSA_BASE64 } });
    await waitFor(() => {
      expect(screen.getByLabelText('パスワード')).toBeTruthy();
    });
    // 証明書「パース失敗」カードが誤表示されていないこと
    expect(screen.queryByText('パース失敗')).toBeNull();
  });

  it('PKCS#12 を正しいパスワードで解析すると証明書と秘密鍵が表示される', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: PKCS12_RSA_BASE64 } });
    const pwd = await screen.findByLabelText('パスワード');
    fireEvent.change(pwd, { target: { value: PKCS12_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    await waitFor(
      () => {
        expect(screen.getByText('秘密鍵 #1')).toBeTruthy();
        expect(screen.getAllByText(/pkcs12-test\.example/).length).toBeGreaterThan(0);
      },
      { timeout: 8000 }
    );
  });

  it('PKCS#12 を誤ったパスワードで解析するとエラーが表示される', async () => {
    render(<CertDecoder />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: PKCS12_RSA_BASE64 } });
    const pwd = await screen.findByLabelText('パスワード');
    fireEvent.change(pwd, { target: { value: 'wrong-password-xxx' } });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    await waitFor(() => {
      expect(screen.getByText(/パスワードが正しくありません/)).toBeTruthy();
    });
  });
});
