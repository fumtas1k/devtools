import { useState, useEffect, useCallback, useRef } from 'react';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { FileInputButton } from '@/components/ui/FileInputButton';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { ChipLabel } from '@/components/ui/ChipLabel';
import { convertKey } from '@/utils/key/convert';
import type { ConvertResult } from '@/utils/key/types';
import { SAMPLE_RSA_PUBLIC_KEY, SAMPLE_EC_PRIVATE_KEY } from './keyConverterSample';

// ---- ダウンロードヘルパー ----

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBinary(filename: string, bytes: Uint8Array) {
  // Uint8Array を ArrayBuffer に変換してから Blob を作成する（SharedArrayBuffer 回避）
  const arrayBuffer: ArrayBuffer =
    bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer
      : (bytes.buffer.slice(0) as unknown as ArrayBuffer);
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- 状態型 ----

type ConvertState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: ConvertResult }
  | { status: 'error'; message: string };

// ---- メインコンポーネント ----

export function KeyConverter() {
  const [input, setInput] = useState('');
  const [convertState, setConvertState] = useState<ConvertState>({ status: 'idle' });
  // race condition 対策: 最新の変換のみ反映する
  const latestInputRef = useRef('');

  // 入力変更で変換を実行する（デバウンス付き非同期）
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      setConvertState({ status: 'idle' });
      return;
    }

    setConvertState({ status: 'loading' });
    latestInputRef.current = input;
    const capturedInput = input;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const result = await convertKey(trimmed);

        if (cancelled) return;
        if (latestInputRef.current !== capturedInput) return;

        setConvertState({ status: 'done', result });
      } catch (err) {
        if (!cancelled && latestInputRef.current === capturedInput) {
          setConvertState({
            status: 'error',
            message: err instanceof Error ? err.message : '変換中にエラーが発生しました',
          });
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  // ファイル読み込み（テキスト / バイナリ両対応）
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const binaryExtensions = ['.der', '.cer'];
    const isBinary = binaryExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (isBinary) {
      // バイナリは Uint8Array として変換関数に渡すため Base64 化して入力欄に流し込む
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      setInput(btoa(binary));
    } else {
      const text = await file.text();
      setInput(text);
    }

    e.target.value = '';
  }, []);

  // 変換結果の取得
  const result = convertState.status === 'done' ? convertState.result : null;
  const hasResult = result && !result.error && result.pem;

  // ファイル名のプレフィックス（公開/秘密鍵）
  const filePrefix = result?.visibility === 'private' ? 'private_key' : 'public_key';

  return (
    <div className="space-y-6">
      {/* 入力エリア */}
      <div className="space-y-3">
        <InputField
          id="key-input"
          label="鍵を貼り付け"
          value={input}
          onChange={setInput}
          placeholder={
            '-----BEGIN PUBLIC KEY-----\nMIIBIjAN...\n-----END PUBLIC KEY-----\n\n（または DER の Base64、JWK JSON）'
          }
          hint="対応形式: PEM（PUBLIC KEY / PRIVATE KEY）/ DER（Base64）/ JWK（JSON）"
          multiline
          rows={7}
          mono
          resize
          headerRight={
            <>
              <button
                type="button"
                className="caption text-link-plain btn-link-plain"
                onClick={() => setInput(SAMPLE_RSA_PUBLIC_KEY)}
              >
                RSA 公開鍵を入力
              </button>
              <button
                type="button"
                className="caption text-link-plain btn-link-plain"
                onClick={() => setInput(SAMPLE_EC_PRIVATE_KEY)}
              >
                EC 秘密鍵を入力
              </button>
            </>
          }
        />
        {/* ファイル選択 */}
        <div className="flex flex-wrap items-center gap-3">
          <FileInputButton accept=".pem,.der,.cer,.key,.json,.jwk" onChange={handleFileChange}>
            ファイルを選択
          </FileInputButton>
          <span className="caption text-muted">.pem / .der / .cer / .key / .json / .jwk</span>
        </div>
      </div>

      {/* 読み込み中 */}
      {convertState.status === 'loading' && (
        <p className="caption text-muted" role="status" aria-live="polite">
          変換中...
        </p>
      )}

      {/* 入力エラー */}
      {convertState.status === 'error' && (
        <ErrorMessage message={convertState.message} variant="block" />
      )}

      {/* 変換結果 */}
      {/* 外側ラッパには live region を付けない。各 OutputField が自身の role="status"
          aria-live を持つため、ここで二重化すると変換成功時に SR が鍵材料全文を
          重複読み上げする恐れがある（live region のネスト回避）。 */}
      {convertState.status === 'done' && result && (
        <div className="space-y-4">
          {/* 鍵情報チップ */}
          {!result.error && result.visibility && (
            <div className="flex flex-wrap items-center gap-2">
              <ChipLabel tone={result.visibility === 'private' ? 'error' : 'info'}>
                {result.visibility === 'private' ? '秘密鍵' : '公開鍵'}
              </ChipLabel>
              {result.algorithm && <ChipLabel tone="neutral">{result.algorithm}</ChipLabel>}
              {result.algorithm === 'RSA' && result.keySizeBits && (
                <ChipLabel tone="neutral">{result.keySizeBits} bit</ChipLabel>
              )}
              {result.algorithm === 'EC' && result.namedCurve && (
                <ChipLabel tone="neutral">{result.namedCurve}</ChipLabel>
              )}
            </div>
          )}

          {/* 秘密鍵の場合: 非送信通知バナー */}
          {!result.error && result.visibility === 'private' && (
            <NotificationBanner variant="info" title="秘密鍵はブラウザ外に送信されません">
              このツールの全処理はブラウザ内で完結します。入力した秘密鍵データは外部サーバーに送信されません。
            </NotificationBanner>
          )}

          {/* 未対応形式バナー */}
          {result.error && result.unsupportedReason === 'legacy-pem' && (
            <NotificationBanner variant="warning" title="レガシー PEM 形式は v1 非対応です">
              {result.error}
            </NotificationBanner>
          )}
          {result.error && result.unsupportedReason === 'encrypted' && (
            <NotificationBanner variant="warning" title="暗号化秘密鍵は v1 非対応です">
              {result.error}
            </NotificationBanner>
          )}
          {result.error && result.unsupportedReason === 'unknown-algorithm' && (
            <NotificationBanner variant="warning" title="未対応のアルゴリズムです">
              {result.error}
            </NotificationBanner>
          )}

          {/* invalid-input / その他エラー */}
          {result.error &&
            result.unsupportedReason !== 'legacy-pem' &&
            result.unsupportedReason !== 'encrypted' &&
            result.unsupportedReason !== 'unknown-algorithm' && (
              <ErrorMessage message={result.error} variant="block" />
            )}

          {/* 出力フィールド */}
          {hasResult && (
            <div className="space-y-4">
              {/* PEM 出力 */}
              <OutputField
                id="key-output-pem"
                label="PEM"
                value={result.pem ?? ''}
                rows={8}
                rightSlot={
                  <DownloadButton
                    label="保存"
                    aria-label="PEMファイルをダウンロード"
                    onClick={() => downloadText(`${filePrefix}.pem`, result.pem ?? '')}
                  />
                }
              />

              {/* DER (Base64) 出力 */}
              <OutputField
                id="key-output-der"
                label="DER（Base64）"
                value={result.derBase64 ?? ''}
                rows={4}
                rightSlot={
                  result.derBytes ? (
                    <DownloadButton
                      label="保存"
                      aria-label="DERファイルをダウンロード"
                      onClick={() => downloadBinary(`${filePrefix}.der`, result.derBytes!)}
                    />
                  ) : undefined
                }
              />

              {/* JWK 出力 */}
              <OutputField
                id="key-output-jwk"
                label="JWK（JSON Web Key）"
                value={result.jwk ?? ''}
                rows={12}
                rightSlot={
                  <DownloadButton
                    label="保存"
                    aria-label="JWKファイルをダウンロード"
                    onClick={() => downloadText(`${filePrefix}.jwk`, result.jwk ?? '')}
                  />
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
