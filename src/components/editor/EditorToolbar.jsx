import { getEditorIcons } from '../../editor/iconAssets'
import closeIcon from '../../assets/Close (X).svg'

function ToolButtons({ currentTool, icons, onActivateTool, onResetViewport }) {
  return (
    <div className="toolbar-tools">
      <div className="toolbar-tools-row">
        <button
          className={currentTool === 'select' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('select')}
          aria-label="Select"
        >
          <img className="button-icon" src={icons.pointer} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'pen' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('pen')}
          aria-label="Pen"
        >
          <img className="button-icon" src={icons.pen} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'eraser' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('eraser')}
          aria-label="Eraser"
        >
          <img className="button-icon" src={icons.eraser} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'zoom' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('zoom')}
          onDoubleClick={onResetViewport}
          aria-label="Zoom"
        >
          <img className="button-icon" src={icons.zoom} alt="" aria-hidden="true" />
        </button>
      </div>
      <div className="toolbar-tools-row">
        <button
          className={currentTool === 'bucket' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('bucket')}
          aria-label="Bucket Fill"
        >
          <img className="button-icon" src={icons.bucket} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'gradient' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('gradient')}
          aria-label="Gradient"
        >
          <img className="button-icon" src={icons.gradient} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'lasso' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('lasso')}
          aria-label="Lasso"
        >
          <img className="button-icon" src={icons.lasso} alt="" aria-hidden="true" />
        </button>
        <button
          className={currentTool === 'rectSelect' ? 'action-button active' : 'action-button'}
          type="button"
          onClick={() => onActivateTool('rectSelect')}
          aria-label="Rectangle Selection"
        >
          <img className="button-icon" src={icons.marquee} alt="" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function BrushControl({ activeBrushTool, penSize, eraserSize, onPenSizeChange, onEraserSizeChange }) {
  return (
    <label className="toolbar-range">
      <span>{activeBrushTool === 'pen' ? 'Brush' : 'Eraser'}</span>
      <input
        type="range"
        min={activeBrushTool === 'pen' ? '2' : '8'}
        max={activeBrushTool === 'pen' ? '120' : '96'}
        step="1"
        value={activeBrushTool === 'pen' ? penSize : eraserSize}
        onChange={(event) => {
          const nextValue = Number(event.target.value)

          if (activeBrushTool === 'pen') {
            onPenSizeChange(nextValue)
            return
          }

          onEraserSizeChange(nextValue)
        }}
      />
      <strong>{activeBrushTool === 'pen' ? penSize : eraserSize}</strong>
    </label>
  )
}

function ColorSwatchPanel({
  globalColors,
  onBackgroundChange,
  onForegroundChange,
  onSwapColors,
  onResetColors,
}) {
  return (
    <div className="color-swatch-panel" aria-label="Global colors">
      <div className="color-swatch-stack">
        <label
          className="color-swatch color-swatch-background"
          aria-label={`Background color ${globalColors.background}`}
          style={{ backgroundColor: globalColors.background }}
        >
          <input
            className="color-swatch-input"
            type="color"
            value={globalColors.background}
            onChange={onBackgroundChange}
            aria-label="Set background color"
          />
        </label>
        <label
          className="color-swatch color-swatch-foreground"
          aria-label={`Foreground color ${globalColors.foreground}`}
          style={{ backgroundColor: globalColors.foreground }}
        >
          <input
            className="color-swatch-input"
            type="color"
            value={globalColors.foreground}
            onChange={onForegroundChange}
            aria-label="Set foreground color"
          />
        </label>
      </div>
      <div className="color-swatch-actions">
        <button
          className="icon-button"
          type="button"
          onClick={onSwapColors}
          aria-label="Swap foreground and background colors"
        >
          Swap
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onResetColors}
          aria-label="Reset foreground and background colors"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

export function EditorToolbar({
  icons = getEditorIcons('light'),
  currentTool,
  activeBrushTool,
  penSize,
  eraserSize,
  bucketTolerance,
  gradientMode,
  hasFloatingSelection,
  hasActiveLassoSelection,
  hasActiveRectSelection,
  canUndo,
  canRedo,
  toolPanelError,
  globalColors,
  onActivateTool,
  onResetViewport,
  onPenSizeChange,
  onEraserSizeChange,
  onBucketToleranceChange,
  onGradientModeChange,
  onCommitFloatingSelectionToNewLayer,
  onUndo,
  onRedo,
  onAddText,
  onAddImage,
  onBackgroundChange,
  onForegroundChange,
  onSwapColors,
  onResetColors,
  onDismissToolPanelError,
}) {
  return (
    <header className="editor-topbar">
      <ToolButtons
        currentTool={currentTool}
        icons={icons}
        onActivateTool={onActivateTool}
        onResetViewport={onResetViewport}
      />
      {toolPanelError.isRendered && (
        <div
          className={`tool-panel-error${toolPanelError.isVisible ? ' visible' : ''}${toolPanelError.isFading ? ' fading' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="tool-panel-error-message">{toolPanelError.message}</span>
          <button
            className="tool-panel-error-dismiss"
            type="button"
            onClick={onDismissToolPanelError}
            aria-label="Dismiss status message"
          >
            <img src={closeIcon} alt="" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="toolbar-actions">
        {(currentTool === 'pen' || currentTool === 'eraser') && (
          <BrushControl
            activeBrushTool={activeBrushTool}
            penSize={penSize}
            eraserSize={eraserSize}
            onPenSizeChange={onPenSizeChange}
            onEraserSizeChange={onEraserSizeChange}
          />
        )}
        {currentTool === 'bucket' && (
          <label className="toolbar-range">
            <span>Tolerance</span>
            <input
              type="range"
              min="0"
              max="255"
              step="1"
              value={bucketTolerance}
              onChange={onBucketToleranceChange}
            />
            <strong>{bucketTolerance}</strong>
          </label>
        )}
        {currentTool === 'gradient' && (
          <label className="toolbar-range">
            <span>Mode</span>
            <select className="toolbar-select" value={gradientMode} onChange={onGradientModeChange}>
              <option value="bg-to-fg">BG -&gt; FG</option>
              <option value="fg-to-transparent">FG -&gt; Transparent</option>
            </select>
          </label>
        )}
        {(currentTool === 'lasso' || currentTool === 'rectSelect') && (
          <button
            className="action-button"
            type="button"
            disabled={!hasFloatingSelection && !hasActiveLassoSelection && !hasActiveRectSelection}
            onClick={onCommitFloatingSelectionToNewLayer}
          >
            Sel to Layer
          </button>
        )}
        <div className="history-widget" aria-label="History actions">
          <button
            className="icon-button history-widget-button"
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Undo"
          >
            <img className="button-icon" src={icons.undo} alt="" aria-hidden="true" />
          </button>
          <button
            className="icon-button history-widget-button"
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label="Redo"
          >
            <img className="button-icon" src={icons.redo} alt="" aria-hidden="true" />
          </button>
        </div>
        <button className="action-button" type="button" onClick={onAddText} aria-label="Add Text">
          <img className="button-icon" src={icons.addText} alt="" aria-hidden="true" />
        </button>
        <button className="action-button" type="button" onClick={onAddImage} aria-label="Add Image">
          <img className="button-icon" src={icons.addImage} alt="" aria-hidden="true" />
        </button>
        <ColorSwatchPanel
          globalColors={globalColors}
          onBackgroundChange={onBackgroundChange}
          onForegroundChange={onForegroundChange}
          onSwapColors={onSwapColors}
          onResetColors={onResetColors}
        />
      </div>
    </header>
  )
}
