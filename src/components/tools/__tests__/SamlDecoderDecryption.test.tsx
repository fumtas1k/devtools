// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SamlDecoderTool } from '../SamlDecoder';
const fixture = (name: string) => readFileSync(`tests/fixtures/saml-encryption/${name}`, 'utf8');
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('明示的に選んだ Assertion を復号し、鍵欄を消し、結果を初期状態でマスクする', () => {
  let worker: DelayedWorker | undefined;
  class DelayedWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      worker = this;
    }
  }
  vi.stubGlobal('Worker', DelayedWorker);
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: fixture('xmlsec-aes128.xml') },
  });
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  const key = screen.getByLabelText('秘密鍵（PKCS#8 PEM）') as HTMLTextAreaElement;
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  expect(key.value).toBe('');
  expect(worker?.postMessage).toHaveBeenCalledOnce();
  act(() =>
    worker?.onmessage?.({
      data: { plaintext: new TextEncoder().encode(fixture('expected.xml')) },
    } as MessageEvent)
  );
  expect(
    screen.getByRole('heading', { name: '暗号化された Assertion 1 の復号結果（署名未検証）' })
  ).toBeTruthy();
  expect(screen.queryByText(/試験太郎/)).toBeNull();
  expect(screen.getByText(/REDACTED:PII_1/)).toBeTruthy();
});

it('入力変更後は古い Worker 応答を表示しない', () => {
  let worker: DelayedWorker | undefined;
  class DelayedWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      worker = this;
    }
  }
  vi.stubGlobal('Worker', DelayedWorker);
  render(<SamlDecoderTool />);
  const input = screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/);
  fireEvent.change(input, { target: { value: fixture('xmlsec-aes128.xml') } });
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('秘密鍵（PKCS#8 PEM）'), {
    target: { value: fixture('trial-key.pem') },
  });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  fireEvent.change(input, { target: { value: fixture('xmlsec-aes256.xml') } });
  expect(worker?.terminate).toHaveBeenCalledOnce();
  act(() =>
    worker?.onmessage?.({
      data: { plaintext: new TextEncoder().encode(fixture('expected.xml')) },
    } as MessageEvent)
  );
  expect(screen.queryByText(/REDACTED:PII_1/)).toBeNull();
  expect(screen.queryByText(/試験太郎/)).toBeNull();
});

it.each(['cancel', 'key', 'target', 'pagehide', 'pageshow', 'unmount'] as const)(
  '%s で実行中の結果と遅延応答を破棄する',
  (action) => {
    let worker: DelayedWorker | undefined;
    class DelayedWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() {
        worker = this;
      }
    }
    vi.stubGlobal('Worker', DelayedWorker);
    const mounted = render(<SamlDecoderTool />);
    fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
      target: { value: fixture('xmlsec-aes128.xml') },
    });
    fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('秘密鍵（PKCS#8 PEM）'), {
      target: { value: fixture('trial-key.pem') },
    });
    fireEvent.click(screen.getByRole('button', { name: '復号する' }));
    if (action === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    if (action === 'key')
      fireEvent.change(screen.getByLabelText('秘密鍵（PKCS#8 PEM）'), { target: { value: 'new' } });
    if (action === 'target')
      fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '' } });
    if (action === 'pagehide') fireEvent(window, new PageTransitionEvent('pagehide'));
    if (action === 'pageshow')
      fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
    if (action === 'unmount') mounted.unmount();
    expect(worker?.terminate).toHaveBeenCalledOnce();
    const stale = new TextEncoder().encode(fixture('expected.xml'));
    act(() => worker?.onmessage?.({ data: { plaintext: stale } } as MessageEvent));
    expect(stale.every((b) => b === 0)).toBe(true);
    expect(screen.queryByText(/REDACTED:PII_1/)).toBeNull();
    expect(screen.queryByText(/試験太郎/)).toBeNull();
  }
);

