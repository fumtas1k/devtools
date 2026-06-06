/**
 * CIDR/サブネット計算機（PR3: info モード + 分割モード + 重複検出モード）
 *
 * - 計算モード: CIDR のネットワーク情報を一覧表示（PR1 から継続）
 * - 分割モード: 指定 prefix 長でサブネットを等分割してテーブル表示（PR2 で追加）
 * - 重複検出モード: 複数 CIDR の重複ペアを検出（PR3 で追加）
 */

import { useState, useMemo, useRef } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CopyButton } from '@/components/ui/CopyButton';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { ResultTable } from '@/components/ui/ResultTable';
import { parseCidr, splitSubnet, detectOverlaps } from '@/utils/cidr-calculator';
import type { CidrInfo, OverlapPair } from '@/utils/cidr-calculator';
import type { TableColumn } from '@/components/ui/ResultTable';

/** モード種別 */
type Mode = 'info' | 'split' | 'overlap';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'info', label: '計算' },
  { value: 'split', label: '分割' },
  { value: 'overlap', label: '重複検出' },
];

/** サンプル CIDR 一覧 */
const SAMPLES = ['192.168.1.0/24', '10.0.0.0/8', '172.16.0.0/12', '2001:db8::/32'];

/** IPv4 結果の各行定義 */
interface ResultRowData {
  label: string;
  value: string;
  /** CopyButton に渡すラベル用アクセシブル名 */
  copyLabel: string;
}

export function buildRows(info: CidrInfo): ResultRowData[] {
  const rows: ResultRowData[] = [
    {
      label: 'ネットワークアドレス',
      value: `${info.networkAddress}/${info.prefixLength}`,
      copyLabel: 'ネットワークアドレスをコピー',
    },
  ];

  if (info.broadcastAddress !== null) {
    rows.push({
      label: 'ブロードキャストアドレス',
      value: info.broadcastAddress,
      copyLabel: 'ブロードキャストアドレスをコピー',
    });
  }

  rows.push(
    {
      label: '最初のホスト',
      value: info.firstHost,
      copyLabel: '最初のホストアドレスをコピー',
    },
    {
      label: '最後のホスト',
      value: info.lastHost,
      copyLabel: '最後のホストアドレスをコピー',
    },
    {
      label: '総アドレス数',
      value: info.totalCount.toLocaleString(),
      copyLabel: '総アドレス数をコピー',
    },
    {
      label: '利用可能ホスト数',
      value: info.usableHostCount.toLocaleString(),
      copyLabel: '利用可能ホスト数をコピー',
    }
  );

  if (info.subnetMask !== null) {
    rows.push(
      {
        label: 'サブネットマスク',
        value: info.subnetMask,
        copyLabel: 'サブネットマスクをコピー',
      },
      {
        label: 'ワイルドカードマスク',
        value: info.wildcardMask ?? '',
        copyLabel: 'ワイルドカードマスクをコピー',
      }
    );
  }

  rows.push({
    label: '2 進表記',
    value: info.binaryNetwork,
    copyLabel: '2 進表記をコピー',
  });

  return rows;
}

/** 結果テーブル行コンポーネント */
function ResultRow({ label, value, copyLabel }: ResultRowData) {
  // モバイル: ラベルを上・値を下に縦積み（狭い横並びによるラベル折返しを回避）
  // デスクトップ (md~): ラベル左・値右の横並び
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-default last:border-b-0 md:flex-row md:items-start md:justify-between md:gap-3">
      <dt className="caption text-muted md:w-44 md:shrink-0">{label}</dt>
      <dd className="flex items-start gap-2 min-w-0 md:flex-1 md:justify-end">
        <span className="caption font-mono text-default break-all md:text-right">{value}</span>
        <CopyButton text={value} ariaLabel={copyLabel} compact />
      </dd>
    </div>
  );
}

/** IPv バッジ */
function IpVersionBadge({ version }: { version: 4 | 6 }) {
  return (
    <span className="caption text-muted border border-default rounded px-1.5 py-0.5">
      IPv{version}
    </span>
  );
}

/** 分割テーブルの行データ */
interface SplitRowData {
  index: number;
  cidr: string;
  networkAddress: string;
  broadcastAddress: string;
  hostRange: string;
  usableHostCount: string;
}

/** 分割結果テーブルの列定義 */
const SPLIT_COLUMNS: TableColumn<SplitRowData>[] = [
  {
    key: 'index',
    header: '#',
    headerAlign: 'right',
    cellAlign: 'right',
    width: '3rem',
    render: (row) => row.index,
  },
  {
    key: 'cidr',
    header: 'CIDR',
    render: (row) => <span className="font-mono">{row.cidr}</span>,
  },
  {
    key: 'networkAddress',
    header: 'ネットワーク',
    render: (row) => <span className="font-mono">{row.networkAddress}</span>,
  },
  {
    key: 'broadcastAddress',
    header: 'ブロードキャスト',
    render: (row) => <span className="font-mono">{row.broadcastAddress}</span>,
  },
  {
    key: 'hostRange',
    header: 'ホスト範囲',
    render: (row) => <span className="font-mono">{row.hostRange}</span>,
  },
  {
    key: 'usableHostCount',
    header: '利用可能ホスト数',
    headerAlign: 'right',
    cellAlign: 'right',
    render: (row) => row.usableHostCount,
  },
];

