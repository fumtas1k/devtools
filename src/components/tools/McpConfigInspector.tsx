import { useRef, useState, type ChangeEvent } from 'react';
import { InputField } from '@/components/ui/InputField';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { ActionButton } from '@/components/ui/ActionButton';
import { ClearButton } from '@/components/ui/ClearButton';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { Section } from '@/components/ui/Section';
import { inspectMcpConfig, type InspectionResult } from '@/utils/mcp-config-inspector';

export function McpConfigInspector() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const clear = () => {
    generation.current++;
    setInput('');
    setResult(null);
    setError('');
  };
  const edit = (value: string) => {
    generation.current++;
    setInput(value);
    setResult(null);
    setError('');
  };
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const current = ++generation.current;
    setInput('');
    setResult(null);
    setError('');
    if (!file) return;
    if (file.size > 256 * 1024) {
      setError('ファイルは256 KiB以下にしてください。');
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (current === generation.current) setInput(value);
    } catch {
      if (current === generation.current) setError('UTF-8のJSONファイルを選択してください。');
    }
  };
  return (
    <div className="space-y-6">
      <NotificationBanner variant="info" title="このツールについて">
        設定はブラウザ内で確認し、送信・保存しません。静的な確認であり、安全性を保証するものではありません。実際の権限、接続先の信頼性や認証結果は判定できません。
      </NotificationBanner>
      <InputField
        id="mcp-config"
        label="MCP設定 JSON"
        value={input}
        onChange={edit}
        multiline
        rows={12}
        mono
        autoComplete="off"
        error={error || (result?.ok === false ? result.error : undefined)}
        hint="mcpServers形式のJSONのみ対応。JSONC、YAML、TOML、VS Code形式や拡張設定は対象外です。最大256 KiB。"
      />
      <div className="flex flex-wrap gap-3">
        <FileInputButton accept=".json,application/json" onChange={readFile}>
          JSONファイルを選択
        </FileInputButton>
        <ActionButton
          variant="primary"
          onClick={() => {
            generation.current++;
            setError('');
            setResult(inspectMcpConfig(input));
          }}
        >
          確認する
        </ActionButton>
        <ClearButton onClick={clear} />
      </div>
      {result?.ok && (
        <div className="space-y-4" aria-label="確認結果">
          <p role="status">
            {result.servers.length}件の設定、{result.findings.length}件の確認事項があります。
          </p>
          {result.findings.length === 0 && (
            <p>
              対応する静的ルールで確認事項は見つかりませんでした。安全性を保証するものではありません。
            </p>
          )}
          {result.servers.map((server) => (
            <Section key={server.id} title={server.name}>
              <dl className="space-y-2 break-all">
                <div>
                  <dt className="font-bold">方式</dt>
                  <dd>{server.transport}</dd>
                </div>
                {server.command && (
                  <div>
                    <dt className="font-bold">コマンド</dt>
                    <dd>{server.command}</dd>
                  </div>
                )}
                {server.args.length > 0 && (
                  <div>
                    <dt className="font-bold">引数</dt>
                    <dd>
                      <ol className="list-decimal list-inside">
                        {server.args.map((arg, i) => (
                          <li key={i}>{arg}</li>
                        ))}
                      </ol>
                    </dd>
                  </div>
                )}
                {server.destination && (
                  <div>
                    <dt className="font-bold">接続先</dt>
                    <dd>{server.destination}（パス・認証情報等は非表示）</dd>
                  </div>
                )}
                {server.envKeys.length > 0 && (
                  <div>
                    <dt className="font-bold">環境変数キー</dt>
                    <dd>{server.envKeys.join(', ')}（値は非表示）</dd>
                  </div>
                )}
                {server.headerKeys.length > 0 && (
                  <div>
                    <dt className="font-bold">ヘッダー名</dt>
                    <dd>{server.headerKeys.join(', ')}（値は非表示）</dd>
                  </div>
                )}
                {server.references.length > 0 && (
                  <div>
                    <dt className="font-bold">未解決の変数参照</dt>
                    <dd>{server.references.join(', ')}</dd>
                  </div>
                )}
              </dl>
              {result.findings
                .filter((f) => f.serverId === server.id)
                .map((finding, i) => (
                  <div key={i} className="mt-4">
                    <NotificationBanner variant="warning" title="要確認">
                      <p>{finding.reason}</p>
                      <p>{finding.advice}</p>
                      <p>{finding.pointer}</p>
                    </NotificationBanner>
                  </div>
                ))}
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
