// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SamlDecoderTool } from '../SamlDecoder';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
