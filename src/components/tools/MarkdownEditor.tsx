import { useMemo, useState } from 'react';
import { InputField } from '@/components/ui/InputField';
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
 *
 * 高さ揃え: 入力（InputField rows=18, mono）とプレビュー箱（.md-preview-box の固定高
 * 28rem ≒ rows=18 の実測高）を同じ外形に揃え、はみ出しは枠内スクロールさせる。
 * JsonFormatter のツリー結果（.json-tree-box）と同じ「固定高で textarea に合わせる」方式。
 * fill / flex-stretch 方式はプレビューがコンテンツ div で高さが青天井に伸びるため不採用。
 * インライン style は使わず CSS class の固定高のみで実現（CSP / 規約準拠）。
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
      {/* 2ペインレイアウト（PC横並び・スマホ縦積み）。
          入力 textarea と固定高のプレビュー箱で左右の縦幅を揃える */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* 左ペイン: 入力 */}
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="md-input"
            label="markdown入力"
            value={input}
            onChange={setInput}
            multiline
            mono
            resize
            rows={18}
            placeholder={`# 見出し\n\n**太字** や *斜体*、\`コード\` が使えます。`}
            onSampleClick={() => setInput(SAMPLE)}
          />
        </div>

        {/* 右ペイン: プレビュー（ラベル行は InputField / OutputField と同一構造で上端を揃える） */}
        <div className="w-full md:flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3 min-h-8">
            <span className="body-emphasis text-default">プレビュー</span>
            {input.length > 0 && (
              <CopyButton text={html} label="HTMLをコピー" ariaLabel="プレビューのHTMLをコピー" />
            )}
          </div>
          {input.length === 0 ? (
            <div
              className="md-preview-box w-full rounded-lg border border-input p-3 caption text-muted flex items-center justify-center"
              aria-label="プレビューエリア（入力待ち）"
            >
              markdown を入力するとプレビューが表示されます
            </div>
          ) : (
            <div
              className="markdown-preview md-preview-box w-full rounded-lg border border-input p-4"
              // sanitizeHtml 済みの HTML を dangerouslySetInnerHTML で描画する。
              // renderMarkdown が必ず sanitizeHtml に通してから返すため XSS は発生しない。
              dangerouslySetInnerHTML={{ __html: html }}
              aria-label="markdownプレビュー"
            />
          )}
        </div>
      </div>

      {/* 下部アクション行（変換系ツールと同じ配置） */}
      <div className="flex justify-end gap-2">
        <DownloadButton
          onClick={handleDownload}
          label=".mdダウンロード"
          variant="secondary"
          disabled={input.length === 0}
        />
      </div>
    </div>
  );
}
