import { useMemo, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { BareInput } from '@/components/ui/BareInput';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import {
  DIALECTS,
  SUPPORTED_SCHEMES,
  maskDsn,
  parseDsn,
  serializeDsn,
  validateModel,
} from '@/utils/dsn-builder';
import type { DsnModel, DsnScheme } from '@/utils/dsn-builder';

const EMPTY_MODEL: DsnModel = {
  scheme: 'postgresql',
  user: '',
  password: '',
  hosts: [{ host: '', port: '' }],
  database: '',
  params: [],
};

/** 全フィールド未入力（初期状態相当）か。URI 欄を空にする判定に使う */
function isEmptyModel(model: DsnModel): boolean {
  return (
    model.user === '' &&
    model.password === '' &&
    model.database === '' &&
    model.params.length === 0 &&
    model.hosts.length === 1 &&
    model.hosts[0].host === '' &&
    model.hosts[0].port === ''
  );
}

const SCHEME_OPTIONS = SUPPORTED_SCHEMES.map((s) => ({
  value: s,
  label: `${s}:// — ${DIALECTS[s].label}`,
}));

export function DsnBuilderTool() {
  const [uriText, setUriText] = useState('');
  const [model, setModel] = useState<DsnModel>(EMPTY_MODEL);
  const [error, setError] = useState<string | null>(null);

  const dialect = DIALECTS[model.scheme];
  const masked = useMemo(
    () => (error === null && !isEmptyModel(model) ? maskDsn(model) : ''),
    [model, error]
  );

  // URI 欄 → フォーム
  const handleUriChange = (text: string) => {
    setUriText(text);
    if (text.trim() === '') {
      setModel(EMPTY_MODEL);
      setError(null);
      return;
    }
    const result = parseDsn(text);
    if (result.ok) {
      setModel(result.model);
      setError(null);
    } else {
      setError(result.error);
    }
  };

  // フォーム → URI 欄
  const applyModel = (next: DsnModel) => {
    setModel(next);
    const validationError = validateModel(next);
    setError(validationError);
    if (validationError === null) {
      setUriText(isEmptyModel(next) ? '' : serializeDsn(next));
    }
  };

  const handleSampleClick = () => {
    handleUriChange(dialect.sample);
  };

  const updateHost = (index: number, host: string, port: string) => {
    const hosts = model.hosts.map((h, i) => (i === index ? { host, port } : h));
    applyModel({ ...model, hosts });
  };

  const addHost = () => {
    applyModel({ ...model, hosts: [...model.hosts, { host: '', port: '' }] });
  };

  const removeHost = (index: number) => {
    applyModel({ ...model, hosts: model.hosts.filter((_, i) => i !== index) });
  };

  const updateParam = (index: number, key: string, value: string) => {
    const params = model.params.map((p, i) => (i === index ? { key, value } : p));
    applyModel({ ...model, params });
  };

  const addParam = () => {
    applyModel({ ...model, params: [...model.params, { key: '', value: '' }] });
  };

  const removeParam = (index: number) => {
    applyModel({ ...model, params: model.params.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <InputField
        id="dsn-uri"
        label="接続 URI"
        value={uriText}
        onChange={handleUriChange}
        multiline
        rows={3}
        mono
        resize
        placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
        onSampleClick={handleSampleClick}
        error={error ?? undefined}
        hint="入力した接続文字列はブラウザ外に送信されません"
      />

      <Section title="フォーム">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-3 min-h-8">
                <label htmlFor="dsn-scheme" className="body-emphasis text-default">
                  スキーム
                </label>
              </div>
              <Select
                id="dsn-scheme"
                options={SCHEME_OPTIONS}
                value={model.scheme}
                onChange={(v: DsnScheme) => applyModel({ ...model, scheme: v })}
              />
            </div>
            <InputField
              id="dsn-user"
              label="ユーザー名"
              value={model.user}
              onChange={(v) => applyModel({ ...model, user: v })}
              mono
            />
            <InputField
              id="dsn-password"
              label="パスワード"
              value={model.password}
              onChange={(v) => applyModel({ ...model, password: v })}
              mono
              hint="記号は URI 生成時に自動で percent-encode されます"
            />
          </div>

          <fieldset className="m-0 border-0 p-0">
            <legend className="body-emphasis text-default mb-3 p-0">ホスト</legend>
            <div className="space-y-2">
              {model.hosts.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <BareInput
                    value={h.host}
                    onChange={(v) => updateHost(i, v, h.port)}
                    mono
                    aria-label={`ホスト ${i + 1}`}
                    placeholder="db.example.com"
                    className="flex-1 min-w-0"
                  />
                  <BareInput
                    value={h.port}
                    onChange={(v) => updateHost(i, h.host, v)}
                    mono
                    inputMode="numeric"
                    aria-label={`ポート ${i + 1}`}
                    placeholder={
                      dialect.defaultPort === null ? '指定不可' : String(dialect.defaultPort)
                    }
                    className="w-24 flex-none"
                  />
                  {model.hosts.length > 1 && (
                    <ActionButton
                      size="compact"
                      variant="danger"
                      onClick={() => removeHost(i)}
                      aria-label={`ホスト ${i + 1} を削除`}
                    >
                      削除
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
            {dialect.multiHost && (
              <div className="mt-2">
                <ActionButton size="compact" variant="secondary" onClick={addHost}>
                  ホストを追加
                </ActionButton>
              </div>
            )}
          </fieldset>

          <InputField
            id="dsn-database"
            label={dialect.pathLabel}
            value={model.database}
            onChange={(v) => applyModel({ ...model, database: v })}
            mono
          />

          <fieldset className="m-0 border-0 p-0">
            <legend className="body-emphasis text-default mb-3 p-0">クエリパラメータ</legend>
            <div className="space-y-2">
              {model.params.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <BareInput
                    value={p.key}
                    onChange={(v) => updateParam(i, v, p.value)}
                    mono
                    aria-label={`パラメータ名 ${i + 1}`}
                    placeholder="sslmode"
                    className="flex-1 min-w-0"
                  />
                  <BareInput
                    value={p.value}
                    onChange={(v) => updateParam(i, p.key, v)}
                    mono
                    aria-label={`パラメータ値 ${i + 1}`}
                    placeholder="require"
                    className="flex-1 min-w-0"
                  />
                  <ActionButton
                    size="compact"
                    variant="danger"
                    onClick={() => removeParam(i)}
                    aria-label={`パラメータ ${i + 1} を削除`}
                  >
                    削除
                  </ActionButton>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <ActionButton size="compact" variant="secondary" onClick={addParam}>
                パラメータを追加
              </ActionButton>
            </div>
          </fieldset>
        </div>
      </Section>

      <OutputField
        id="dsn-masked"
        label="マスク済み URI（共有用）"
        value={masked}
        rows={3}
        copyLabel="コピー"
      />
    </div>
  );
}
