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
    request: {
      method: 'GET',
      url: 'https://example.com/api/ok',
      headers: [],
      queryString: [],
      cookies: [],
    },
    response: { status: 200, headers: [], cookies: [], content: { size: 2 } },
  },
  {}, // request/response 欠落
  null, // entry 自体が null
  {
    request: {
      method: 'POST',
      url: 'https://example.com/api/noresp',
      headers: [],
      queryString: [],
      cookies: [],
    },
  }, // response 欠落
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

  it('壊れた entry 行はプレースホルダ文言の button を描画する', () => {
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={() => {}} />);
    // 「（壊れたエントリ）」プレースホルダが request 欠落行に出る（{} と null の 2 行）
    expect(screen.getAllByText('（壊れたエントリ）').length).toBeGreaterThanOrEqual(2);
    // url を持つ行（ok / noresp）と壊れ行（{} / null）すべてが button（計 4 つ）
    expect(screen.getAllByRole('button')).toHaveLength(4);
    // 壊れ行「（壊れたエントリ）」も accessible name を持つ button として取得できる
    expect(screen.getAllByRole('button', { name: '（壊れたエントリ）' })).toHaveLength(2);
  });

  it('壊れた entry 行クリックでその index の onSelect が呼ばれる（再選択可能）', () => {
    const onSelect = vi.fn();
    render(<HarEntryList entries={entries} selectedIndex={null} onSelect={onSelect} />);
    // 壊れ行は {} (index 1) と null (index 2)。先頭の壊れ行をクリック。
    const brokenButtons = screen.getAllByRole('button', { name: '（壊れたエントリ）' });
    brokenButtons[0].click();
    expect(onSelect).toHaveBeenCalledWith(1);
    brokenButtons[1].click();
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
