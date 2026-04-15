export function AddLayerPanel({
  jsonInput,
  status,
  selectedLayerType,
  textFormValues,
  imageFormValues,
  fontFamilyOptions,
  onJsonInputChange,
  onApplyJson,
  onCreateFromJson,
  onSelectedLayerTypeChange,
  onTextFormChange,
  onImageFormChange,
  onCreateLayer,
}) {
  const showStatus = Boolean(status?.message)

  return (
    <section className="panel-card add-layer-panel">
      <div className="panel-header add-layer-panel-header">
        <div>
          <p className="eyebrow">Layers</p>
          <h2>Add Layer</h2>
        </div>
      </div>

      <div className="add-layer-panel-body">
        <label className="property-field full-width">
          <span>JSON</span>
          <textarea
            value={jsonInput}
            onChange={(event) => onJsonInputChange(event.target.value)}
            placeholder='{"texts":[{"text":"Hello"}],"images":[{"src":"https://example.com/image.png"}]}'
          />
        </label>

        <div className="inline-action-row full-width add-layer-json-actions">
          <button className="action-button" type="button" onClick={onApplyJson}>
            Apply JSON
          </button>
          <button className="action-button" type="button" onClick={onCreateFromJson}>
            Create From JSON
          </button>
        </div>

        {showStatus && (
          <div
            className={status.tone === 'error' ? 'group-note add-layer-status error' : 'group-note add-layer-status'}
            role={status.tone === 'error' ? 'alert' : 'status'}
          >
            {status.message}
          </div>
        )}

        <label className="property-field full-width">
          <span>Layer Type</span>
          <select
            value={selectedLayerType}
            onChange={(event) => onSelectedLayerTypeChange(event.target.value)}
          >
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </label>

        {selectedLayerType === 'text' ? (
          <div className="property-grid add-layer-form-grid">
            <label className="property-field full-width">
              <span>Text Content</span>
              <textarea
                value={textFormValues.text}
                onChange={(event) => onTextFormChange('text', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Color</span>
              <input
                type="color"
                value={textFormValues.color}
                onChange={(event) => onTextFormChange('color', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Font Family</span>
              <select
                value={textFormValues.font}
                onChange={(event) => onTextFormChange('font', event.target.value)}
              >
                {fontFamilyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="property-field">
              <span>Font Size</span>
              <input
                type="number"
                min="1"
                value={textFormValues.size}
                onChange={(event) => onTextFormChange('size', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Alignment</span>
              <select
                value={textFormValues.alignment}
                onChange={(event) => onTextFormChange('alignment', event.target.value)}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="property-field">
              <span>X</span>
              <input
                type="number"
                value={textFormValues.x}
                onChange={(event) => onTextFormChange('x', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Y</span>
              <input
                type="number"
                value={textFormValues.y}
                onChange={(event) => onTextFormChange('y', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Width</span>
              <input
                type="number"
                min="1"
                value={textFormValues.width}
                onChange={(event) => onTextFormChange('width', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Height</span>
              <input
                type="number"
                min="1"
                value={textFormValues.height}
                onChange={(event) => onTextFormChange('height', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Layer Placement</span>
              <input
                type="number"
                value={textFormValues.layerPlacement}
                onChange={(event) => onTextFormChange('layerPlacement', event.target.value)}
              />
            </label>
            <label className="property-field add-layer-toggle">
              <span>Bold</span>
              <input
                type="checkbox"
                checked={textFormValues.bolded}
                onChange={(event) => onTextFormChange('bolded', event.target.checked)}
              />
            </label>
            <label className="property-field add-layer-toggle">
              <span>Add Shadow</span>
              <input
                type="checkbox"
                checked={textFormValues.addShadow}
                onChange={(event) => onTextFormChange('addShadow', event.target.checked)}
              />
            </label>
          </div>
        ) : (
          <div className="property-grid add-layer-form-grid">
            <label className="property-field full-width">
              <span>Image Source</span>
              <textarea
                value={imageFormValues.src}
                onChange={(event) => onImageFormChange('src', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>X</span>
              <input
                type="number"
                value={imageFormValues.x}
                onChange={(event) => onImageFormChange('x', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Y</span>
              <input
                type="number"
                value={imageFormValues.y}
                onChange={(event) => onImageFormChange('y', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Width</span>
              <input
                type="number"
                min="1"
                value={imageFormValues.width}
                onChange={(event) => onImageFormChange('width', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Height</span>
              <input
                type="number"
                min="1"
                value={imageFormValues.height}
                onChange={(event) => onImageFormChange('height', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Opacity</span>
              <input
                type="number"
                step="0.01"
                value={imageFormValues.opacity}
                onChange={(event) => onImageFormChange('opacity', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Rotation</span>
              <input
                type="number"
                step="0.1"
                value={imageFormValues.rotation}
                onChange={(event) => onImageFormChange('rotation', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Scale X</span>
              <input
                type="number"
                step="0.01"
                value={imageFormValues.scaleX}
                onChange={(event) => onImageFormChange('scaleX', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Scale Y</span>
              <input
                type="number"
                step="0.01"
                value={imageFormValues.scaleY}
                onChange={(event) => onImageFormChange('scaleY', event.target.value)}
              />
            </label>
            <label className="property-field">
              <span>Layer Placement</span>
              <input
                type="number"
                value={imageFormValues.layerPlacement}
                onChange={(event) => onImageFormChange('layerPlacement', event.target.value)}
              />
            </label>
          </div>
        )}

        <button className="action-button full-width" type="button" onClick={onCreateLayer}>
          Create Layer
        </button>
      </div>
    </section>
  )
}
