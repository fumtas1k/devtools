// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Select } from '@/components/ui/Select';

afterEach(() => {
  cleanup();
});

describe('Select', () => {
  it('autoComplete を select に透過する', () => {
    render(
      <Select
        value="a"
        onChange={() => {}}
        ariaLabel="サンプル"
        autoComplete="off"
        options={[{ value: 'a', label: 'A' }]}
      />
    );

    const select = screen.getByLabelText('サンプル') as HTMLSelectElement;
    expect(select.getAttribute('autocomplete')).toBe('off');
  });
});
