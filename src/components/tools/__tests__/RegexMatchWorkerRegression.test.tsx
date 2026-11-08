// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RegexMatchTester } from '../RegexMatchTester';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('安全判定でもマッチを Worker に委譲する', () => {
  vi.useFakeTimers();
  const postMessage = vi.fn();
  const WorkerMock = vi.fn(function () {
    return { postMessage, terminate: vi.fn() };
  });
  vi.stubGlobal('Worker', WorkerMock);
  render(<RegexMatchTester pattern="a+" flags="g" redosStatus="safe" regexValid />);
  fireEvent.change(screen.getByLabelText('テスト文字列'), { target: { value: 'aaa' } });
  act(() => vi.advanceTimersByTime(300));
  expect(WorkerMock).toHaveBeenCalledOnce();
  expect(postMessage).toHaveBeenCalledOnce();
});
