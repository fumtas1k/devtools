// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigConverterTool } from '@/components/tools/ConfigConverter';

afterEach(cleanup);

async function prepareValidation() {
  render(<ConfigConverterTool />);
  fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"name":"Alice"}' } });
  await waitFor(() =>
    expect((screen.getByLabelText('YAML') as HTMLTextAreaElement).value).toContain('Alice')
  );
  fireEvent.click(screen.getByRole('button', { name: 'JSON Schema で検証する' }));
  return screen.getByLabelText('JSON Schema (貼り付け)');
}

describe('JSON Schema の keyboard 検証', () => {
  it.each(['ctrlKey', 'metaKey'] as const)('空スキーマでは %s + Enter を拒否する', async (key) => {
    const schema = await prepareValidation();
    expect((screen.getByRole('button', { name: '検証する' }) as HTMLButtonElement).disabled).toBe(
      true
    );

    await act(async () => {
      fireEvent.keyDown(schema, { key: 'Enter', [key]: true });
    });

    expect(screen.getByTestId('config-converter-validation-announcement').textContent).toBe('');
    expect(screen.queryByText(/スキーマが有効なJSONではありません/)).toBeNull();
  });

  it('不正な JSON スキーマでは実際のエラーを表示する', async () => {
    const schema = await prepareValidation();
    fireEvent.change(schema, { target: { value: '{' } });
    expect((screen.getByRole('button', { name: '検証する' }) as HTMLButtonElement).disabled).toBe(
      false
    );
    fireEvent.keyDown(schema, { key: 'Enter', ctrlKey: true });
    expect(screen.getByText(/スキーマが有効なJSONではありません/)).toBeTruthy();
    expect(screen.getByTestId('config-converter-validation-announcement').textContent).toContain(
      '1件のエラー'
    );
  });

  it('正しいスキーマでは検証成功を表示する', async () => {
    const schema = await prepareValidation();
    fireEvent.change(schema, { target: { value: '{"type":"object"}' } });
    fireEvent.keyDown(schema, { key: 'Enter', metaKey: true });
    expect(await screen.findByText('スキーマ検証成功')).toBeTruthy();
    expect(screen.getByTestId('config-converter-validation-announcement').textContent).toContain(
      'スキーマ検証に成功しました'
    );
  });
});
