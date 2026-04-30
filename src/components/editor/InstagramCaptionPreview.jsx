function getProfileInitial(profileName) {
  const normalizedName = String(profileName ?? '').trim()

  return normalizedName ? normalizedName[0].toUpperCase() : 'K'
}

export function InstagramCaptionPreview({
  profileName = 'Kryopic',
  caption = '',
  isLoading = false,
}) {
  const normalizedProfileName = String(profileName ?? '').trim() || 'Kryopic'
  const normalizedCaption = String(caption ?? '').trim()
  const captionText = normalizedCaption || (
    isLoading
      ? 'Loading caption preview...'
      : 'Your generated caption will appear here.'
  )

  return (
    <section
      className={normalizedCaption
        ? 'canvas-caption-area instagram-caption-preview'
        : 'canvas-caption-area instagram-caption-preview instagram-caption-preview-empty'}
      aria-label="Instagram caption preview"
      aria-busy={isLoading && !normalizedCaption}
    >
      <div className="instagram-caption-avatar" aria-hidden="true">
        {getProfileInitial(normalizedProfileName)}
      </div>
      <p className="instagram-caption-copy">
        <strong>{normalizedProfileName}</strong>
        <span>{captionText}</span>
      </p>
    </section>
  )
}
