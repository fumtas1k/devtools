import { caption, colors } from '@/utils/styles';

interface Props {
  onDownloadSvg: () => void;
  onDownloadPng?: () => void;
}

export function DownloadButtonGroup({ onDownloadSvg, onDownloadPng }: Props) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onDownloadSvg}
        className="rounded px-4 py-2 transition-colors hover:bg-blue-50"
        style={{
          ...caption,
          fontWeight: 700,
          border: `1px solid ${colors.primary}`,
          color: colors.primary,
        }}
      >
        SVGダウンロード
      </button>
      {onDownloadPng && (
        <button
          onClick={onDownloadPng}
          className="rounded px-4 py-2 text-white transition-colors hover:opacity-90"
          style={{
            ...caption,
            fontWeight: 700,
            background: colors.primary,
          }}
        >
          PNGダウンロード
        </button>
      )}
    </div>
  );
}
