import { useEffect, useRef, useState } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { InputField } from '@/components/ui/InputField';
import { CopyButton } from '@/components/ui/CopyButton';
import { DownloadButtonGroup } from '@/components/ui/DownloadButtonGroup';
import { ClearButton } from '@/components/ui/ClearButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { parseDdl, toMermaid, toSvg, type Dialect } from '@/utils/ddl-er-diagram';

const DIALECT_OPTIONS: { value: Dialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
];

const SAMPLE = `CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255)
);

CREATE TABLE posts (
  id INT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
);`;

export function DdlErDiagramTool() {
  const [input, setInput] = useState('');
  const [dialect, setDialect] = useState<Dialect>('mysql');
  const [mermaidCode, setMermaidCode] = useState('');
  const [svg, setSvg] = useState('');
  const [svgUrl, setSvgUrl] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const renderSeq = useRef(0);

  // SVG 文字列が変わるたびに blob URL を生成し、古い URL を revoke する
  useEffect(() => {
    if (!svg) {
      setSvgUrl('');
      return;
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setSvgUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [svg]);

  useEffect(() => {
    let cancelled = false;
    const seq = ++renderSeq.current;
    if (!input.trim()) {
      setMermaidCode('');
      setSvg('');
      setErrors([]);
      return;
    }
    (async () => {
      const { model, errors: parseErrors } = await parseDdl(input, dialect);
      if (cancelled || seq !== renderSeq.current) return;
      setErrors(parseErrors.map((e) => e.message));
      if (model.tables.length === 0) {
        setMermaidCode('');
        setSvg('');
        return;
      }
      // toSvg・toMermaid はどちらも同期純関数。dynamic import 不要。
      const svgStr = toSvg(model);
      const code = toMermaid(model);
      if (cancelled || seq !== renderSeq.current) return;
      setSvg(svgStr);
      setMermaidCode(code);
    })();
    return () => {
      cancelled = true;
    };
  }, [input, dialect]);

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'er-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const fail = (msg: string) => {
      URL.revokeObjectURL(url);
      setErrors((prev) => [...prev, msg]);
    };
    const img = new Image();
    // 読み込み失敗時も blob URL を必ず revoke する（リーク防止）
    img.onerror = () => fail('PNG の生成に失敗しました（画像の読み込みに失敗）。');
    img.onload = () => {
      const scale = 2;
      // SVG に寸法が無い等で 0/NaN になった場合は描画せずエラー通知（リーク防止）
      if (!(img.width > 0) || !(img.height > 0)) {
        fail('PNG の生成に失敗しました（ER図のサイズを取得できません）。');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        fail('PNG の生成に失敗しました（canvas を初期化できません）。');
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const purl = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = purl;
        a.download = 'er-diagram.png';
        a.click();
        URL.revokeObjectURL(purl);
      }, 'image/png');
    };
    img.src = url;
  };

  const clear = () => {
    setInput('');
    setMermaidCode('');
    setSvg('');
    setSvgUrl('');
    setErrors([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <span className="body-emphasis text-default block mb-2">SQL 方言</span>
        <ToggleGroup
          options={DIALECT_OPTIONS}
          value={dialect}
          onChange={(v) => setDialect(v as Dialect)}
          ariaLabel="SQL 方言"
        />
      </div>

      <InputField
        id="ddl-input"
        label="CREATE TABLE 文"
        value={input}
        onChange={setInput}
        placeholder="CREATE TABLE users (id INT PRIMARY KEY, ...);"
        multiline
        rows={14}
        onSampleClick={() => setInput(SAMPLE)}
        mono
        resize
      />

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((msg, i) => (
            <ErrorMessage key={i} message={msg} variant="block" />
          ))}
        </div>
      )}

      {svgUrl && (
        <div className="space-y-4">
          <div
            className="overflow-auto rounded border border-default bg-default p-4"
            data-testid="er-diagram"
          >
            <img
              src={svgUrl}
              alt="生成されたER図"
              className="max-w-none"
              data-testid="er-diagram-img"
            />
          </div>
          <DownloadButtonGroup onDownloadSvg={downloadSvg} onDownloadPng={downloadPng} />
        </div>
      )}

      {mermaidCode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="body-emphasis text-default">Mermaid コード</span>
            <CopyButton text={mermaidCode} />
          </div>
          <pre
            className="overflow-auto rounded bg-subtle p-3 text-sm font-mono"
            data-testid="mermaid-code"
          >
            {mermaidCode}
          </pre>
        </div>
      )}

      <div className="flex justify-end">
        <ClearButton onClick={clear} />
      </div>
    </div>
  );
}
