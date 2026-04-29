import { useEffect, useId, useRef } from 'react'
import addImageIcon from '../../assets/add image.svg'
import upIcon from '../../assets/up.svg'

export function PromptShell({
  value = '',
  attachments = [],
  disabled = false,
  isSubmitting = false,
  isUploadingAttachments = false,
  statusMessage = '',
  statusTone = 'info',
  onChange,
  onSubmit,
  onFilesSelected,
  onRemoveAttachment,
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
    if (disabled || isSubmitting) {
      return
    }

    onSubmit?.()
  }

  return (
    <div className="canvas-prompt-stack">
      {attachments.length > 0 ? (
        <div className="canvas-prompt-attachment-list" aria-label="Selected prompt attachments">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="canvas-prompt-attachment">
              {attachment.previewUrl ? (
                <img
                  className="canvas-prompt-attachment-image"
                  src={attachment.previewUrl}
                  alt={attachment.original_file_name || 'Prompt attachment'}
                />
              ) : (
                <span className="canvas-prompt-attachment-fallback" aria-hidden="true">
                  IMG
                </span>
              )}
              <span className="canvas-prompt-attachment-name">
                {attachment.original_file_name || 'Attachment'}
              </span>
              <button
                className="canvas-prompt-attachment-remove"
                type="button"
                disabled={disabled || isSubmitting}
                onClick={() => onRemoveAttachment?.(attachment.id)}
                aria-label={`Remove ${attachment.original_file_name || 'attachment'}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
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
          disabled={disabled || isUploadingAttachments}
          onClick={() => fileInputRef.current?.click()}
        >
          <img src={addImageIcon} alt="" aria-hidden="true" />
        </button>
        <textarea
          ref={promptInputRef}
          className="canvas-prompt-input"
          value={value}
          disabled={disabled}
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
          aria-label="Submit prompt"
          disabled={disabled || isSubmitting}
          onClick={handleSubmit}
        >
          <img src={upIcon} alt="" aria-hidden="true" />
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
