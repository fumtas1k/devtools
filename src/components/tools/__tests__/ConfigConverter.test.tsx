// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ConfigConverterTool } from '@/components/tools/ConfigConverter';

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
