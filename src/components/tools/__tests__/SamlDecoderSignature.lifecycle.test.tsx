// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SamlDecoderTool } from '../SamlDecoder';

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
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8') },
  });
  const certificate = screen.getByLabelText('公開証明書（PEM）');
  fireEvent.change(certificate, { target: { value: 'first certificate' } });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  return certificate;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ControlledWorker.instances = [];
});

it('新しい検証の実行中に古い Worker の応答・エラーが届いても反映しない', () => {
  const certificate = prepare();
  const old = ControlledWorker.instances[0];
  fireEvent.change(certificate, { target: { value: 'second certificate' } });
  expect(old.terminate).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  const current = ControlledWorker.instances[1];
  act(() => {
    old.onmessage?.({
      data: {
        results: [
          { label: 'Response', id: '_response', signed: true, status: 'match', reason: '古い結果' },
        ],
      },
    } as MessageEvent);
    old.onerror?.(new ErrorEvent('error', { cancelable: true }));
  });
  expect(screen.getByText('署名を検証中です')).toBeTruthy();
  expect(current.terminate).not.toHaveBeenCalled();
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).not.toContain(
    '古い結果'
  );
  act(() =>
    current.onmessage?.({
      data: {
        results: [
          {
            label: 'Response',
            id: '_response',
            signed: true,
            status: 'match',
            reason: '新しい結果',
          },
        ],
      },
    } as MessageEvent)
  );
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain('新しい結果');
  expect(current.terminate).toHaveBeenCalledOnce();
});

it('Worker の生成失敗は未対応として表示し、処理中にはしない', () => {
  class FailingWorker {
    constructor() {
      throw new Error('生成失敗');
    }
  }
  vi.stubGlobal('Worker', FailingWorker);
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8') },
  });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain('生成失敗');
  expect(screen.queryByText('署名を検証中です')).toBeNull();
});

it('Worker error は停止して未対応を表示し、その後の遅延応答を無視する', () => {
  prepare();
  const worker = ControlledWorker.instances[0];
  act(() => worker.onerror?.(new ErrorEvent('error', { cancelable: true })));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain(
    '署名検証を開始できませんでした'
  );
  act(() =>
    worker.onmessage?.({
      data: {
        results: [
          { label: 'Response', id: '_response', signed: true, status: 'match', reason: '古い結果' },
        ],
      },
    } as MessageEvent)
  );
  const displayed = screen.getByRole('list', { name: '署名検証の結果' }).textContent;
  expect(displayed).not.toContain('古い結果');
  expect(displayed).toContain('署名検証を開始できませんでした');
});

it('15 秒で Worker を終了し、以後の応答を無視する', () => {
  vi.useFakeTimers();
  prepare();
  const worker = ControlledWorker.instances[0];
  act(() => vi.advanceTimersByTime(14_999));
  expect(worker.terminate).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain('15 秒');
  act(() =>
    worker.onmessage?.({
      data: {
        results: [
          {
            label: 'Response',
            id: '_response',
            signed: true,
            status: 'match',
            reason: '期限後の結果',
          },
        ],
      },
    } as MessageEvent)
  );
  const displayed = screen.getByRole('list', { name: '署名検証の結果' }).textContent;
  expect(displayed).not.toContain('期限後の結果');
  expect(displayed).toContain('15 秒');
});

it('postMessage 同期失敗では Worker を即時停止し遅延応答を無視する', () => {
  vi.useFakeTimers();
  class PostFailureWorker extends ControlledWorker {
    postMessage = vi.fn(() => {
      if (ControlledWorker.instances.length === 1) throw new Error('送信失敗');
    });
  }
  vi.stubGlobal('Worker', PostFailureWorker);
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8') },
  });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  const worker = ControlledWorker.instances[0];
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain('送信失敗');
  expect(screen.queryByText('署名を検証中です')).toBeNull();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  act(() =>
    worker.onmessage?.({
      data: {
        results: [
          { label: 'Response', id: '_response', signed: true, status: 'match', reason: '古い結果' },
        ],
      },
    } as MessageEvent)
  );
  act(() => vi.advanceTimersByTime(15_000));
  expect(worker.terminate).toHaveBeenCalledOnce();
  const displayed = screen.getByRole('list', { name: '署名検証の結果' }).textContent;
  expect(displayed).toContain('送信失敗');
  expect(displayed).not.toContain('古い結果');
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  const retry = ControlledWorker.instances[1];
  expect(screen.getByText('署名を検証中です')).toBeTruthy();
  act(() =>
    retry.onmessage?.({
      data: {
        results: [
          {
            label: 'Response',
            id: '_response',
            signed: true,
            status: 'match',
            reason: '再試行成功',
          },
        ],
      },
    } as MessageEvent)
  );
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain('再試行成功');
});

it('messageerror では Worker を即時停止し遅延応答を無視する', () => {
  vi.useFakeTimers();
  prepare();
  const worker = ControlledWorker.instances[0];
  act(() => worker.onmessageerror?.(new MessageEvent('messageerror')));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(screen.queryByText('署名を検証中です')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  act(() =>
    worker.onmessage?.({
      data: {
        results: [
          { label: 'Response', id: '_response', signed: true, status: 'match', reason: '古い結果' },
        ],
      },
    } as MessageEvent)
  );
  act(() => vi.advanceTimersByTime(15_000));
  expect(worker.terminate).toHaveBeenCalledOnce();
  const displayed = screen.getByRole('list', { name: '署名検証の結果' }).textContent;
  expect(displayed).toContain('署名検証の応答を読み取れませんでした');
  expect(displayed).not.toContain('古い結果');
});

it('古い Worker の messageerror は新しい検証を停止しない', () => {
  const certificate = prepare();
  const old = ControlledWorker.instances[0];
  fireEvent.change(certificate, { target: { value: 'second certificate' } });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  const current = ControlledWorker.instances[1];
  act(() => old.onmessageerror?.(new MessageEvent('messageerror')));
  expect(current.terminate).not.toHaveBeenCalled();
  expect(screen.getByText('署名を検証中です')).toBeTruthy();
  act(() =>
    current.onmessage?.({
      data: {
        results: [
          {
            label: 'Response',
            id: '_response',
            signed: true,
            status: 'match',
            reason: '新しい結果',
          },
        ],
      },
    } as MessageEvent)
  );
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain('新しい結果');
});

it('Worker の error 返信は Worker を終了し、理由を表示する', () => {
  prepare();
  const worker = ControlledWorker.instances[0];
  act(() => worker.onmessage?.({ data: { error: 'Worker 内のエラー' } } as MessageEvent));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).toContain(
    'Worker 内のエラー'
  );
});
