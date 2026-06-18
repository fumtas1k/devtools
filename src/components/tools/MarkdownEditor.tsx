import { useState, useMemo } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { renderMarkdown } from '@/utils/markdown';
import { downloadText } from '@/utils/download';

const SAMPLE = `# markdownエディタへようこそ

**GFM（GitHub Flavored Markdown）** に対応したリアルタイムプレビューエディタです。

## 主な機能

- ライブプレビュー（入力と同時に右ペインに反映）
- GFM 表・取り消し線・コードブロック対応
- HTMLコピー・.mdダウンロード

## 表の例

| 名前     | 説明          |
| -------- | ------------- |
| marked   | Markdownパーサ |
| React    | UIフレームワーク |

## コードブロック

\`\`\`typescript
function hello(name: string): string {
  return \`こんにちは、\${name}！\`;
}
\`\`\`

> 引用テキストはこのように表示されます。

~~取り消し線~~ もGFMで使えます。
`;

/**
 * markdownエディタ — 2ペインのライブプレビューツール。
 * 左ペイン: textarea 入力 / 右ペイン: sanitizeHtml済みHTMLプレビュー。
 */
export function MarkdownEditor() {
  const [input, setInput] = useState('');

  // 入力が空の場合は renderMarkdown を呼ばない。
  // renderMarkdown → sanitizeHtml が DOMParser を使うため SSR（Node.js）環境では実行できない。
  // client:load で CSR 専用だが、空入力では不要な処理を避けることで SSR プリレンダでも安全。
  const html = useMemo(() => (input.length === 0 ? '' : renderMarkdown(input)), [input]);

  const handleDownload = () => {
    downloadText(input, 'markdown.md', 'text/markdown');
  };

  return (
    <div className="space-y-4">
      {/* ボタン群 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="caption text-link-plain btn-link-plain"
          onClick={() => setInput(SAMPLE)}
        >
          サンプルを入力
        </button>
        {input.length > 0 && (
          <CopyButton text={html} label="HTMLをコピー" ariaLabel="プレビューのHTMLをコピー" />
        )}
        <DownloadButton
          onClick={handleDownload}
          label=".mdダウンロード"
          variant="secondary"
          disabled={input.length === 0}
        />
      </div>

      {/* 2ペインレイアウト（PC横並び・スマホ縦積み） */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* 左ペイン: 入力 */}
        <div className="w-full md:flex-1 min-w-0 flex flex-col gap-1">
          <label htmlFor="md-input" className="caption text-muted">
            markdown入力
          </label>
          <textarea
            id="md-input"
            className="w-full rounded-lg border border-input p-3 font-mono text-sm text-default bg-default resize-y min-h-96"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`# 見出し\n\n**太字** や *斜体*、\`コード\` が使えます。`}
            rows={20}
          />
        </div>

        {/* 右ペイン: プレビュー */}
        <div className="w-full md:flex-1 min-w-0 flex flex-col gap-1">
          <span className="caption text-muted">プレビュー</span>
          {input.length === 0 ? (
            <div
              className="w-full rounded-lg border border-input p-3 min-h-96 caption text-muted flex items-center justify-center"
              aria-label="プレビューエリア（入力待ち）"
            >
              markdown を入力するとプレビューが表示されます
            </div>
          ) : (
            <div
              className="markdown-preview w-full rounded-lg border border-input p-4 min-h-96 overflow-auto"
              // sanitizeHtml 済みの HTML を dangerouslySetInnerHTML で描画する。
              // renderMarkdown が必ず sanitizeHtml に通してから返すため XSS は発生しない。
              dangerouslySetInnerHTML={{ __html: html }}
              aria-label="markdownプレビュー"
            />
          )}
        </div>
      </div>
    </div>
  );
}
