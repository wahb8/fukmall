import { useState } from 'react'

export function AssetImage({
  src,
  ...props
}) {
  return <AssetImageInner key={src} src={src} {...props} />
}

export function AssetLoadingFrame({
  className = '',
  loadingLabel = 'Loading asset',
  decorative = false,
}) {
  return (
    <span
      className={['asset-load-frame', className].filter(Boolean).join(' ')}
      aria-busy="true"
    >
      <span
        className="asset-load-placeholder"
        role={decorative ? undefined : 'status'}
        aria-label={decorative ? undefined : loadingLabel}
        aria-hidden={decorative ? 'true' : undefined}
      >
        <span className="asset-load-spinner" aria-hidden="true" />
      </span>
    </span>
  )
}

function AssetImageInner({
  src,
  alt = '',
  className = '',
  nativeClassName = '',
  fit = 'cover',
  loadingLabel = 'Loading asset',
  onLoad,
  onError,
  ...imageProps
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const isDecorative = alt === '' || imageProps['aria-hidden'] === true || imageProps['aria-hidden'] === 'true'

  function handleLoad(event) {
    setIsLoaded(true)
    onLoad?.(event)
  }

  function handleError(event) {
    setIsLoaded(true)
    onError?.(event)
  }

  return (
    <span
      className={['asset-load-frame', isLoaded ? 'is-loaded' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-busy={!isLoaded}
      style={{ '--asset-load-fit': fit }}
    >
      {!isLoaded ? (
        <AssetLoadingFrame
          className="asset-load-placeholder-frame"
          loadingLabel={loadingLabel}
          decorative={isDecorative}
        />
      ) : null}
      <img
        className={['asset-load-native', nativeClassName].filter(Boolean).join(' ')}
        src={src}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        {...imageProps}
      />
    </span>
  )
}
