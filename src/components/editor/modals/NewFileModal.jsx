import portraitPresetImage from '../../../assets/Portrait.png'
import squarePresetImage from '../../../assets/square.png'
import storiesPresetImage from '../../../assets/Stories.png'

const NEW_FILE_PRESETS = [
  {
    key: 'square',
    label: 'Square',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    imageSrc: squarePresetImage,
  },
  {
    key: 'portrait',
    label: 'Portrait',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    imageSrc: portraitPresetImage,
  },
  {
    key: 'stories',
    label: 'Stories',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    imageSrc: storiesPresetImage,
  },
]

function getSelectedPreset(width, height) {
  const normalizedWidth = Number(width)
  const normalizedHeight = Number(height)

  return NEW_FILE_PRESETS.find((preset) => (
    preset.width === normalizedWidth && preset.height === normalizedHeight
  )) ?? null
}

export function NewFileModal({
  isOpen,
  name,
  width,
  height,
  minDimension,
  onPresetSelect,
  onClose,
  onNameChange,
  onWidthChange,
  onHeightChange,
  onCreate,
}) {
  if (!isOpen) {
    return null
  }

  const selectedPreset = getSelectedPreset(width, height)

  return (
    <div className="modal-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className="modal-card new-file-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="New file dimensions"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">New File</p>
            <h2>Post Size</h2>
          </div>
        </div>
        <div className="new-file-presets" aria-label="Post size presets">
          {NEW_FILE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              className={selectedPreset?.key === preset.key
                ? 'new-file-preset-card active'
                : 'new-file-preset-card'}
              type="button"
              aria-label={`${preset.label} ${preset.ratio} ${preset.width} x ${preset.height}`}
              aria-pressed={selectedPreset?.key === preset.key}
              onClick={() => onPresetSelect?.(preset)}
            >
              <span className="new-file-preset-icon-shell" aria-hidden="true">
                <img
                  className={preset.key === 'portrait'
                    ? 'new-file-preset-icon new-file-preset-icon-portrait'
                    : 'new-file-preset-icon'}
                  src={preset.imageSrc}
                  alt=""
                />
              </span>
              <span className="new-file-preset-copy">
                <span className="new-file-preset-label">{preset.label}</span>
                <span className="new-file-preset-ratio">{preset.ratio}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="modal-body">
          <label className="property-field full-width">
            <span>Name</span>
            <input type="text" value={name} onChange={onNameChange} />
          </label>
          <label className="property-field">
            <span>Width</span>
            <input type="number" min={minDimension} step="1" value={width} onChange={onWidthChange} />
          </label>
          <label className="property-field">
            <span>Height</span>
            <input type="number" min={minDimension} step="1" value={height} onChange={onHeightChange} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="action-button active" type="button" onClick={onCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
