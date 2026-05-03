/**
 * docs/playbooks の切り出し（PR #240）で導入された「要約 + 詳細リンク」構造の
 * ドリフト防止チェッカ（issue #242 B 項目 / PR #244 A 項目に続く実装）。
 *
 * 全 markdown ファイルから `<file>.md N 章` 形式の section reference を抽出し、
 * 参照先のファイルにその見出し番号が実在するかを検証する。切れたリンクが
 * 1 件でもあればテストが落ちる。
 *
 * v1 スコープ:
 *   - 検出対象: `<file>.md (の)? <num>(.<num>)? 章` および range `〜<num> 章`
 *   - スコープ外: `<file>.md (1, 2, 3 章)` のような comma-separated、`N 節`、
 *     `decisions [062]` のような番号参照（issue #242 で記録、別 PR で検討）
 *   - source として decisions.md を除外（歴史的記述で意図的に古い章番号を
 *     残しているケースが多いため）
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

/** 対象 .md を再帰収集（node_modules / .git / .claude / conductor / .gemini を除外） */
function collectMarkdownFiles(root: string, results: string[] = []): string[] {
  const skipDirs = new Set([
    'node_modules',
    '.git',
    '.claude',
    'conductor',
    '.gemini',
    'dist',
    '.astro',
  ]);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = join(root, entry.name);
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const stat = statSync(fullPath);
        isDir = stat.isDirectory();
        isFile = stat.isFile();
      } catch {
        continue;
      }
    }
    if (isDir) {
      collectMarkdownFiles(fullPath, results);
    } else if (isFile && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Markdown 見出しから章番号を抽出。`## 6.4 ブランチ運用` → "6.4" */
function extractSections(content: string): Set<string> {
  const sections = new Set<string>();
  for (const line of content.split('\n')) {
    const match = line.match(/^#{2,4}\s+(\d+(?:\.\d+)?)/);
    if (match) sections.add(match[1]);
  }
  return sections;
}

interface Reference {
  source: string;
  line: number;
  targetSpec: string; // 参照に書かれたパス（"X.md" または "docs/X.md" 等）
  section: string;
}

/**
 * 参照抽出。`<file>.md`（バッククォート / アスタリスクを許容）の直後にある
 * `<num>(.<num>)? 章` および `〜<num>(.<num>)? 章` を抽出。
 *
 * 同じ行に複数 file が出るケース（"A.md 1 章 / B.md 2 章" 等）にも対応するため、
 * 行ごとに「ファイル名で分割」→「各セグメント内の章番号」を見る方式は取らず、
 * シンプルに「ファイル名の直後の最初の章番号」だけを参照とする保守的な実装。
 *
 * 漏れる典型例: "X.md 6.3 章（説明）/ 6.4 章" の "6.4 章" 側は X.md への参照と
 * 解釈すべきだが、本実装では取れない。誤検出を避けるためのトレードオフ。
 */
function extractReferences(source: string, content: string): Reference[] {
  const refs: Reference[] = [];
  const lines = content.split('\n');
  // file: バッククォート/アスタリスク許容、後続の任意の空白/`/の を経て章番号
  const pattern =
    /([a-zA-Z0-9_/.-]+\.md)[`*]*\s*(?:の\s*)?(\d+(?:\.\d+)?)(?:\s*〜\s*(\d+(?:\.\d+)?))?\s*章/g;
  lines.forEach((line, idx) => {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(line)) !== null) {
      const [, file, start, end] = match;
      refs.push({ source, line: idx + 1, targetSpec: file, section: start });
      if (end) {
        // range "1〜2 章" は両端を check
        refs.push({ source, line: idx + 1, targetSpec: file, section: end });
      }
    }
  });
  return refs;
}

/**
 * 参照に書かれたパス（"X.md" や "docs/X.md"）から、ヒープ上の絶対パスを resolve。
 * basename 一致で複数候補が出る場合は ambiguous として skip（誤判定回避）。
 */
function resolveTarget(
  targetSpec: string,
  allFiles: string[]
): { resolved: string | null; ambiguous: boolean } {
  // suffix match: "docs/playbooks/pr-creation.md" がフルパスの末尾に一致
  const suffixMatches = allFiles.filter(
    (f) => f.endsWith(targetSpec) || f.endsWith('/' + targetSpec)
  );
  if (suffixMatches.length === 1) return { resolved: suffixMatches[0], ambiguous: false };
  if (suffixMatches.length > 1) return { resolved: null, ambiguous: true };
  // basename のみで再試行（"X.md" だけ書かれているケース）
  const baseName = basename(targetSpec);
  const baseMatches = allFiles.filter((f) => basename(f) === baseName);
  if (baseMatches.length === 1) return { resolved: baseMatches[0], ambiguous: false };
  if (baseMatches.length > 1) return { resolved: null, ambiguous: true };
  return { resolved: null, ambiguous: false };
}

/**
 * 共通の検証ロジック。fixture / 実 repo どちらにも使う。
 */
function findBrokenReferences(
  sources: { path: string; content: string }[],
  targets: { path: string; content: string }[]
): string[] {
  const headingIndex = new Map<string, Set<string>>();
  for (const target of targets) {
    headingIndex.set(target.path, extractSections(target.content));
  }
  const allTargetPaths = targets.map((t) => t.path);

  const broken: string[] = [];
  for (const source of sources) {
    for (const ref of extractReferences(source.path, source.content)) {
      const { resolved, ambiguous } = resolveTarget(ref.targetSpec, allTargetPaths);
      if (ambiguous) continue;
      if (!resolved) {
        broken.push(`${source.path}:${ref.line} — referenced file not found: "${ref.targetSpec}"`);
        continue;
      }
      const sections = headingIndex.get(resolved);
      if (!sections?.has(ref.section)) {
        broken.push(
          `${source.path}:${ref.line} — section "${ref.section} 章" not found in ${resolved}`
        );
      }
    }
  }
  return broken;
}

describe('Cross-document section references — repo integration', () => {
  it('全ての <file>.md N 章 形式の参照が実在の見出しを指している', () => {
    const allFiles = collectMarkdownFiles(REPO_ROOT);

    // ソースファイル除外（decisions.md は歴史的記述で章番号が古い場合あり）
    const sourceFiles = allFiles.filter((f) => relative(REPO_ROOT, f) !== 'docs/decisions.md');

    const sources = sourceFiles.map((f) => ({
      path: relative(REPO_ROOT, f),
      content: readFileSync(f, 'utf-8'),
    }));
    const targets = allFiles.map((f) => ({
      path: relative(REPO_ROOT, f),
      content: readFileSync(f, 'utf-8'),
    }));

    const broken = findBrokenReferences(sources, targets);
    if (broken.length > 0) {
      throw new Error(['Broken cross-document section references:', ...broken].join('\n'));
    }
    expect(broken).toEqual([]);
  });
});

/**
 * 陽性対照（positive control）— 検知機構そのものが壊れていないことを保証。
 * `feedback_positive_control_for_gates.md` の方針に従って必ず併設する。
 */
describe('Cross-document section references — positive control (検知機構の自己テスト)', () => {
  const targets = [
    {
      path: 'docs/playbook.md',
      content: '# Playbook\n\n## 1. 章タイトル\n\n本文\n\n## 2.1 サブ章\n\n本文\n',
    },
  ];

  it('存在する章への参照は通る', () => {
    const sources = [{ path: 'CLAUDE.md', content: '詳細は `docs/playbook.md` 1 章を参照。' }];
    expect(findBrokenReferences(sources, targets)).toEqual([]);
  });

  it('存在しない章番号を検出する', () => {
    const sources = [{ path: 'CLAUDE.md', content: '詳細は `docs/playbook.md` 99 章を参照。' }];
    const broken = findBrokenReferences(sources, targets);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toContain('section "99 章" not found');
  });

  it('存在しないファイル名を検出する', () => {
    const sources = [{ path: 'CLAUDE.md', content: '詳細は `nonexistent.md` 1 章を参照。' }];
    const broken = findBrokenReferences(sources, targets);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toContain('referenced file not found');
  });

  it('範囲参照 N〜M 章 は両端を check する', () => {
    const sources = [
      // 1 章は存在、99 章は存在しない → 99 側だけ broken
      { path: 'CLAUDE.md', content: '詳細は `docs/playbook.md` 1〜99 章を参照。' },
    ];
    const broken = findBrokenReferences(sources, targets);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toContain('section "99 章" not found');
  });

  it('sub-section (2.1 章) も検証できる', () => {
    const sources = [
      // 2.1 は存在、2.2 は存在しない
      { path: 'CLAUDE.md', content: '`docs/playbook.md` 2.1 章 と `docs/playbook.md` 2.2 章' },
    ];
    const broken = findBrokenReferences(sources, targets);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toContain('section "2.2 章" not found');
  });

  it('「の」助詞ありの形式も解析できる', () => {
    const sources = [{ path: 'CLAUDE.md', content: '`docs/playbook.md` の 1 章' }];
    expect(findBrokenReferences(sources, targets)).toEqual([]);
  });
});
