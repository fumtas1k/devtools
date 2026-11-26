import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { InputField } from '@/components/ui/InputField';
import { compareJson, type JsonChange } from '@/utils/json-diff';

const LABELS: Record<JsonChange['kind'], string> = {
  added: '追加',
  removed: '削除',
  changed: '変更',
};

export function JsonDiff() {
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [result, setResult] = useState<ReturnType<typeof compareJson>>();

  function changeBefore(value: string) {
    setBefore(value);
    setResult(undefined);
  }

  function changeAfter(value: string) {
    setAfter(value);
    setResult(undefined);
  }

  function fillSample() {
    setBefore('{\n  "name": "demo",\n  "version": 1,\n  "preview": false\n}');
    setAfter('{\n  "name": "demo",\n  "version": 2,\n  "region": "jp"\n}');
    setResult(undefined);
  }

  function clear() {
    setBefore('');
    setAfter('');
    setResult(undefined);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <InputField
          id="json-diff-before"
          label="変更前のJSON"
          value={before}
          onChange={changeBefore}
          error={result?.ok === false ? result.beforeError : undefined}
          multiline
          rows={8}
          resize
          mono
          autoComplete="off"
          spellCheck={false}
        />
        <InputField
          id="json-diff-after"
          label="変更後のJSON"
          value={after}
          onChange={changeAfter}
          error={result?.ok === false ? result.afterError : undefined}
          multiline
          rows={8}
          resize
          mono
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton
          onClick={() => setResult(compareJson(before, after))}
          disabled={!before.trim() || !after.trim()}
          variant="primary"
        >
          比較する
        </ActionButton>
        <ActionButton onClick={fillSample}>サンプルを入力</ActionButton>
        <ClearButton onClick={clear} />
      </div>
      <p className="text-muted">
        入力は外部に送信せず、履歴も保存しません。オブジェクトのキー順と空白は無視し、配列は同じ位置の要素を比較します。
      </p>
      <section aria-labelledby="json-diff-heading" className="space-y-3">
        <h2 id="json-diff-heading" className="text-lg font-bold text-default">
          比較結果
        </h2>
        <p role="status" className="text-default">
          {result?.ok
            ? result.total === 0
              ? '差分はありません。'
              : result.total > result.changes.length
                ? `差分 ${result.total} 件のうち、先頭 ${result.changes.length} 件を表示しています。`
                : `差分 ${result.total} 件`
            : result?.ok === false
              ? '入力を修正してから再度比較してください。'
              : '2つのJSONを入力して比較してください。'}
        </p>
        {result?.ok && result.changes.length > 0 && (
          <ul className="space-y-3">
            {result.changes.map(({ kind, path, before: previous, after: next }, index) => (
              <li key={index} className="space-y-2 rounded-lg border border-default p-4">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <strong>{LABELS[kind]}</strong>
                  <code className="min-w-0 wrap-anywhere font-mono">{path || 'ルート'}</code>
                </p>
                <dl className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                  {(
                    [
                      ['変更前', previous],
                      ['変更後', next],
                    ] as const
                  ).map(([label, value]) =>
                    value === undefined ? null : (
                      <div key={label} className="min-w-0 space-y-1">
                        <dt className="text-muted">{label}</dt>
                        <dd className="rounded-md bg-subtle p-2">
                          <code className="whitespace-pre-wrap wrap-anywhere font-mono">
                            {value}
                          </code>
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
