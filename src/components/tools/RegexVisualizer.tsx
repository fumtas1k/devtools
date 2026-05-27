import { useState, useEffect } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';
import type { RegexAstNode, RedosResult, RailNode } from '@/utils/regex-visualizer';
import { RegexAstTree } from './RegexAstTree';
import { RegexRailroad } from './RegexRailroad';
import { RegexMatchTester } from './RegexMatchTester';

// desc: ボタンの title / aria-label 用（詳細）。short: 画面下の凡例用（コンパクト）。
const FLAGS: { value: string; desc: string; short: string }[] = [
  { value: 'g', desc: '全マッチ（グローバル）', short: '全マッチ' },
  { value: 'i', desc: '大文字小文字を区別しない', short: '大小区別なし' },
  { value: 'm', desc: '複数行（^ $ が各行頭・行末にマッチ）', short: '複数行' },
  { value: 's', desc: '. が改行にもマッチ（dotAll）', short: '. が改行もマッチ' },
  { value: 'u', desc: 'Unicode モード', short: 'Unicode' },
  { value: 'y', desc: '直前の位置からのみマッチ（sticky）', short: '直前位置のみ' },
  { value: 'd', desc: 'マッチ位置（インデックス）を取得', short: 'マッチ位置取得' },
];
const SAMPLE = '(a+)+$';

type RegexModule = typeof import('@/utils/regex-visualizer');

interface Analysis {
  ast: RegexAstNode;
  redos: RedosResult;
  rail: RailNode;
}

// 安定参照（useDebouncedTransform の要件）
const EMPTY: Analysis | null = null;

export function RegexVisualizer() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('');
  // 可視化タブ状態（デフォルトは構造ツリー）
  const [view, setView] = useState<'tree' | 'railroad'>('tree');
  // Clear 時に RegexMatchTester を remount してテスト文字列等の内部 state をリセットするための nonce
  const [clearNonce, setClearNonce] = useState(0);

  // regexp-tree / recheck は CJS かつ client 専用ライブラリ。静的 import すると Astro の
  // SSR module graph に載り、dev SSR で CJS が ESM 評価され `module is not defined` になる。
  // client mount 後に動的 import して SSR graph から外す（型は import type で別途・実行時に消える）。
  const [mod, setMod] = useState<RegexModule | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let active = true;
    import('@/utils/regex-visualizer')
      .then((m) => {
        if (active) setMod(m);
      })
      .catch(() => {
        // chunk ロード失敗時は無反応にせずユーザーへ伝える。
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // parse（同期・throw でエラー表示）と ReDoS（同期 checkSync）と鉄道図を 1 つの debounce 変換で駆動。
  // mod 読み込み前 / pattern 空 は source=null（解析しない）。flags と mod を deps で追跡。
  // buildRailroad は CJS 依存のため mod（動的 import 済み）経由で呼ぶ（SSR 安全を維持）。
  const analysis = useDebouncedTransform<string, Analysis | null>(
    mod && pattern.trim() ? pattern : null,
    (p) => ({
      ast: mod!.parseRegex(p, flags), // 不正なら throw → error 表示
      redos: mod!.analyzeRedos(p, flags),
      rail: mod!.buildRailroad(p, flags),
    }),
    EMPTY,
    [mod, flags],
    { fallbackError: '正規表現が不正です' }
  );

  const ast = analysis.result?.ast ?? null;
  const redos = analysis.result?.redos ?? null;
  const rail = analysis.result?.rail ?? null;

  const toggleFlag = (f: string) =>
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, '') : prev + f));

  const handleClear = () => {
    setPattern('');
    setFlags('');
    setClearNonce((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <InputField
          id="regex-input"
          label="正規表現"
          value={pattern}
          onChange={setPattern}
          placeholder="(a+)+$"
          error={analysis.error || undefined}
          onSampleClick={() => setPattern(SAMPLE)}
          mono
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="フラグ">
          {FLAGS.map((f) => {
            const on = flags.includes(f.value);
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={on}
                aria-label={`${f.value}: ${f.desc}`}
                title={f.desc}
                onClick={() => toggleFlag(f.value)}
                className={on ? 'flag-toggle flag-toggle-on' : 'flag-toggle'}
              >
                {f.value}
              </button>
            );
          })}
        </div>
        {/* 凡例は視覚補助。各ボタンの aria-label で SR には意味が伝わるため aria-hidden で二重読み上げを防ぐ */}
        <ul className="caption text-subtle list-none" aria-hidden="true">
          {FLAGS.map((f, i) => (
            <li key={f.value} className="inline">
              {i > 0 && ' / '}
              <code className="font-mono text-default">{f.value}</code> {f.short}
            </li>
          ))}
        </ul>
      </div>

      {loadError && (
        <ErrorMessage
          message="解析エンジンの読み込みに失敗しました。ページを再読み込みしてください。"
          variant="block"
        />
      )}

      {/* ReDoS 判定パネル（3 状態を区別） */}
      <section
        aria-label="ReDoS 判定"
        aria-live="polite"
        className="rounded-lg border border-default p-4"
      >
        <h2 className="body-emphasis text-default mb-2">ReDoS 判定</h2>
        {analysis.isPending && <p className="caption text-subtle">判定中…</p>}
        {!analysis.isPending && redos?.status === 'safe' && (
          <p className="alert-success">安全：壊滅的バックトラッキングは検出されませんでした。</p>
        )}
        {!analysis.isPending && redos?.status === 'vulnerable' && (
          <div className="space-y-2">
            <p className="text-warning body-emphasis">
              ⚠ 脆弱：ReDoS のリスクがあります（{redos.complexity}）。
            </p>
            {redos.attackString && (
              <div className="flex items-center gap-2">
                <code className="bg-subtle rounded px-2 py-1 font-mono break-all">
                  {redos.attackString}
                </code>
                <CopyButton text={redos.attackString} label="攻撃文字列をコピー" />
              </div>
            )}
          </div>
        )}
        {!analysis.isPending && redos?.status === 'unknown' && (
          <p className="text-subtle">判定不能（{redos.reason}）：安全とは限りません。</p>
        )}
        {!analysis.isPending && !redos && (
          <p className="caption text-subtle">正規表現を入力してください。</p>
        )}
      </section>

      {/* マッチテスト（ReDoS の直下・独立セクション） */}
      <RegexMatchTester
        key={clearNonce}
        pattern={pattern}
        flags={flags}
        redosStatus={redos?.status}
        regexValid={!analysis.error && !!ast}
      />

      {/* 可視化パネル：構造ツリー / 鉄道図 を ToggleGroup で切替 */}
      <section aria-label="可視化">
        <div className="mb-3">
          <ToggleGroup
            options={[
              { value: 'tree', label: '構造ツリー' },
              { value: 'railroad', label: '鉄道図' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'tree' | 'railroad')}
            ariaLabel="表示形式"
          />
        </div>
        {analysis.error ? (
          <ErrorMessage message={analysis.error} variant="block" />
        ) : view === 'tree' ? (
          ast ? (
            <RegexAstTree node={ast} hotspot={redos?.hotspot} />
          ) : (
            <p className="caption text-subtle">正規表現を入力すると構造が表示されます。</p>
          )
        ) : rail ? (
          <RegexRailroad node={rail} hotspot={redos?.hotspot} />
        ) : (
          <p className="caption text-subtle">正規表現を入力すると鉄道図が表示されます。</p>
        )}
      </section>

      <div className="flex justify-end">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
