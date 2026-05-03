import { useEffect, useId, useRef } from 'react'
import addImageIcon from '../../assets/add image.svg'
import closeIcon from '../../assets/Close (X).svg'
import upIcon from '../../assets/up.svg'
import { AssetImage, AssetLoadingFrame } from '../ui/AssetImage'

export function PromptAttachmentTabs({
  attachments = [],
  disabled = false,
  isSubmitting = false,
  onRemoveAttachment,
  onAttachmentPreviewLoad,
  className = '',
}) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div
      className={['canvas-prompt-attachment-list', className].filter(Boolean).join(' ')}
      aria-label="Selected prompt attachments"
    >
      {attachments.map((attachment) => (
        <div key={attachment.id} className="canvas-prompt-attachment">
          <div className="canvas-prompt-attachment-track">
            {attachment.isLoading ? (
              <AssetLoadingFrame
                className="canvas-prompt-attachment-image canvas-prompt-attachment-loading"
                loadingLabel={`Loading ${attachment.original_file_name || 'attachment'}`}
              />
            ) : attachment.previewUrl ? (
              <AssetImage
                className="canvas-prompt-attachment-image"
                src={attachment.previewUrl}
                alt={attachment.original_file_name || 'Prompt attachment'}
                loadingLabel={`Loading ${attachment.original_file_name || 'attachment'}`}
                announceLoading
                onLoad={() => onAttachmentPreviewLoad?.(attachment.id)}
                onError={() => onAttachmentPreviewLoad?.(attachment.id)}
              />
            ) : (
              <span className="canvas-prompt-attachment-fallback" aria-hidden="true">
                IMG
              </span>
            )}
            <div className="canvas-prompt-attachment-details">
              <span className="canvas-prompt-attachment-name">
                {attachment.original_file_name || 'Attachment'}
              </span>
              <button
                className="canvas-prompt-attachment-remove"
                type="button"
                disabled={disabled || isSubmitting || attachment.isLoading || attachment.isPreviewLoading}
                onClick={() => onRemoveAttachment?.(attachment.id)}
                aria-label={`Remove ${attachment.original_file_name || 'attachment'}`}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function PromptShell({
  value = '',
  attachments = [],
  showAttachments = true,
  disabled = false,
  isAttachmentPickerDisabled = false,
  isSubmitting = false,
  isUploadingAttachments = false,
  statusMessage = '',
  statusTone = 'info',
  onChange,
  onSubmit,
  onStop,
  onFilesSelected,
  onRemoveAttachment,
  onAttachmentPreviewLoad,
}) {
  const inputId = useId()
  const fileInputRef = useRef(null)
  const promptInputRef = useRef(null)

  useEffect(() => {
    const promptInput = promptInputRef.current

    if (!promptInput) {
      return
    }

    promptInput.style.height = 'auto'
    promptInput.style.height = `${promptInput.scrollHeight}px`
  }, [value])

  function handleSubmit() {
    if (isSubmitting) {
      onStop?.()
      return
    }

    if (disabled || isUploadingAttachments) {
      return
    }

    onSubmit?.()
  }

  const submitButtonLabel = isSubmitting ? 'Stop generating' : 'Submit prompt'

  return (
    <div className="canvas-prompt-stack">
      {showAttachments ? (
        <PromptAttachmentTabs
          attachments={attachments}
          disabled={disabled}
          isSubmitting={isSubmitting}
          onRemoveAttachment={onRemoveAttachment}
          onAttachmentPreviewLoad={onAttachmentPreviewLoad}
        />
      ) : null}

      <div className="canvas-prompt-shell">
        <input
          ref={fileInputRef}
          id={inputId}
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? [])

            if (selectedFiles.length > 0) {
              onFilesSelected?.(selectedFiles)
            }

            event.target.value = ''
          }}
        />
        <button
          className="canvas-prompt-button canvas-prompt-button-left"
          type="button"
          aria-label="Add image"
          disabled={disabled || isAttachmentPickerDisabled || isSubmitting || isUploadingAttachments}
          onClick={() => fileInputRef.current?.click()}
        >
          <img src={addImageIcon} alt="" aria-hidden="true" />
        </button>
        <textarea
          ref={promptInputRef}
          className="canvas-prompt-input"
          value={value}
          disabled={disabled || isSubmitting}
          placeholder="Describe what you want to create..."
          rows={1}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          className="canvas-prompt-button canvas-prompt-button-right"
          type="button"
          aria-label={submitButtonLabel}
          title={submitButtonLabel}
          disabled={(disabled || isUploadingAttachments) && !isSubmitting}
          onClick={handleSubmit}
        >
          <img src={isSubmitting ? closeIcon : upIcon} alt="" aria-hidden="true" />
        </button>
      </div>

      {statusMessage ? (
        <p
          className={statusTone === 'error'
            ? 'canvas-prompt-status canvas-prompt-status-error'
            : 'canvas-prompt-status'}
          role={statusTone === 'error' ? 'alert' : 'status'}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  )
}
