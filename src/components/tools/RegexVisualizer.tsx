import { useState, useEffect } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CopyButton } from '@/components/ui/CopyButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { useDebouncedTransform } from '@/hooks/useDebouncedTransform';
import type { RegexAstNode, RedosResult } from '@/utils/regex-visualizer';
import { RegexAstTree } from './RegexAstTree';

const FLAGS = ['g', 'i', 'm', 's', 'u', 'y', 'd'] as const;
const SAMPLE = '(a+)+$';

type RegexModule = typeof import('@/utils/regex-visualizer');

interface Analysis {
  ast: RegexAstNode;
  redos: RedosResult;
}

// 安定参照（useDebouncedTransform の要件）
const EMPTY: Analysis | null = null;

export function RegexVisualizer() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('');

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

  // parse（同期・throw でエラー表示）と ReDoS（同期 checkSync）を 1 つの debounce 変換で駆動。
  // mod 読み込み前 / pattern 空 は source=null（解析しない）。flags と mod を deps で追跡。
  const analysis = useDebouncedTransform<string, Analysis | null>(
    mod && pattern.trim() ? pattern : null,
    (p) => ({
      ast: mod!.parseRegex(p, flags), // 不正なら throw → error 表示
      redos: mod!.analyzeRedos(p, flags),
    }),
    EMPTY,
    [mod, flags],
    { fallbackError: '正規表現が不正です' }
  );

  const ast = analysis.result?.ast ?? null;
  const redos = analysis.result?.redos ?? null;

  const toggleFlag = (f: string) =>
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, '') : prev + f));

  const handleClear = () => {
    setPattern('');
    setFlags('');
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
            const on = flags.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFlag(f)}
                className={on ? 'flag-toggle flag-toggle-on' : 'flag-toggle'}
              >
                {f}
              </button>
            );
          })}
        </div>
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

      {/* AST ツリー */}
      <section aria-label="構造ツリー">
        <h2 className="body-emphasis text-default mb-2">構造ツリー</h2>
        {analysis.error ? (
          <ErrorMessage message={analysis.error} variant="block" />
        ) : ast ? (
          <RegexAstTree node={ast} hotspot={redos?.hotspot} />
        ) : (
          <p className="caption text-subtle">正規表現を入力すると構造が表示されます。</p>
        )}
      </section>

      <div className="flex justify-end">
        <ClearButton onClick={handleClear} />
      </div>
    </div>
  );
}
