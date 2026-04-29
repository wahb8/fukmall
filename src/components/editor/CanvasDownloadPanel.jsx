import shareTabIcon from '../../assets/share.svg'

export function CanvasDownloadPanel({
  isDownloading = false,
  onDownload,
}) {
  return (
    <aside className="canvas-slide-panel canvas-slide-panel-bottom" aria-label="Canvas download tools">
      <span className="canvas-slide-tab" aria-label="Downloads">
        <img src={shareTabIcon} alt="" aria-hidden="true" />
      </span>
      <div className="canvas-slide-actions canvas-slide-actions-download">
        <button
          type="button"
          onClick={() => void onDownload?.('png')}
          disabled={isDownloading}
        >
          PNG
        </button>
        <button
          type="button"
          onClick={() => void onDownload?.('jpeg')}
          disabled={isDownloading}
        >
          JPG
        </button>
      </div>
    </aside>
  )
}
