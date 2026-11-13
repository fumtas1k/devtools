// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CertDecoder } from '@/components/tools/CertDecoder';
import * as cert from '@/utils/cert';
import { makeTestChain, type TestChain } from '@/utils/__tests__/cert-fixtures';
import { PKCS12_RSA_BASE64, PKCS12_PASSWORD } from '@/utils/__tests__/cert-pkcs12-fixtures';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let chain: TestChain;
beforeAll(async () => {
  chain = await makeTestChain();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CertDecoder の入力競合', () => {
  it('先に選択したファイルが遅れて完了しても後のファイルを上書きしない', async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const first = new File([], 'first.pem');
    const second = new File([], 'second.pem');
    Object.defineProperty(first, 'text', { value: () => a.promise });
    Object.defineProperty(second, 'text', { value: () => b.promise });
    const { container } = render(<CertDecoder />);
    const fileInput = container.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [first] } });
    fireEvent.change(fileInput, { target: { files: [second] } });
    await act(async () => b.resolve('newer file'));
    await act(async () => a.resolve('older file'));
    expect((screen.getByLabelText('証明書を貼り付け') as HTMLTextAreaElement).value).toBe(
      'newer file'
    );
  });

  it('復号中に別の証明書を入力すると古い復号結果と秘密鍵を反映しない', async () => {
    const result = await cert.parsePkcs12(
      Uint8Array.from(atob(PKCS12_RSA_BASE64), (c) => c.charCodeAt(0)),
      PKCS12_PASSWORD
    );
    const parsed = await cert.parseDerCertificates(result.certs);
    const built = await cert.buildChain(parsed.certs);
    const gate = deferred<typeof result>();
    vi.spyOn(cert, 'parsePkcs12').mockReturnValue(gate.promise);
    vi.spyOn(cert, 'parseDerCertificates').mockResolvedValue(parsed);
    const actualBuild = cert.buildChain;
    vi.spyOn(cert, 'buildChain').mockImplementation((certs) =>
      certs === parsed.certs ? Promise.resolve(built) : actualBuild(certs)
    );
    render(<CertDecoder />);
    const input = screen.getByLabelText('証明書を貼り付け');
    fireEvent.change(input, { target: { value: PKCS12_RSA_BASE64 } });
    const password = await screen.findByLabelText('パスワード');
    fireEvent.change(password, { target: { value: PKCS12_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    fireEvent.change(input, { target: { value: chain.rootPem } });
    await screen.findByText(/ルート CA（自己署名）/);
    await act(async () => gate.resolve(result));
    expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
    expect(screen.queryByText('秘密鍵 #1')).toBeNull();
    expect(screen.queryByText(/pkcs12-test\.example/)).toBeNull();
  });

  it.each(['DER', 'chain'] as const)(
    '復号後の %s 処理中に入力が変わったら古い結果を反映しない',
    async (stage) => {
      const result = await cert.parsePkcs12(
        Uint8Array.from(atob(PKCS12_RSA_BASE64), (c) => c.charCodeAt(0)),
        PKCS12_PASSWORD
      );
      const parsed = await cert.parseDerCertificates(result.certs);
      const built = await cert.buildChain(parsed.certs);
      const derGate = deferred<typeof parsed>();
      const chainGate = deferred<typeof built>();
      vi.spyOn(cert, 'parsePkcs12').mockResolvedValue(result);
      const der = vi
        .spyOn(cert, 'parseDerCertificates')
        .mockImplementation(() => (stage === 'DER' ? derGate.promise : Promise.resolve(parsed)));
      const actualBuild = cert.buildChain;
      const build = vi.spyOn(cert, 'buildChain').mockImplementation((certs) => {
        if (certs === parsed.certs)
          return stage === 'chain' ? chainGate.promise : Promise.resolve(built);
        return actualBuild(certs);
      });
      render(<CertDecoder />);
      const input = screen.getByLabelText('証明書を貼り付け');
      fireEvent.change(input, { target: { value: PKCS12_RSA_BASE64 } });
      fireEvent.change(await screen.findByLabelText('パスワード'), {
        target: { value: PKCS12_PASSWORD },
      });
      fireEvent.click(screen.getByRole('button', { name: '解析' }));
      await waitFor(() => {
        if (stage === 'DER') expect(der).toHaveBeenCalled();
        else expect(build.mock.calls.some(([certs]) => certs === parsed.certs)).toBe(true);
      });
      fireEvent.change(input, { target: { value: chain.rootPem } });
      await screen.findByText(/ルート CA（自己署名）/);
      await act(async () => {
        if (stage === 'DER') derGate.resolve(parsed);
        else chainGate.resolve(built);
      });
      expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
      expect(screen.queryByText('秘密鍵 #1')).toBeNull();
    }
  );

  it('古い復号の失敗は新しい証明書の結果を上書きしない', async () => {
    const gate = deferred<cert.Pkcs12Result>();
    vi.spyOn(cert, 'parsePkcs12').mockReturnValue(gate.promise);
    render(<CertDecoder />);
    const input = screen.getByLabelText('証明書を貼り付け');
    fireEvent.change(input, { target: { value: PKCS12_RSA_BASE64 } });
    fireEvent.change(await screen.findByLabelText('パスワード'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    fireEvent.change(input, { target: { value: chain.rootPem } });
    await screen.findByText(/ルート CA（自己署名）/);
    await act(async () =>
      gate.resolve({ certs: [], privateKeys: [], error: '古いエラー', errorKind: 'wrong-password' })
    );
    expect(screen.queryByText('古いエラー')).toBeNull();
    expect(screen.queryByLabelText('パスワード')).toBeNull();
    expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
  });

  it('古い復号後のチェーン構築失敗は新しい証明書を上書きしない', async () => {
    const result = await cert.parsePkcs12(
      Uint8Array.from(atob(PKCS12_RSA_BASE64), (c) => c.charCodeAt(0)),
      PKCS12_PASSWORD
    );
    const parsed = await cert.parseDerCertificates(result.certs);
    const gate = deferred<cert.ChainResult>();
    vi.spyOn(cert, 'parsePkcs12').mockResolvedValue(result);
    vi.spyOn(cert, 'parseDerCertificates').mockResolvedValue(parsed);
    const actualBuild = cert.buildChain;
    const build = vi
      .spyOn(cert, 'buildChain')
      .mockImplementation((certs) => (certs === parsed.certs ? gate.promise : actualBuild(certs)));
    render(<CertDecoder />);
    const input = screen.getByLabelText('証明書を貼り付け');
    fireEvent.change(input, { target: { value: PKCS12_RSA_BASE64 } });
    fireEvent.change(await screen.findByLabelText('パスワード'), {
      target: { value: PKCS12_PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    await waitFor(() =>
      expect(build.mock.calls.some(([certs]) => certs === parsed.certs)).toBe(true)
    );
    fireEvent.change(input, { target: { value: chain.rootPem } });
    await screen.findByText(/ルート CA（自己署名）/);
    await act(async () => gate.reject(new Error('古いチェーンエラー')));
    expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('読み込み中にテキストをクリアすると古いファイルを反映しない', async () => {
    const a = deferred<string>();
    const file = new File([], 'first.pem');
    Object.defineProperty(file, 'text', { value: () => a.promise });
    const { container } = render(<CertDecoder />);
    const input = screen.getByLabelText('証明書を貼り付け');
    fireEvent.change(input, { target: { value: 'temporary' } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => a.resolve('older file'));
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('古いファイルの読み取り失敗は新しい入力にエラーを表示しない', async () => {
    const a = deferred<string>();
    const file = new File([], 'old.pem');
    Object.defineProperty(file, 'text', { value: () => a.promise });
    const { container } = render(<CertDecoder />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('証明書を貼り付け'), {
      target: { value: chain.rootPem },
    });
    await screen.findByText(/ルート CA（自己署名）/);
    await act(async () => a.reject(new Error('old file failure')));
    expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('最新のファイル読み取り失敗を表示し、次の入力で回復する', async () => {
    const a = deferred<string>();
    const file = new File([], 'failed.pem');
    Object.defineProperty(file, 'text', { value: () => a.promise });
    const { container } = render(<CertDecoder />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await act(async () => a.reject(new Error('private data must not appear')));
    expect(screen.getByRole('alert').textContent).toContain('ファイルの読み込みに失敗しました');
    expect(screen.queryByText(/private data must not appear/)).toBeNull();
    fireEvent.change(screen.getByLabelText('証明書を貼り付け'), {
      target: { value: chain.rootPem },
    });
    await screen.findByText(/ルート CA（自己署名）/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('PKCS#12 ファイルの遅い読み取りが新しいファイルを上書きしない', async () => {
    const a = deferred<ArrayBuffer>();
    const oldFile = new File([], 'old.p12');
    Object.defineProperty(oldFile, 'arrayBuffer', { value: () => a.promise });
    const newFile = new File([], 'new.pem');
    Object.defineProperty(newFile, 'text', { value: () => Promise.resolve(chain.rootPem) });
    const { container } = render(<CertDecoder />);
    const fileInput = container.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [oldFile] } });
    fireEvent.change(fileInput, { target: { files: [newFile] } });
    await screen.findByText(/ルート CA（自己署名）/);
    await act(async () => a.resolve(new Uint8Array([1, 2]).buffer));
    expect(screen.getByText(/ルート CA（自己署名）/)).toBeTruthy();
    expect(screen.queryByLabelText('パスワード')).toBeNull();
  });

  it('テキスト解析中に PKCS#12 を選ぶと古い解析を反映しない', async () => {
    const parsed = await cert.parseCertificates(chain.rootPem);
    const gate = deferred<typeof parsed>();
    const parse = vi.spyOn(cert, 'parseCertificates').mockReturnValue(gate.promise);
    const file = new File([], 'key.p12');
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
    });
    const { container } = render(<CertDecoder />);
    const input = screen.getByLabelText('証明書を貼り付け') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: chain.rootPem } });
    await waitFor(() => expect(parse).toHaveBeenCalled());
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByLabelText('パスワード');
    await act(async () => gate.resolve(parsed));
    expect(input.value).toBe('');
    expect(screen.getByLabelText('パスワード')).toBeTruthy();
    expect(screen.queryByText(/ルート CA（自己署名）/)).toBeNull();
  });

  it('同じ内容のファイルを再選択しても再解析される', async () => {
    const file = new File([], 'same.pem');
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(chain.rootPem) });
    const { container } = render(<CertDecoder />);
    const fileInput = container.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByText(/ルート CA（自己署名）/);
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByText(/ルート CA（自己署名）/);
  });

  it('古い DER ファイルが後から読み終わっても新しいテキストを維持する', async () => {
    const gate = deferred<ArrayBuffer>();
    const file = new File([], 'old.der');
    Object.defineProperty(file, 'arrayBuffer', { value: () => gate.promise });
    const { container } = render(<CertDecoder />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    const input = screen.getByLabelText('証明書を貼り付け') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: chain.rootPem } });
    await screen.findByText(/ルート CA（自己署名）/);
    await act(async () => gate.resolve(new Uint8Array([1, 2]).buffer));
    expect(input.value).toBe(chain.rootPem);
  });

  it('PKCS#12 ファイル選択は入力を空にし、誤パスワード後に再試行できる', async () => {
    const file = new File([], 'key.p12');
    const bytes = Uint8Array.from(atob(PKCS12_RSA_BASE64), (c) => c.charCodeAt(0));
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes.buffer) });
    const { container } = render(<CertDecoder />);
    const input = screen.getByLabelText('証明書を貼り付け') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'old input' } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    const password = await screen.findByLabelText('パスワード');
    expect(input.value).toBe('');
    fireEvent.change(password, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    await screen.findByText(/パスワードが正しくありません/);
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: PKCS12_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    await screen.findByText('秘密鍵 #1');
  });

  it('アンマウント後の遅い復号は後続の証明書パースを始めない', async () => {
    const result = await cert.parsePkcs12(
      Uint8Array.from(atob(PKCS12_RSA_BASE64), (c) => c.charCodeAt(0)),
      PKCS12_PASSWORD
    );
    const gate = deferred<typeof result>();
    vi.spyOn(cert, 'parsePkcs12').mockReturnValue(gate.promise);
    const parseDer = vi.spyOn(cert, 'parseDerCertificates');
    const { unmount } = render(<CertDecoder />);
    fireEvent.change(screen.getByLabelText('証明書を貼り付け'), {
      target: { value: PKCS12_RSA_BASE64 },
    });
    fireEvent.change(await screen.findByLabelText('パスワード'), {
      target: { value: PKCS12_PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    unmount();
    await act(async () => gate.resolve(result));
    expect(parseDer).not.toHaveBeenCalled();
  });
});