/** CidrInfo[] を SplitRowData[] に変換 */
function buildSplitRows(subnets: CidrInfo[]): SplitRowData[] {
  return subnets.map((s, i) => ({
    index: i + 1,
    cidr: `${s.networkAddress}/${s.prefixLength}`,
    networkAddress: s.networkAddress,
    broadcastAddress: s.broadcastAddress ?? '—',
    hostRange: `${s.firstHost} – ${s.lastHost}`,
    usableHostCount: s.usableHostCount.toLocaleString(),
  }));
}

/** 重複テーブルの行データ */
interface OverlapRowData {
  key: string;
  aCidr: string;
  bCidr: string;
  relationLabel: string;
}

const RELATION_LABELS: Record<string, string> = {
  identical: '完全一致',
  'a-contains-b': 'A が B を包含',
  'b-contains-a': 'B が A を包含',
  partial: '部分重複',
};

/** 重複テーブルの列定義 */
const OVERLAP_COLUMNS: TableColumn<OverlapRowData>[] = [
  {
    key: 'aCidr',
    header: 'CIDR A',
    render: (row) => <span className="font-mono">{row.aCidr}</span>,
  },
  {
    key: 'bCidr',
    header: 'CIDR B',
    render: (row) => <span className="font-mono">{row.bCidr}</span>,
  },
  {
    key: 'relationLabel',
    header: '関係',
    render: (row) => row.relationLabel,
  },
];

/** OverlapPair[] を OverlapRowData[] に変換 */
function buildOverlapRows(pairs: OverlapPair[]): OverlapRowData[] {
  return pairs.map((p) => ({
    key: `${p.aIndex}-${p.bIndex}`,
    aCidr: p.aCidr,
    bCidr: p.bCidr,
    relationLabel: RELATION_LABELS[p.relation] ?? p.relation,
  }));
}

