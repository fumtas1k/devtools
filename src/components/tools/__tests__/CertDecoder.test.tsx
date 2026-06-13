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
});
