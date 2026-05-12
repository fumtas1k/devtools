import { useState, useEffect, useRef } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { ActionButton } from '@/components/ui/ActionButton';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { useCodec } from '@/hooks/useCodec';
import { convert } from '@/utils/config-converter';
import type { ConfigFormat } from '@/utils/config-converter';
import type { ValidationResult } from '@/utils/config-converter/schema-validator';
import { downloadText } from '@/utils/download';

const FORMAT_LABELS: Record<ConfigFormat, string> = {
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  dotenv: '.env',
};

const EXTENSIONS: Record<ConfigFormat, string> = {
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
  dotenv: 'env',
};

const MIMETYPES: Record<ConfigFormat, string> = {
  json: 'application/json',
  yaml: 'text/yaml',
  toml: 'application/toml',
  dotenv: 'text/plain',
};

const SAMPLE: Record<ConfigFormat, string> = {
  json: JSON.stringify(
    { server: { host: 'localhost', port: 8080 }, debug: true, tags: ['web', 'api'] },
    null,
    2
  ),
  yaml: `# サーバー設定\nserver:\n  host: localhost\n  port: 8080\ndebug: true\ntags:\n  - web\n  - api`,
  toml: `[server]\nhost = "localhost"\nport = 8080\n\ndebug = true\ntags = ["web", "api"]`,
  dotenv: `# アプリ設定\nSERVER_HOST=localhost\nSERVER_PORT=8080\nDEBUG=true`,
};

const FORMAT_OPTIONS: { value: ConfigFormat; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'toml', label: 'TOML' },
  { value: 'dotenv', label: '.env' },
];

export function ConfigConverterTool() {
  const [from, setFrom] = useState<ConfigFormat>('json');
  const [to, setTo] = useState<ConfigFormat>('yaml');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const warningsRef = useRef<string[]>([]);
  const { input, setInput, output, error, isPending, reset } = useCodec(
    (text) => {
      const result = convert(text, from, to);
      warningsRef.current = result.warnings;
      return result.output;
    },
    [from, to]
  );

  useEffect(() => {
    if (!output && !error) {
      setWarnings([]);
      return;
    }
    setWarnings(error ? [] : warningsRef.current);
    setValidationResult(null);
  }, [output, error]);

  const handleFromChange = (next: ConfigFormat) => {
    setFrom(next);
    reset();
    setWarnings([]);
    setValidationResult(null);
  };

  const handleToChange = (next: ConfigFormat) => {
    setTo(next);
    setWarnings([]);
    setValidationResult(null);
  };

  const handleValidate = async () => {
    if (!output || !schemaText) return;
    setIsValidating(true);
    setValidationResult(null);
    try {
      let data: unknown;
      try {
        data = JSON.parse(output);
      } catch {
        data = JSON.parse(convert(output, to, 'json').output);
      }
      let schema: unknown;
      try {
        schema = JSON.parse(schemaText);
      } catch {
        setValidationResult({
          valid: false,
          errors: [{ path: '/', message: 'スキーマが有効なJSONではありません' }],
        });
        return;
      }
      const { validateWithSchema } = await import('@/utils/config-converter/schema-validator');
      const result = validateWithSchema(data, schema);
      setValidationResult(result);
    } catch (e) {
      setValidationResult({
        valid: false,
        errors: [
          {
            path: '/',
            message:
              e instanceof Error && /[぀-龯　-〿]/.test(e.message)
                ? e.message
                : 'JSON Schema の解析に失敗しました',
          },
        ],
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="caption text-muted min-w-10">変換元</span>
          <ToggleGroup
            options={FORMAT_OPTIONS}
            value={from}
            onChange={handleFromChange}
            ariaLabel="変換元フォーマット"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="caption text-muted min-w-10">変換先</span>
          <ToggleGroup
            options={FORMAT_OPTIONS}
            value={to}
            onChange={handleToChange}
            ariaLabel="変換先フォーマット"
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="config-converter-input"
            label={from === to ? `${FORMAT_LABELS[from]} (整形)` : FORMAT_LABELS[from]}
            value={input}
            onChange={setInput}
            multiline
            rows={16}
            error={error || undefined}
            onSampleClick={() => setInput(SAMPLE[from])}
            mono
            resize
          />
        </div>
        <div className="w-full md:flex-1 min-w-0">
          <OutputField
            id="config-converter-output"
            label={FORMAT_LABELS[to]}
            value={output}
            rows={16}
            rightSlot={
              output ? (
                <DownloadButton
                  onClick={() => downloadText(output, `config.${EXTENSIONS[to]}`, MIMETYPES[to])}
                  label="ダウンロード"
                  variant="secondary"
                  disabled={isPending}
                />
              ) : undefined
            }
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg p-3 border border-warning bg-warning-tint">
          <ul className="caption text-default m-0 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setSchemaOpen((o) => !o)}
          aria-expanded={schemaOpen}
          aria-controls="config-converter-schema-panel"
          className="flex items-center gap-1 caption text-link-color btn-link-plain"
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform duration-200 ${schemaOpen ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          JSON Schema で検証する
        </button>
        {schemaOpen && (
          <div id="config-converter-schema-panel" className="mt-3 space-y-3">
            <InputField
              id="config-converter-schema"
              label="JSON Schema (貼り付け)"
              value={schemaText}
              onChange={setSchemaText}
              multiline
              rows={8}
              mono
              resize
              placeholder='{ "$schema": "...", "type": "object", ... }'
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  if (!output || !schemaText || isValidating) return;
                  e.preventDefault();
                  handleValidate();
                }
              }}
            />
            <div className="flex items-center gap-3">
              <ActionButton
                onClick={handleValidate}
                disabled={!output || !schemaText || isValidating}
                loading={isValidating}
                variant="primary"
                aria-keyshortcuts="Meta+Enter Control+Enter"
              >
                {isValidating ? '検証中…' : '検証する'}
              </ActionButton>
              <kbd className="caption text-muted font-mono" aria-hidden="true">
                Cmd/Ctrl+Enter
              </kbd>
            </div>
            {validationResult && (
              <div
                className={`rounded-lg p-3 border ${validationResult.valid ? 'alert-success' : 'alert-error'}`}
                role={validationResult.valid ? 'status' : 'alert'}
                aria-live={validationResult.valid ? 'polite' : 'assertive'}
              >
                {validationResult.valid ? (
                  <p className="caption text-default inline-flex items-center gap-1">
                    <span className="text-success">
                      <StatusIcon variant="success" />
                    </span>
                    スキーマ検証成功
                  </p>
                ) : (
                  <ul className="caption text-error-text m-0 pl-5">
                    {validationResult.errors.map((e, i) => (
                      <li key={i}>
                        <strong>{e.path}</strong>: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <ClearButton
          onClick={() => {
            reset();
            setWarnings([]);
            setValidationResult(null);
            setSchemaText('');
          }}
        />
      </div>
    </div>
  );
}
