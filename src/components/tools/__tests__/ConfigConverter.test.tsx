// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { ConfigConverterTool } from '@/components/tools/ConfigConverter';

const deferred = vi.hoisted(() => {
  let release!: () => void;
  let started!: () => void;
  return {
    ready: new Promise<void>((resolve) => {
      release = resolve;
    }),
    requested: new Promise<void>((resolve) => {
      started = resolve;
    }),
    release: () => release(),
    started: () => started(),
  };
});
vi.mock('@/utils/config-converter/schema-validator', async (importOriginal) => {
  deferred.started();
  await deferred.ready;
  return importOriginal();
});

afterEach(() => {
  cleanup();
});

// issue #483: warnings / validationResult の live region を条件付きマウントから
// 常設 sr-only 化した。入力前（warnings 空・validationResult null）でも live region
// 要素が DOM に存在することを検証し、条件付きマウントへの逆戻りを検知する。
describe('ConfigConverter a11y live region 常設 (issue #483)', () => {
  it('warnings 用 sr-only live region が入力前から role="status" aria-live="polite" で常設される', () => {
    const { container } = render(<ConfigConverterTool />);
    const el = container.querySelector('[data-testid="config-converter-warning-announcement"]');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('status');
    expect(el!.getAttribute('aria-live')).toBe('polite');
    // 警告が無い初期状態では文言は空
    expect(el!.textContent).toBe('');
  });

  it('validationResult 用 sr-only live region が検証前から role="status" aria-live="polite" で常設される', () => {
    const { container } = render(<ConfigConverterTool />);
    const el = container.querySelector('[data-testid="config-converter-validation-announcement"]');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('status');
    expect(el!.getAttribute('aria-live')).toBe('polite');
    expect(el!.textContent).toBe('');
  });
});

describe('遅延した検証', () => {
  it('編集後に古い結果を表示せず、新しい検証の結果を保持する', async () => {
    render(<ConfigConverterTool />);
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"age":30}' } });
    await waitFor(() =>
      expect((screen.getByLabelText('YAML') as HTMLTextAreaElement).value).not.toBe('')
    );
    fireEvent.click(screen.getByRole('button', { name: 'JSON Schema で検証する' }));
    const schema = screen.getByLabelText('JSON Schema (貼り付け)');
    fireEvent.change(schema, { target: { value: '{"oldTypo":true}' } });
    fireEvent.click(screen.getByRole('button', { name: '検証する' }));
    await deferred.requested;
    fireEvent.change(schema, { target: { value: '{"intermediateTypo":true}' } });
    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"age":31}' } });
    await waitFor(() =>
      expect((screen.getByLabelText('YAML') as HTMLTextAreaElement).value).toContain('31')
    );
    fireEvent.change(schema, { target: { value: '{"newTypo":true}' } });
    fireEvent.click(screen.getByRole('button', { name: '検証する' }));
    await act(async () => {
      deferred.release();
    });
    expect(await screen.findByText('/newTypo')).toBeTruthy();
    expect(screen.queryByText('/oldTypo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));
    expect(screen.queryByText('スキーマに関する警告')).toBeNull();
  });
});

describe('スキーマ警告', () => {
  it('検証成功と警告を同時に表示し、編集と再検証で更新する', async () => {
    render(<ConfigConverterTool />);
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"age":30}' } });
    await waitFor(() =>
      expect((screen.getByLabelText('YAML') as HTMLTextAreaElement).value).not.toBe('')
    );
    fireEvent.click(screen.getByRole('button', { name: 'JSON Schema で検証する' }));
    const schema = screen.getByLabelText('JSON Schema (貼り付け)');
    fireEvent.change(schema, {
      target: { value: '{"properties":{"age":{"type":"number","minLength":2}}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: '検証する' }));
    expect(await screen.findByText('スキーマ検証成功')).toBeTruthy();
    expect(screen.getByText('/properties/age/minLength')).toBeTruthy();
    expect(screen.getByTestId('config-converter-validation-announcement').textContent).toContain(
      '警告が1件'
    );
    fireEvent.change(schema, { target: { value: '{"required":["name"],"typo":true}' } });
    expect(screen.queryByText('スキーマに関する警告')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '検証する' }));
    expect(await screen.findByText('/typo')).toBeTruthy();
    expect(screen.getByTestId('config-converter-validation-announcement').textContent).toMatch(
      /エラー.*警告が1件/
    );
    fireEvent.change(schema, { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: '検証する' }));
    expect(await screen.findByText('スキーマ検証成功')).toBeTruthy();
    expect(screen.queryByText('スキーマに関する警告')).toBeNull();
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"age":31}' } });
    expect(screen.queryByText('スキーマ検証成功')).toBeNull();
  });
});