it('復号成功後に次の操作が失敗すると古い平文を残さない', () => {
  const workers: DelayedWorker[] = [];
  class DelayedWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      workers.push(this);
    }
  }
  vi.stubGlobal('Worker', DelayedWorker);
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: fixture('xmlsec-aes128.xml') },
  });
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  const key = screen.getByLabelText('秘密鍵（PKCS#8 PEM）');
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  act(() =>
    workers[0].onmessage?.({
      data: { plaintext: new TextEncoder().encode(fixture('expected.xml')) },
    } as MessageEvent)
  );
  expect(screen.getByText(/REDACTED:PII_1/)).toBeTruthy();
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  act(() => workers[1].onmessage?.({ data: { error: '復号に失敗しました' } } as MessageEvent));
  expect(screen.getByRole('alert').textContent).toContain('復号に失敗しました');
  expect(screen.queryByText(/REDACTED:PII_1/)).toBeNull();
  expect(screen.queryByText(/試験太郎/)).toBeNull();
});

it('15 秒で worker を停止し遅延応答を破棄する', () => {
  let worker: DelayedWorker | undefined;
  class DelayedWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      worker = this;
    }
  }
  vi.stubGlobal('Worker', DelayedWorker);
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: fixture('xmlsec-aes128.xml') },
  });
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('秘密鍵（PKCS#8 PEM）'), {
    target: { value: fixture('trial-key.pem') },
  });
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('button', { name: '復号する' }));
    act(() => vi.advanceTimersByTime(15000));
    expect(worker?.terminate).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('15 秒');
    act(() =>
      worker?.onmessage?.({
        data: { plaintext: new TextEncoder().encode(fixture('expected.xml')) },
      } as MessageEvent)
    );
    expect(screen.queryByText(/REDACTED:PII_1/)).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it.each(['clear', 'pagehide', 'pageshow'] as const)('復号済み結果も %s で消去する', (action) => {
  let worker: DelayedWorker | undefined;
  class DelayedWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      worker = this;
    }
  }
  vi.stubGlobal('Worker', DelayedWorker);
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: fixture('xmlsec-aes128.xml') },
  });
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('秘密鍵（PKCS#8 PEM）'), {
    target: { value: fixture('trial-key.pem') },
  });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  act(() =>
    worker?.onmessage?.({
      data: { plaintext: new TextEncoder().encode(fixture('expected.xml')) },
    } as MessageEvent)
  );
  expect(screen.getByText(/REDACTED:PII_1/)).toBeTruthy();
  if (action === 'clear') fireEvent.click(screen.getByRole('button', { name: /^クリア$/ }));
  if (action === 'pagehide') fireEvent(window, new PageTransitionEvent('pagehide'));
  if (action === 'pageshow')
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
  expect(screen.queryByText(/REDACTED:PII_1/)).toBeNull();
  expect(screen.queryByText(/試験太郎/)).toBeNull();
});

it('Response の署名一致を復号結果の署名へ引き継がない', () => {
  const workers: DelayedWorker[] = [];
  class DelayedWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      workers.push(this);
    }
  }
  vi.stubGlobal('Worker', DelayedWorker);
  render(<SamlDecoderTool />);
  const xml = fixture('xmlsec-aes128.xml').replace(
    '<saml:EncryptedAssertion>',
    '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/><saml:EncryptedAssertion>'
  );
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: xml },
  });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  act(() =>
    workers[0].onmessage?.({
      data: {
        results: [{ label: 'Response', id: null, signed: true, status: 'match', reason: '一致' }],
      },
    } as MessageEvent)
  );
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('秘密鍵（PKCS#8 PEM）'), {
    target: { value: fixture('trial-key.pem') },
  });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  act(() =>
    workers[1].onmessage?.({
      data: { plaintext: new TextEncoder().encode(fixture('expected.xml')) },
    } as MessageEvent)
  );
  const result = screen
    .getByRole('heading', { name: '暗号化された Assertion 1 の復号結果（署名未検証）' })
    .closest('section');
  expect(result).toBeTruthy();
  expect(within(result!).queryByText('署名あり（一致）')).toBeNull();
  expect(within(result!).getByText(/元の Response の署名結果は暗号文/)).toBeTruthy();
});
