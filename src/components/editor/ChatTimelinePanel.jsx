import { AssetImage } from '../ui/AssetImage'

function renderAttachmentPreview(attachment) {
  return (
    <li key={attachment.id} className="chat-timeline-attachment">
      {attachment.previewUrl ? (
        <AssetImage
          className="chat-timeline-attachment-image"
          src={attachment.previewUrl}
          alt={attachment.original_file_name || 'Prompt attachment'}
        />
      ) : (
        <span className="chat-timeline-attachment-fallback" aria-hidden="true">
          IMG
        </span>
      )}
    </li>
  )
}

function renderMessageEntry(entry) {
  const roleLabel = entry.role === 'assistant'
    ? 'Assistant'
    : entry.role === 'system'
      ? 'System'
      : 'You'

  return (
    <article
      key={entry.id}
      className={entry.role === 'user'
        ? 'chat-timeline-entry chat-timeline-entry-user'
        : 'chat-timeline-entry'}
    >
      <span className="chat-timeline-role">{roleLabel}</span>
      {entry.text ? (
        <p className="chat-timeline-text">{entry.text}</p>
      ) : null}
      {entry.attachments?.length ? (
        <ul className="chat-timeline-attachments">
          {entry.attachments.map(renderAttachmentPreview)}
        </ul>
      ) : null}
    </article>
  )
}

function renderGeneratedPostEntry(entry) {
  return (
    <article key={entry.id} className="chat-timeline-entry chat-timeline-entry-generated">
      <span className="chat-timeline-role">Generated result</span>
      <div className="chat-timeline-generated-card">
        {entry.previewUrl ? (
          <AssetImage
            className="chat-timeline-generated-image"
            src={entry.previewUrl}
            alt="Generated post preview"
          />
        ) : (
          <div className="chat-timeline-generated-fallback" aria-hidden="true">
            Post
          </div>
        )}
        <div className="chat-timeline-generated-copy">
          {entry.captionText ? (
            <p className="chat-timeline-text">{entry.captionText}</p>
          ) : (
            <p className="chat-timeline-text chat-timeline-text-muted">
              Saved generated image result
            </p>
          )}
          {entry.detail ? (
            <span className="chat-timeline-generated-detail">{entry.detail}</span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function ChatTimelinePanel({
  entries = [],
  isLoading = false,
  title = 'Conversation',
  emptyMessage = 'Start with a prompt to create a new chat history.',
  statusMessage = '',
  statusTone = 'info',
  className = '',
}) {
  return (
    <section
      className={['canvas-caption-area chat-timeline-panel', className].filter(Boolean).join(' ')}
      aria-label={title}
    >
      <div className="chat-timeline-header">
        <strong>{title}</strong>
      </div>

      {statusMessage ? (
        <p
          className={statusTone === 'error'
            ? 'chat-timeline-status chat-timeline-status-error'
            : 'chat-timeline-status'}
          role={statusTone === 'error' ? 'alert' : 'status'}
        >
          {statusMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="chat-timeline-empty" role="status">Loading chat...</p>
      ) : entries.length === 0 ? (
        <p className="chat-timeline-empty">{emptyMessage}</p>
      ) : (
        <div className="chat-timeline-list">
          {entries.map((entry) => (
            entry.kind === 'generated_post'
              ? renderGeneratedPostEntry(entry)
              : renderMessageEntry(entry)
          ))}
        </div>
      )}
    </section>
  )
}
