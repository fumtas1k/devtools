// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { MessageChannel } from 'node:worker_threads';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as keyParser from '@/utils/saml/decryption-key';
import { SamlDecryption } from '../SamlDecryption';

const fixture = (name: string) => readFileSync(`tests/fixtures/saml-encryption/${name}`, 'utf8');

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    ControlledWorker.instances.push(this);
  }
}

function prepare() {
  vi.stubGlobal('Worker', ControlledWorker);
  render(<SamlDecryption xml={fixture('xmlsec-aes128.xml')} count={1} />);
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  const key = screen.getByLabelText('秘密鍵（PKCS#8 PEM）') as HTMLTextAreaElement;
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  return key;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ControlledWorker.instances = [];
});

it('Worker error は timer と Worker を停止し、遅延平文を消去する', () => {
  vi.useFakeTimers();
  prepare();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const worker = ControlledWorker.instances[0];
  expect(vi.getTimerCount()).toBe(1);
  act(() => worker.onerror?.(new ErrorEvent('error', { cancelable: true })));
  expect(vi.getTimerCount()).toBe(0);
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert').textContent).toContain('復号を開始できませんでした');
  const stale = new TextEncoder().encode(fixture('expected.xml'));
  act(() => worker.onmessage?.({ data: { plaintext: stale } } as MessageEvent));
  expect(stale.every((byte) => byte === 0)).toBe(true);
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('alert').textContent).toContain('復号を開始できませんでした');
  expect(screen.queryByRole('heading', { name: /復号結果/ })).toBeNull();
});

it('現行の復号 messageerror は即時停止し、遅延平文を消去する', () => {
  vi.useFakeTimers();
  prepare();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const worker = ControlledWorker.instances[0];
  expect(vi.getTimerCount()).toBe(1);
  act(() => worker.onmessageerror?.(new MessageEvent('messageerror')));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(screen.queryByText('復号中です')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('復号に失敗しました');
  const stale = new TextEncoder().encode(fixture('expected.xml'));
  act(() => worker.onmessage?.({ data: { plaintext: stale } } as MessageEvent));
  expect(stale.every((byte) => byte === 0)).toBe(true);
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('alert').textContent).toContain('復号に失敗しました');
  expect(screen.queryByRole('heading', { name: /復号結果/ })).toBeNull();
});

