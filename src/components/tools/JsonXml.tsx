import { useState, useEffect } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { jsonToXml, xmlToJson } from '@/utils/json-xml';

type Mode = 'json2xml' | 'xml2json';

const SAMPLE: Record<Mode, string> = {
  json2xml: JSON.stringify(
    {
      user: {
        '@_id': '1',
        name: '山田太郎',
        email: 'yamada@example.com',
        roles: { role: ['admin', 'editor'] },
      },
    },
    null,
    2,
  ),
  xml2json: `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <user id="1">
    <name>山田太郎</name>
    <email>yamada@example.com</email>
    <roles>
      <role>admin</role>
      <role>editor</role>
    </roles>
  </user>
</root>`,
};

export function JsonXmlTool() {
  const [mode, setMode] = useState<Mode>('json2xml');
  const [input, setInput] = useState('');
  const [rootTag, setRootTag] = useState('root');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setOutput('');
      setError('');
      return;
    }
    const timer = setTimeout(() => {
      try {
        const result =
          mode === 'json2xml' ? jsonToXml(input, rootTag) : xmlToJson(input);
        setOutput(result);
        setError('');
      } catch (e) {
        setOutput('');
        setError(e instanceof Error ? e.message : '変換に失敗しました');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, mode, rootTag]);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setInput('');
    setOutput('');
    setError('');
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  return (
    <div className="space-y-4">
      {/* モード切替 */}
      <ToggleGroup
        options={[
          { value: 'json2xml', label: 'JSON → XML' },
          { value: 'xml2json', label: 'XML → JSON' },
        ]}
        value={mode}
        onChange={handleModeChange}
        ariaLabel="変換モード"
      />

      {/* ルートタグ名（JSON→XML時のみ） */}
      {mode === 'json2xml' && (
        <div>
          <label htmlFor="root-tag" style={{ ...bodyEmphasis, color: colors.text }}>
            ルートタグ名
          </label>
          <input
            id="root-tag"
            type="text"
            value={rootTag}
            onChange={(e) => setRootTag(e.target.value)}
            placeholder="root"
            style={{
              ...caption,
              display: 'block',
              marginTop: '0.25rem',
              width: '12rem',
              border: `1px solid ${colors.borderInput}`,
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              background: colors.bg,
              color: colors.text,
              outline: 'none',
              fontFamily: 'monospace',
            }}
          />
        </div>
      )}

      {/* 入力・出力（横並び） */}
      <div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>
        {/* 入力 */}
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="json-xml-input"
            label="入力"
            value={input}
            onChange={setInput}
            placeholder={mode === 'json2xml' ? '{"key": "value"}' : '<root><key>value</key></root>'}
            multiline
            rows={16}
            error={error || undefined}
            onSampleClick={() => setInput(SAMPLE[mode])}
            mono
            resize
          />
        </div>

        {/* 出力 */}
        <div className="w-full md:flex-1 min-w-0">
          <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="json-xml-output" style={{ ...bodyEmphasis, color: colors.text }}>出力</label>
            <span style={{ visibility: output ? 'visible' : 'hidden' }}>
              <CopyButton text={output} label="コピー" />
            </span>
          </div>
          <textarea
            id="json-xml-output"
            readOnly
            value={output}
            rows={16}
            className="w-full rounded-lg px-3 py-2 font-mono"
            style={{
              ...caption,
              border: `1px solid ${colors.border}`,
              background: colors.bgSubtle,
              color: colors.text,
              resize: 'vertical',
            }}
            aria-label="変換結果"
          />
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        <button
          onClick={handleClear}
          className="rounded-lg px-3 py-1.5 transition-colors"
          style={{ ...caption, color: colors.muted }}
        >
          クリア
        </button>
      </div>
    </div>
  );
}
