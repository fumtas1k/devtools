// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SamlDecoderTool } from '../SamlDecoder';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('画面を離れると処理中 worker を停止し、遅延結果を破棄する', () => {
  let worker: DelayedWorker | undefined;
  class DelayedWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      worker = this;
    }
  }
  vi.stubGlobal('Worker', DelayedWorker);
  const { unmount } = render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8') },
  });
  fireEvent.change(screen.getByLabelText('公開証明書（PEM）'), {
    target: { value: readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8') },
  });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  expect(screen.getByText('署名を検証中です')).toBeTruthy();
  expect(worker?.postMessage).toHaveBeenCalledOnce();
  unmount();
  expect(worker?.terminate).toHaveBeenCalledOnce();
  worker?.onmessage?.({
    data: { results: [{ status: 'match', reason: '古い一致' }] },
  } as MessageEvent);
  expect(screen.queryByText('古い一致')).toBeNull();
});

it.each([
  ['pagehide', false],
  ['pagehide', true],
  ['pageshow', true],
] as const)('%s（persisted=%s）で worker を停止し遅延結果を破棄する', (type, persisted) => {
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
  const xml = readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8');
  const pem = readFileSync('tests/fixtures/saml-signature/certificate.pem', 'utf8');
  const input = screen.getByLabelText(
    /SAMLResponse \/ SAMLRequest を貼り付け/
  ) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: xml } });
  const certificate = screen.getByLabelText('公開証明書（PEM）') as HTMLTextAreaElement;
  fireEvent.change(certificate, { target: { value: pem } });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  expect(screen.getByText('署名を検証中です')).toBeTruthy();
  act(() => {
    window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
    expect(worker?.terminate).toHaveBeenCalledOnce();
    worker?.onmessage?.({
      data: {
        results: [
          { label: 'Response', id: '_response', signed: true, status: 'match', reason: '古い一致' },
        ],
      },
    } as MessageEvent);
  });
  expect(screen.getByRole('list', { name: '署名検証の結果' }).textContent).not.toContain(
    '古い一致'
  );
  expect(screen.getByText('署名は未検証です')).toBeTruthy();
  expect(input.value).toBe(xml);
  expect(certificate.value).toBe(pem);
});

it('pagehide で入力エラーを破棄して未検証へ戻す', () => {
  render(<SamlDecoderTool />);
  fireEvent.change(screen.getByLabelText(/SAMLResponse \/ SAMLRequest を貼り付け/), {
    target: { value: readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8') },
  });
  const certificate = screen.getByLabelText('公開証明書（PEM）') as HTMLTextAreaElement;
  fireEvent.change(certificate, { target: { value: 'x'.repeat(64 * 1024 + 1) } });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  expect(screen.getByRole('alert').textContent).toContain('64 KiB');
  fireEvent(window, new PageTransitionEvent('pagehide', { persisted: false }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('署名は未検証です')).toBeTruthy();
  expect(certificate.value).toHaveLength(64 * 1024 + 1);
});

it('検証済み結果も pagehide で未検証に戻す', () => {
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
    target: { value: readFileSync('tests/fixtures/saml-signature/response.xml', 'utf8') },
  });
  fireEvent.click(screen.getByRole('button', { name: '署名を検証する' }));
  act(() =>
    worker?.onmessage?.({
      data: {
        results: [
          {
            label: 'Response',
            id: '_response',
            signed: true,
            status: 'match',
            reason: '一致した結果',
          },
        ],
      },
    } as MessageEvent)
  );
  const results = screen.getByRole('list', { name: '署名検証の結果' });
  expect(results.textContent).toContain('一致した結果');
  fireEvent(window, new PageTransitionEvent('pageshow', { persisted: false }));
  expect(results.textContent).toContain('一致した結果');
  fireEvent(window, new PageTransitionEvent('pagehide', { persisted: true }));
  expect(results.textContent).not.toContain('一致した結果');
  expect(screen.getByText('署名は未検証です')).toBeTruthy();
});