it('messageerror 後の再試行中に古いイベントは現行 Worker を停止しない', () => {
  vi.useFakeTimers();
  const key = prepare();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const old = ControlledWorker.instances[0];
  act(() => old.onmessageerror?.(new MessageEvent('messageerror')));
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const current = ControlledWorker.instances[1];
  act(() => old.onmessageerror?.(new MessageEvent('messageerror')));
  expect(current.terminate).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  expect(screen.getByText('復号中です')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  const stale = new TextEncoder().encode(fixture('expected.xml'));
  act(() => old.onmessage?.({ data: { plaintext: stale } } as MessageEvent));
  expect(stale.every((byte) => byte === 0)).toBe(true);
  const fresh = new TextEncoder().encode(fixture('expected.xml'));
  act(() => current.onmessage?.({ data: { plaintext: fresh } } as MessageEvent));
  expect(fresh.every((byte) => byte === 0)).toBe(true);
  expect(screen.getByText(/REDACTED:PII_1/)).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['pagehide', 'unmount'] as const)('messageerror 後の再試行を %s で停止する', (action) => {
  vi.useFakeTimers();
  const key = prepare();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const old = ControlledWorker.instances[0];
  act(() => old.onmessageerror?.(new MessageEvent('messageerror')));
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const current = ControlledWorker.instances[1];
  if (action === 'pagehide') fireEvent(window, new PageTransitionEvent('pagehide'));
  else cleanup();
  expect(current.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  act(() => current.onmessageerror?.(new MessageEvent('messageerror')));
  const stale = new TextEncoder().encode(fixture('expected.xml'));
  act(() => current.onmessage?.({ data: { plaintext: stale } } as MessageEvent));
  expect(stale.every((byte) => byte === 0)).toBe(true);
  expect(screen.queryByRole('heading', { name: /復号結果/ })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('成功後に時間が経過しても結果を保持し、timeout で上書きしない', () => {
  vi.useFakeTimers();
  prepare();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const worker = ControlledWorker.instances[0];
  expect(vi.getTimerCount()).toBe(1);
  const bytes = new TextEncoder().encode(fixture('expected.xml'));
  act(() => worker.onmessage?.({ data: { plaintext: bytes } } as MessageEvent));
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(15_000));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(screen.getByText(/REDACTED:PII_1/)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('転送リストに鍵と 3 バッファを含め、転送後の鍵は detach する', () => {
  const { port1, port2 } = new MessageChannel();
  class TransferringWorker extends ControlledWorker {
    postMessage = vi.fn((message, transfer) => port1.postMessage(message, transfer));
  }
  vi.stubGlobal('Worker', TransferringWorker);
  render(<SamlDecryption xml={fixture('xmlsec-aes128.xml')} count={1} />);
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  const key = screen.getByLabelText('秘密鍵（PKCS#8 PEM）') as HTMLTextAreaElement;
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  try {
    fireEvent.click(screen.getByRole('button', { name: '復号する' }));
    const worker = ControlledWorker.instances[0] as TransferringWorker;
    const [message, transfer] = worker.postMessage.mock.calls[0];
    expect(transfer).toHaveLength(4);
    expect(transfer[0]).toBe(message.keyDer.buffer);
    expect(transfer[1]).toBe(message.plan.label.buffer);
    expect(transfer[2]).toBe(message.plan.encryptedKey.buffer);
    expect(transfer[3]).toBe(message.plan.payload.buffer);
    expect(message.keyDer.byteLength).toBe(0);
    expect(message.plan.encryptedKey.byteLength).toBe(0);
    expect(message.plan.payload.byteLength).toBe(0);
    expect(key.value).toBe('');
  } finally {
    port1.close();
    port2.close();
  }
});

it('転送後に送信が例外になっても detach 済み鍵の再消去で失敗しない', () => {
  const { port1, port2 } = new MessageChannel();
  let keyDer: Uint8Array<ArrayBuffer> | undefined;
  const realParse = keyParser.parsePrivateKeyPem;
  vi.spyOn(keyParser, 'parsePrivateKeyPem').mockImplementation((source) => {
    keyDer = realParse(source);
    return keyDer;
  });
  class TransferThenFailWorker extends ControlledWorker {
    postMessage = vi.fn((message, transfer) => {
      port1.postMessage(message, transfer);
      throw new Error('transfer completed then failure');
    });
  }
  vi.stubGlobal('Worker', TransferThenFailWorker);
  render(<SamlDecryption xml={fixture('xmlsec-aes128.xml')} count={1} />);
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('秘密鍵（PKCS#8 PEM）'), {
    target: { value: fixture('trial-key.pem') },
  });
  try {
    fireEvent.click(screen.getByRole('button', { name: '復号する' }));
    expect(keyDer?.byteLength).toBe(0);
    expect(ControlledWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('transfer completed then failure');
  } finally {
    port1.close();
    port2.close();
  }
});

it.each(['constructor', 'postMessage'] as const)('%s 失敗時に未転送の鍵をゼロ化する', (failure) => {
  let keyDer: Uint8Array<ArrayBuffer> | undefined;
  const realParse = keyParser.parsePrivateKeyPem;
  vi.spyOn(keyParser, 'parsePrivateKeyPem').mockImplementation((source) => {
    keyDer = realParse(source);
    return keyDer;
  });
  class FailingWorker extends ControlledWorker {
    constructor() {
      super();
      if (failure === 'constructor') throw new Error('Worker start failure');
    }
    postMessage = vi.fn(() => {
      throw new Error('Worker send failure');
    });
  }
  vi.stubGlobal('Worker', FailingWorker);
  render(<SamlDecryption xml={fixture('xmlsec-aes128.xml')} count={1} />);
  fireEvent.change(screen.getByLabelText('復号する Assertion'), { target: { value: '0' } });
  const key = screen.getByLabelText('秘密鍵（PKCS#8 PEM）') as HTMLTextAreaElement;
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  expect(key.value).toBe('');
  expect(keyDer?.length).toBeGreaterThan(0);
  expect(keyDer?.every((byte) => byte === 0)).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain(
    failure === 'constructor' ? 'Worker start failure' : 'Worker send failure'
  );
  if (failure === 'postMessage')
    expect(ControlledWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

it.each(['valid', 'invalid'] as const)('現行世代の %s 平文は検証後にゼロ化される', (kind) => {
  prepare();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const worker = ControlledWorker.instances[0];
  const bytes =
    kind === 'valid'
      ? new TextEncoder().encode(fixture('expected.xml'))
      : new Uint8Array([1, 2, 3]);
  act(() => worker.onmessage?.({ data: { plaintext: bytes } } as MessageEvent));
  expect(bytes.every((byte) => byte === 0)).toBe(true);
  expect(worker.terminate).toHaveBeenCalledOnce();
  if (kind === 'valid') expect(screen.getByText(/REDACTED:PII_1/)).toBeTruthy();
  else expect(screen.getByRole('alert')).toBeTruthy();
});

it('新しい復号中の古い平文はゼロ化し、現在の Worker を停止しない', () => {
  const key = prepare();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const old = ControlledWorker.instances[0];
  fireEvent.change(key, { target: { value: fixture('trial-key.pem') } });
  expect(old.terminate).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '復号する' }));
  const current = ControlledWorker.instances[1];
  const stale = new TextEncoder().encode(fixture('expected.xml'));
  act(() => old.onmessage?.({ data: { plaintext: stale } } as MessageEvent));
  expect(stale.every((byte) => byte === 0)).toBe(true);
  expect(current.terminate).not.toHaveBeenCalled();
  expect(screen.getByText('復号中です')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /復号結果/ })).toBeNull();
  const fresh = new TextEncoder().encode(fixture('expected.xml'));
  act(() => current.onmessage?.({ data: { plaintext: fresh } } as MessageEvent));
  expect(fresh.every((byte) => byte === 0)).toBe(true);
  expect(screen.getByText(/REDACTED:PII_1/)).toBeTruthy();
});
