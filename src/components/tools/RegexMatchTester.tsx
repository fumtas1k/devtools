import { useEffect, useState } from 'react';
import { cx } from '@/utils/cx';
import type { ReactNode } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ActionButton } from '@/components/ui/ActionButton';
import { ResultTable, type TableColumn } from '@/components/ui/ResultTable';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';
// runMatch は match.ts から直接 import する（barrel 経由にしない）。barrel(index.ts) は
// parse.ts/redos.ts も re-export しており、それらは CJS（regexp-tree / recheck）依存。
// barrel から値を静的 import すると CJS が SSR グラフに載り dev SSR が `module is not defined`
// で落ちる（PR1 で動的 import 回避した問題）。match.ts は native RegExp のみで CJS 非依存。
import { runMatch, type MatchResult, type RegexMatch } from '@/utils/regex-visualizer/match';
// RedosStatus は型のみ（import type は実行時に完全消去されるので redos.ts の CJS は載らない）。
import type { RedosStatus } from '@/utils/regex-visualizer/redos';

interface Props {
  pattern: string;
  flags: string;
  /** ReDoS 判定（undefined = 未判定/解析中）。マッチ実行のゲートに使う。 */
  redosStatus?: RedosStatus;
  /** 正規表現が有効か（parse エラーなし）。false ならマッチ実行しない。 */
  regexValid: boolean;
}

const UNKNOWN_CAP = 1000; // unknown verdict の force 実行時の入力長上限
const TEXTAREA_MAX_LENGTH = 10000; // textarea の粗い上限（safe は線形マッチ）
const EMPTY_MATCH: MatchResult | null = null; // useDebouncedTransform 用の安定参照

/** マッチ結果をハイライト済み React 要素配列へ。マッチ全体を交互色 mark で囲む。 */
function highlight(
  input: string,
  matches: RegexMatch[],
  selected: number | null,
  onSelect: (i: number) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<span key={`t-${i}`}>{input.slice(cursor, m.start)}</span>);
    }
    const colorClass = i % 2 === 0 ? 'match-highlight-a' : 'match-highlight-b';
    nodes.push(
      <mark
        key={`m-${i}`}
        className={cx('match-highlight text-default', colorClass, selected === i && 'match-highlight-active', m.value === '' && 'match-highlight-empty')}
        onClick={() => onSelect(i)}
        title={`マッチ ${i + 1}`}
      >
        {m.value === '' ? '​' : m.value}
      </mark>
    );
    cursor = Math.max(cursor, m.end);
  });
  if (cursor < input.length) {
    nodes.push(<span key="t-tail">{input.slice(cursor)}</span>);
  }
  return nodes;
}

