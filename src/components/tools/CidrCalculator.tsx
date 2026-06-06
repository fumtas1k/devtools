/**
 * CIDR/サブネット計算機 (PR1: info モードのみ)
 *
 * PR2/PR3 で subnet 分割モード・overlap 検出モードを追加予定。
 * ToggleGroup による mode 切替は PR2 で導入する。
 */

import { useState, useMemo } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CopyButton } from '@/components/ui/CopyButton';
import { parseCidr } from '@/utils/cidr-calculator';
import type { CidrInfo } from '@/utils/cidr-calculator';

/** サンプル CIDR 一覧 */
const SAMPLES = ['192.168.1.0/24', '10.0.0.0/8', '172.16.0.0/12', '2001:db8::/32'];
let sampleIdx = 0;

/** IPv4 結果の各行定義 */
interface ResultRow {
  label: string;
  value: string;
  /** CopyButton に渡すラベル用アクセシブル名 */
  copyLabel: string;
}

function buildRows(info: CidrInfo): ResultRow[] {
  const rows: ResultRow[] = [
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
function ResultRow({ label, value, copyLabel }: ResultRow) {
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

export function CidrCalculatorTool() {
  const [input, setInput] = useState('');

  const handleSample = () => {
    setInput(SAMPLES[sampleIdx % SAMPLES.length]);
    sampleIdx++;
  };

  // parseCidr の結果をメモ化。入力が空の場合はエラーを表示しない。
  const { info, error } = useMemo<{ info: CidrInfo | null; error: string | null }>(() => {
    const trimmed = input.trim();
    if (!trimmed) return { info: null, error: null };
    try {
      return { info: parseCidr(trimmed), error: null };
    } catch (e) {
      return { info: null, error: e instanceof Error ? e.message : '入力を解析できませんでした' };
    }
  }, [input]);

  const rows = useMemo(() => (info ? buildRows(info) : []), [info]);

  return (
    <div className="flex flex-col gap-6">
      {/* 入力フィールド */}
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

      {/* エラー表示 (空入力時は表示しない) */}
      {error && <ErrorMessage message={error} variant="block" />}

      {/* 計算結果 */}
      {info && (
        <section aria-label="計算結果">
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
    </div>
  );
}