export function CidrCalculatorTool() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('info');
  const [newPrefixStr, setNewPrefixStr] = useState('');
  const [overlapInput, setOverlapInput] = useState('');
  const sampleIdxRef = useRef(0);

  const handleSample = () => {
    setInput(SAMPLES[sampleIdxRef.current % SAMPLES.length]);
    sampleIdxRef.current++;
  };

  // parseCidr の結果をメモ化。入力が空の場合はエラーを表示しない。
  const { info, error: infoError } = useMemo<{
    info: CidrInfo | null;
    error: string | null;
  }>(() => {
    const trimmed = input.trim();
    if (!trimmed) return { info: null, error: null };
    try {
      return { info: parseCidr(trimmed), error: null };
    } catch (e) {
      return { info: null, error: e instanceof Error ? e.message : '入力を解析できませんでした' };
    }
  }, [input]);

  const rows = useMemo(() => (info ? buildRows(info) : []), [info]);

  // 分割モードの計算
  const { subnets, splitError } = useMemo<{
    subnets: CidrInfo[] | null;
    splitError: string | null;
  }>(() => {
    if (mode !== 'split') return { subnets: null, splitError: null };
    const trimmed = input.trim();
    const prefixTrimmed = newPrefixStr.trim();
    if (!trimmed || !prefixTrimmed) return { subnets: null, splitError: null };
    // 整数文字列以外（"26abc" や "26.9" など）を早期に弾く
    if (!/^\d+$/.test(prefixTrimmed)) {
      return {
        subnets: null,
        splitError: '分割先 prefix は 0 以上の整数で入力してください',
      };
    }
    const newPrefix = parseInt(prefixTrimmed, 10);
    try {
      return { subnets: splitSubnet(trimmed, newPrefix), splitError: null };
    } catch (e) {
      return { subnets: null, splitError: e instanceof Error ? e.message : '分割に失敗しました' };
    }
  }, [mode, input, newPrefixStr]);

  const splitRows = useMemo(() => (subnets ? buildSplitRows(subnets) : []), [subnets]);

  // 重複検出モードの計算
  const overlapResult = useMemo(() => {
    if (mode !== 'overlap') return null;
    const lines = overlapInput.split('\n');
    // 全行空ならスキップ
    if (lines.every((l) => l.trim() === '')) return null;
    return detectOverlaps(lines);
  }, [mode, overlapInput]);

  const overlapRows = useMemo(
    () => (overlapResult ? buildOverlapRows(overlapResult.pairs) : []),
    [overlapResult]
  );

  // 表示するエラー（info モードと split モードで使い分け）
  const displayError = mode === 'split' ? (infoError ?? splitError) : infoError;

  return (
    <div className="flex flex-col gap-6">
      {/* モード切替 */}
      <ToggleGroup<Mode>
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
        ariaLabel="表示モード"
      />

      {/* CIDR 入力（計算/分割モード共有） */}
      {mode !== 'overlap' && (
        <InputField
          id="cidr-input"
          label="CIDR"
          value={input}
          onChange={setInput}
          placeholder="192.168.1.0/24"
          hint="例: 192.168.1.0/24 / 10.0.0.0/8 / 2001:db8::/32 / ::1/128"
          onSampleClick={handleSample}
          mono
        />
      )}

      {/* 分割モード: 分割先 prefix 入力 */}
      {mode === 'split' && (
        <InputField
          id="split-prefix-input"
          label="分割先 prefix 長"
          value={newPrefixStr}
          onChange={setNewPrefixStr}
          placeholder="26"
          hint="例: /24 を 26 にすると 4 サブネットに分割（最大 1024 分割）"
          inputMode="numeric"
          mono
        />
      )}

      {/* 重複検出モード: 複数行 CIDR 入力 */}
      {mode === 'overlap' && (
        <InputField
          id="overlap-input"
          label="CIDR 一覧（1 行 1 CIDR）"
          value={overlapInput}
          onChange={setOverlapInput}
          multiline
          rows={6}
          placeholder={'10.0.0.0/8\n10.1.0.0/16\n192.168.0.0/24'}
          hint="例: 10.0.0.0/8 / 2001:db8::/32。1 行に 1 つずつ入力してください。IPv4/IPv6 混在可。最大 256 件。"
          maxLength={20000}
          mono
          resize
        />
      )}

      {/* エラー表示（空入力時は表示しない。overlap モードでは行エラーを別途表示するためスキップ） */}
      {mode !== 'overlap' && displayError && (
        <ErrorMessage message={displayError} variant="block" />
      )}

      {/* 計算モード: ネットワーク情報 */}
      {mode === 'info' && info && (
        <section aria-label="計算結果" aria-live="polite">
          {/* ヘッダ */}
          <div className="flex items-center gap-2 mb-3">
            <h2 className="body-emphasis text-default">ネットワーク情報</h2>
            <IpVersionBadge version={info.version} />
          </div>

          {/* 結果テーブル */}
          <dl className="rounded-lg border border-default px-4">
            {rows.map((row) => (
              <ResultRow key={row.label} {...row} />
            ))}
          </dl>
        </section>
      )}

      {/* 分割モード: サブネット一覧テーブル */}
      {mode === 'split' && subnets && subnets.length > 0 && (
        <section aria-label="分割結果" aria-live="polite">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="body-emphasis text-default">サブネット一覧</h2>
            {info && <IpVersionBadge version={info.version} />}
            <span className="caption text-muted">({subnets.length} サブネット)</span>
          </div>
          <ResultTable<SplitRowData>
            rows={splitRows}
            columns={SPLIT_COLUMNS}
            getKey={(row) => String(row.index)}
            minWidth="40rem"
          />
        </section>
      )}

      {/* 重複検出モード: 結果 */}
      {mode === 'overlap' && overlapResult && (
        <section aria-label="重複検出結果" aria-live="polite">
          {/* 入力件数超過: O(n²) 爆発防止ガード */}
          {overlapResult.limitExceeded && (
            <ErrorMessage
              message={`入力された CIDR が多すぎます（最大 256 件）。件数を減らしてください。現在 ${overlapResult.validCount} 件の有効 CIDR があります。`}
              variant="block"
            />
          )}

          {/* 行エラー一覧 */}
          {!overlapResult.limitExceeded && overlapResult.errors.length > 0 && (
            <div className="mb-4">
              <p className="body-emphasis text-error mb-2">解析エラーがある行:</p>
              <ul className="flex flex-col gap-1">
                {overlapResult.errors.map((err) => (
                  <li key={err.index} className="caption text-error">
                    <span className="font-mono">
                      行 {err.index + 1}: {err.input}
                    </span>
                    {' — '}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 重複ペアが検出された場合 */}
          {!overlapResult.limitExceeded && overlapResult.pairs.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="body-emphasis text-default">重複ペア一覧</h2>
                <span className="caption text-muted">({overlapResult.pairs.length} ペア)</span>
              </div>
              <ResultTable<OverlapRowData>
                rows={overlapRows}
                columns={OVERLAP_COLUMNS}
                getKey={(row) => row.key}
              />
              {/* ペア数打ち切り通知 */}
              {overlapResult.pairsTruncated && (
                <p className="caption text-muted mt-2">
                  検出された重複ペアが多いため先頭 1000 件のみ表示しています
                </p>
              )}
            </>
          )}

          {/* 有効 CIDR が 2 件以上 & 重複ゼロ */}
          {!overlapResult.limitExceeded &&
            overlapResult.validCount >= 2 &&
            overlapResult.pairs.length === 0 && (
              <p className="caption text-muted">重複は検出されませんでした</p>
            )}
        </section>
      )}
    </div>
  );
}
