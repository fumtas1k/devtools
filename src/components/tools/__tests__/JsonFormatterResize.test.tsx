// @vitest-environment jsdom
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JsonFormatter } from '../JsonFormatter';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('SSR と StrictMode の複数インスタンスで計測と cleanup が独立する', () => {
  expect(renderToString(<JsonFormatter />)).toContain('json-formatter-input');
  const add = vi.fn();
  const remove = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: add, removeEventListener: remove }))
  );
  const observers: {
    callback: ResizeObserverCallback;
    disconnect: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  }[] = [];
  class Observer {
    callback: ResizeObserverCallback;
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push(this);
    }
  }
  vi.stubGlobal('ResizeObserver', Observer);
  const replace = vi.spyOn(CSSStyleSheet.prototype, 'replaceSync');
  const first = render(
    <StrictMode>
      <JsonFormatter />
    </StrictMode>
  );
  const second = render(
    <StrictMode>
      <JsonFormatter />
    </StrictMode>
  );
  const firstInput = first.container.querySelector('textarea')!;
  const secondInput = second.container.querySelector('textarea')!;
  vi.spyOn(firstInput, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect);
  vi.spyOn(secondInput, 'getBoundingClientRect').mockReturnValue({ height: 600 } as DOMRect);
  fireEvent.click(within(first.container).getByRole('button', { name: /^ツリー$/ }));
  fireEvent.click(within(second.container).getByRole('button', { name: /^ツリー$/ }));
  const firstClass = first.container
    .firstElementChild!.className.split(' ')
    .find((c) => c.startsWith('dyn-'))!;
  const secondClass = second.container
    .firstElementChild!.className.split(' ')
    .find((c) => c.startsWith('dyn-'))!;
  expect(firstClass).not.toBe(secondClass);
  expect(
    replace.mock.calls.some(
      ([css]) => css.includes(`.${firstClass} .json-tree-box`) && css.includes('400px')
    )
  ).toBe(true);
  expect(
    replace.mock.calls.some(
      ([css]) => css.includes(`.${secondClass} .json-tree-box`) && css.includes('600px')
    )
  ).toBe(true);
  expect(observers).toHaveLength(2);
  expect(observers[0].observe).toHaveBeenCalledWith(firstInput, { box: 'border-box' });
  first.unmount();
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  expect(observers[1].disconnect).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledOnce();
  act(() => observers[1].callback([], observers[1] as unknown as ResizeObserver));
  second.unmount();
  expect(observers[1].disconnect).toHaveBeenCalledOnce();
  expect(add).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(2);
});
