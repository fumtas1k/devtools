// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { HarEntryList } from '@/components/tools/HarEntryList';
import type { HarEntry } from '@/utils/har';

beforeEach(() => {
  document.adoptedStyleSheets = [];
});
afterEach(() => {
  cleanup();
  document.adoptedStyleSheets = [];
});

// 正常 1 件 + 壊れた entry 3 種（{}, null, response 欠落）を混在させる。
// 型は実データ（手編集 HAR）を模すため unknown 経由でキャストする。
const entries = [
  {
    time: 12,
    request: { method: 'GET', url: 'https://example.com/api/ok', headers: [], queryString: [], cookies: [] },
    response: { status: 200, headers: [], cookies: [], content: { size: 2 } },
  },
  {}, // request/response 欠落
  null, // entry 自体が null
  { request: { method: 'POST', url: 'https://example.com/api/noresp', headers: [], queryString: [], cookies: [] } }, // response 欠落
] as unknown as HarEntry[];

describe('HarEntryList 壊れた entry のガード', () => {
  it('壊れた entry を含んでも throw せず描画できる', () => {
    expect(() =>
      render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />)
    ).not.toThrow();
  });

  it('正常 entry の method と URL を描画する', () => {
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />);
    expect(screen.getByText('GET')).toBeTruthy();
    // shortUrl は host + pathname
    expect(screen.getByRole('button', { name: 'example.com/api/ok' })).toBeTruthy();
  });

  it('壊れた entry 行はプレースホルダを表示し URL ボタンを描画しない', () => {
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />);
    // 「壊れたエントリ」プレースホルダが request 欠落行に出る（{} と null の 2 行）
    expect(screen.getAllByText('（壊れたエントリ）').length).toBeGreaterThanOrEqual(2);
    // request はあるが response 欠落の行は URL ボタンを描画する（クリック可能）
    expect(screen.getByRole('button', { name: 'example.com/api/noresp' })).toBeTruthy();
  });

  it('壊れた entry の URL セルは選択 button を持たない', () => {
    const onSelect = vi.fn();
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={onSelect} />);
    // URL ボタンは正常 entry(ok) と response欠落(noresp) の 2 つだけ（{}/null は非ボタン）
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });
});