export function RegexMatchTester({ pattern, flags, redosStatus, regexValid }: Props) {
  const [testString, setTestString] = useState('');
  const [forceUnknown, setForceUnknown] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // 正規表現や ReDoS 判定が変わったら force 実行と選択をリセット
  useEffect(() => {
    setForceUnknown(false);
    setSelected(null);
  }, [pattern, flags, redosStatus]);

  const shouldRun =
    regexValid &&
    testString.length > 0 &&
    (redosStatus === 'safe' || (redosStatus === 'unknown' && forceUnknown));

  // parse/redos とは別の 2 つ目の debounce 変換でマッチを駆動する（既存コンポーネントと同方針）。
  // runMatch は native RegExp（CJS 非依存）なので動的 import 不要。shouldRun=false の間は source=null。
  const match = useDebouncedTransform<string, MatchResult | null>(
    shouldRun ? testString : null,
    (ts) => runMatch(pattern, flags, ts, redosStatus === 'unknown' ? UNKNOWN_CAP : undefined),
    EMPTY_MATCH,
    [pattern, flags, redosStatus, forceUnknown],
    { fallbackError: 'マッチ実行に失敗しました' }
  );

  const result = match.result;
  const matches = result?.matches ?? [];
  const selectedIndex = selected !== null && selected < matches.length ? selected : null;
  // 表示中のテキスト（unknown は capped 入力でマッチしているのでハイライトも同じ範囲）
  const shownText = redosStatus === 'unknown' ? testString.slice(0, UNKNOWN_CAP) : testString;

  // グループ列（先頭マッチのグループ構成から導出。同一 regex なら全マッチ共通）
  const groupCols: TableColumn<RegexMatch>[] = (matches[0]?.groups ?? []).map((g) => ({
    key: `g${g.index}`,
    header: g.name ? `${g.index}: ${g.name}` : `グループ${g.index}`,
    className: 'font-mono',
    render: (row: RegexMatch) => {
      const cell = row.groups[g.index - 1];
      return cell?.value === undefined ? <span className="text-muted">(なし)</span> : cell.value;
    },
  }));

  const columns: TableColumn<RegexMatch>[] = [
    { key: 'no', header: '#', cellAlign: 'right', render: (_row, i) => i + 1 },
    {
      key: 'value',
      header: 'マッチ',
      className: 'font-mono',
      render: (row) =>
        row.value === '' ? <span className="text-muted">(空マッチ)</span> : row.value,
    },
    { key: 'pos', header: '位置', cellAlign: 'right', render: (row) => `${row.start}–${row.end}` },
    ...groupCols,
  ];

  return (
    <section aria-label="マッチテスト" className="space-y-3">
      <h2 className="body-emphasis text-default">マッチテスト</h2>

      {!regexValid ? (
        <p className="caption text-muted">有効な正規表現を入力するとマッチを試せます。</p>
      ) : redosStatus === 'vulnerable' ? (
        <NotificationBanner variant="info" title="マッチ実行を無効化しています">
          この正規表現は ReDoS
          のリスクがあるため、安全のため実行をブロックしています。挙動を確認する場合は、上の判定パネルの攻撃文字列を参照してください。
        </NotificationBanner>
      ) : (
        <>
          <InputField
            id="regex-test-input"
            label="テスト文字列"
            value={testString}
            onChange={setTestString}
            placeholder="ここにマッチさせたい文字列を入力"
            hint={
              redosStatus === 'unknown'
                ? 'ReDoS 判定不能のため自動実行しません。下のボタンで実行してください。'
                : undefined
            }
            multiline
            rows={4}
            mono
            maxLength={TEXTAREA_MAX_LENGTH}
          />

          {redosStatus === 'unknown' && !forceUnknown && (
            <ActionButton onClick={() => setForceUnknown(true)} variant="secondary">
              マッチを実行（先頭 {UNKNOWN_CAP} 文字まで）
            </ActionButton>
          )}

          {match.isPending && <p className="caption text-muted">マッチ実行中…</p>}

          {match.error && <p className="caption text-warning">{match.error}</p>}

          {!match.isPending && !match.error && !result && testString === '' && (
            <p className="caption text-muted">テスト文字列を入力してください。</p>
          )}

          {!match.isPending && result && (
            // aria-live は領域全体ではなく簡潔な結果ステータス（件数 / no-match）にのみ付ける。
            // ハイライト本文・表まで live にすると入力のたびに全体が再読み上げされ冗長になるため。
            <div className="space-y-2">
              {result.truncated && (
                <p className="caption text-warning">
                  入力が長いため先頭 {UNKNOWN_CAP} 文字だけで実行しました。
                </p>
              )}
              <div className="rounded-lg border border-default p-3 font-mono caption whitespace-pre-wrap break-all">
                {matches.length > 0 ? (
                  highlight(shownText, matches, selectedIndex, setSelected)
                ) : (
                  <span className="text-muted" aria-live="polite">
                    マッチしませんでした。
                  </span>
                )}
              </div>

              {matches.length > 0 && (
                <>
                  <p className="caption text-muted" aria-live="polite">
                    {matches.length} 件マッチ
                    {!flags.includes('g') && '（g フラグを付けると全マッチを表示します）'}
                  </p>
                  <ResultTable
                    rows={matches}
                    columns={columns}
                    getKey={(row) => `${row.start}-${row.end}-${row.value}`}
                    selectedIndex={selectedIndex}
                    onRowClick={(i) => setSelected(i)}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
