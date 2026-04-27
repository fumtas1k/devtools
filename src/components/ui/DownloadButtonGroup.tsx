import { DownloadButton } from './DownloadButton';

interface Props {
  onDownloadSvg: () => void;
  onDownloadPng?: () => void;
}

export function DownloadButtonGroup({ onDownloadSvg, onDownloadPng }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-2 w-full">
      <DownloadButton onClick={onDownloadSvg} label="SVGダウンロード" variant="secondary" />
      {onDownloadPng && (
        <DownloadButton onClick={onDownloadPng} label="PNGダウンロード" variant="primary" />
      )}
    </div>
  );
}
