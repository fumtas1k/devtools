import { useState } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { Select } from '@/components/ui/Select';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { formatSql, embedParams, type SqlDialect } from '@/utils/sql';
import { useCodec } from '@/hooks/useCodec';

type Mode = 'format' | 'embed';

const DIALECT_OPTIONS: { value: SqlDialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'sqlserver', label: 'SQL Server' },
];

const FORMAT_SAMPLE =
  "select u.id, u.name, u.email from users u join orders o on o.user_id = u.id where u.status = 'active' and o.created_at > '2024-01-01' order by o.created_at desc limit 10";
const EMBED_SQL_SAMPLE = 'SELECT * FROM users WHERE id = ? AND status = ?';
const EMBED_PARAMS_SAMPLE = '[123, "active"]';

export function SqlFormatterTool() {
  const [mode, setMode] = useState<Mode>('format');
  const [dialect, setDialect] = useState<SqlDialect>('mysql');

  // 整形タブ
  const format = useCodec((text) => formatSql(text, dialect), [dialect]);

  // 埋め込みタブ（SQL は useCodec が、パラメータは別 state が保持）
  const [params, setParams] = useState('');
  const embed = useCodec(
    (sql) => formatSql(embedParams(sql, params, dialect), dialect),
    [params, dialect]
  );

  const handleEmbedClear = () => {
    embed.reset();
    setParams('');
  };

  return (
    <div className="space-y-6">
      <ToggleGroup
        options={[
          { value: 'format', label: '整形' },
          { value: 'embed', label: 'パラメータ埋め込み' },
        ]}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        ariaLabel="モード"
      />

      {/* 方言セレクタ（両タブ共通） */}
      <div className="max-w-xs">
        <label htmlFor="sql-dialect" className="body-emphasis text-default block mb-2">
          SQL 方言
        </label>
        <Select id="sql-dialect" options={DIALECT_OPTIONS} value={dialect} onChange={setDialect} />
      </div>

      {mode === 'format' ? (
        <>
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:flex-1 min-w-0">
              <InputField
                id="sql-input"
                label="SQL 入力"
                value={format.input}
                onChange={format.setInput}
                placeholder="SELECT * FROM users WHERE id = 1"
                multiline
                rows={16}
                error={format.error || undefined}
                onSampleClick={() => format.setInput(FORMAT_SAMPLE)}
                mono
                resize
              />
            </div>
            <div className="w-full md:flex-1 min-w-0">
              <OutputField
                id="sql-output"
                label="整形結果"
                value={format.output}
                rows={16}
                ariaLabel="整形結果"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <ClearButton onClick={format.reset} />
          </div>
        </>
      ) : (
        <>
          <div role="note" className="border border-warning bg-warning-tint rounded-lg p-4">
            <p className="caption text-warning">
              ⚠️ この出力はデバッグで内容を確認するための表示用です。文字列連結による値の埋め込みは
              SQL インジェクションの形そのものであり、生成された SQL をそのまま DB
              で実行しないでください。
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            <div className="w-full md:flex-1 min-w-0 space-y-4" data-testid="embed-input-column">
              <InputField
                id="embed-sql-input"
                label="プレースホルダ付き SQL"
                value={embed.input}
                onChange={embed.setInput}
                placeholder="SELECT * FROM users WHERE id = ?"
                multiline
                rows={8}
                onSampleClick={() => {
                  embed.setInput(EMBED_SQL_SAMPLE);
                  setParams(EMBED_PARAMS_SAMPLE);
                }}
                mono
                resize
              />
              <InputField
                id="embed-params-input"
                label="パラメータ（JSON）"
                value={params}
                onChange={setParams}
                placeholder={'[123, "active"]'}
                multiline
                rows={6}
                mono
                resize
              />
              {embed.error && <ErrorMessage message={embed.error} variant="block" />}
            </div>
            <div
              className="w-full md:flex-1 min-w-0 flex md:self-stretch"
              data-testid="embed-output-column"
            >
              <OutputField
                id="embed-output"
                label="埋め込み結果"
                value={embed.output}
                rows={16}
                ariaLabel="埋め込み結果"
                fill
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <ClearButton onClick={handleEmbedClear} />
          </div>
        </>
      )}
    </div>
  );
}
