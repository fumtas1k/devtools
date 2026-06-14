// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { HarEntryDetail } from '@/components/tools/HarEntryDetail';
import type { HarEntry } from '@/utils/har';

beforeEach(() => {
  document.adoptedStyleSheets = [];
});
afterEach(() => {
  cleanup();
  document.adoptedStyleSheets = [];
});

const validEntry = {
  time: 5,
  request: { method: 'GET', url: 'https://example.com/x', headers: [], queryString: [], cookies: [] },
  response: { status: 200, statusText: 'OK', headers: [], cookies: [], content: {} },
} as unknown as HarEntry;

describe('HarEntryDetail 壊れた entry のガード', () => {
  it('response 欠落 entry でも throw せずプレースホルダを表示する', () => {
    const broken = { request: { method: 'GET', url: 'https://example.com/y', headers: [], queryString: [], cookies: [] } } as unknown as HarEntry;
    expect(() => render(<HarEntryDetail entry={broken} />)).not.toThrow();
    expect(screen.getByText(/詳細を表示できません/)).toBeTruthy();
  });

  it('空 entry でも throw せずプレースホルダを表示する', () => {
    const empty = {} as unknown as HarEntry;
    expect(() => render(<HarEntryDetail entry={empty} />)).not.toThrow();
    expect(screen.getByText(/詳細を表示できません/)).toBeTruthy();
  });

  it('正常 entry では method/url/status を表示する', () => {
    render(<HarEntryDetail entry={validEntry} />);
    expect(screen.getByText(/GET https:\/\/example.com\/x/)).toBeTruthy();
    expect(screen.getByText(/200/)).toBeTruthy();
  });
});
