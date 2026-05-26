import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { formatSql, type SqlDialect } from '@/utils/sql';
import { useCodec } from '@/hooks/useCodec';

const DIALECT_OPTIONS: { value: SqlDialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'sqlserver', label: 'SQL Server' },
];

const SAMPLE =
  "select u.id, u.name, u.email from users u join orders o on o.user_id = u.id where u.status = 'active' and o.created_at > '2024-01-01' order by o.created_at desc limit 10";

export function SqlFormatterTool() {
  const [dialect, setDialect] = useState<SqlDialect>('mysql');
  const { input, setInput, output, error, reset } = useCodec(
    (text) => formatSql(text, dialect),
    [dialect]
  );

  return (
    <div className="space-y-6">
      {/* 方言セレクタ */}
      <div className="max-w-xs">
        <label htmlFor="sql-dialect" className="body-emphasis text-default block mb-2">
          SQL 方言
        </label>
        <Select id="sql-dialect" options={DIALECT_OPTIONS} value={dialect} onChange={setDialect} />
      </div>

      {/* 入力・出力（横並び） */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="sql-input"
            label="SQL 入力"
            value={input}
            onChange={setInput}
            placeholder="SELECT * FROM users WHERE id = 1"
            multiline
            rows={16}
            error={error || undefined}
            onSampleClick={() => setInput(SAMPLE)}
            mono
            resize
          />
        </div>

        <div className="w-full md:flex-1 min-w-0">
          <OutputField
            id="sql-output"
            label="整形結果"
            value={output}
            rows={16}
            ariaLabel="整形結果"
          />
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        <ClearButton onClick={reset} />
      </div>
    </div>
  );
}
