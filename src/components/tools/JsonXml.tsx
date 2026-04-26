import { useState } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { jsonToXml, xmlToJson } from '@/utils/json-xml';
import { useCodec } from '@/hooks/useCodec';

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

  const { input, setInput, output, error, reset } = useCodec(
    (text) => (mode === 'json2xml' ? jsonToXml(text) : xmlToJson(text)),
    [mode],
  );

  const handleModeChange = (next: Mode) => {
    setMode(next);
    reset();
  };

  return (
    <div className="space-y-6">
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

      {/* 入力・出力（横並び） */}
      <div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>
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

        <div className="w-full md:flex-1 min-w-0">
          <OutputField
            id="json-xml-output"
            label="出力"
            value={output}
            rows={16}
            ariaLabel="変換結果"
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
