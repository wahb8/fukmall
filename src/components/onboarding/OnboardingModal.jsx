import { useEffect, useRef, useState } from 'react'
import './OnboardingModal.css'

const BUSINESS_TYPES = [
  'Restaurant',
  'Cafe',
  'Clothing',
  'E-commerce',
  'Startup',
  'Other',
]

const UPLOAD_SLOT_COUNT = 5

function createEmptyUploadSlots() {
  return Array.from({ length: UPLOAD_SLOT_COUNT }, () => null)
}

function revokeObjectUrl(url) {
  if (
    typeof url === 'string' &&
    url.length > 0 &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(url)
  }
}

function isAcceptedImageFile(file) {
  if (!file) {
    return false
  }

  if (typeof file.type === 'string' && file.type.toLowerCase().startsWith('image/')) {
    return true
  }

  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(String(file.name ?? ''))
}

export function OnboardingModal({
  isOpen,
  onClose,
  onComplete,
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedBusinessType, setSelectedBusinessType] = useState('')
  const [uploadedImages, setUploadedImages] = useState(createEmptyUploadSlots)
  const uploadedImagesRef = useRef(uploadedImages)
  const uploadInputRefs = useRef([])
  const pendingUploadSlotIndexRef = useRef(null)

  useEffect(() => {
    uploadedImagesRef.current = uploadedImages
  }, [uploadedImages])

  useEffect(() => () => {
    uploadedImagesRef.current.forEach((slot) => revokeObjectUrl(slot?.previewUrl))
  }, [])

  if (!isOpen) {
    return null
  }

  const uploadedImageCount = uploadedImages.filter(Boolean).length
  const canContinueFromBusinessType = selectedBusinessType.length > 0
  const canContinueFromUploads = uploadedImageCount === UPLOAD_SLOT_COUNT

  function openUploadPicker(index) {
    pendingUploadSlotIndexRef.current = index
    uploadInputRefs.current[index]?.click()
  }

  function handleUploadChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []).filter(isAcceptedImageFile)
    const targetSlotIndex = pendingUploadSlotIndexRef.current
    pendingUploadSlotIndexRef.current = null
    event.target.value = ''

    if (selectedFiles.length === 0) {
      return
    }

    setUploadedImages((currentImages) => {
      if (
        Number.isInteger(targetSlotIndex) &&
        targetSlotIndex >= 0 &&
        targetSlotIndex < currentImages.length &&
        currentImages[targetSlotIndex]
      ) {
        const nextImages = [...currentImages]
        revokeObjectUrl(currentImages[targetSlotIndex]?.previewUrl)
        nextImages[targetSlotIndex] = {
          fileName: selectedFiles[0].name,
          previewUrl: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(selectedFiles[0])
            : '',
        }
        return nextImages
      }

      const emptySlotIndexes = []

      currentImages.forEach((slot, index) => {
        if (!slot) {
          emptySlotIndexes.push(index)
        }
      })

      if (emptySlotIndexes.length === 0) {
        return currentImages
      }

      const nextImages = [...currentImages]
      const filesToUse = selectedFiles.slice(0, emptySlotIndexes.length)

      filesToUse.forEach((file, fileIndex) => {
        const targetIndex = emptySlotIndexes[fileIndex]
        const previewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : ''

        nextImages[targetIndex] = {
          fileName: file.name,
          previewUrl,
        }
      })

      return nextImages
    })
  }

  function handleStartCreating() {
    onComplete?.()
  }

  return (
    <div className="modal-backdrop onboarding-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className="modal-card onboarding-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Business onboarding"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="onboarding-modal-shell">
          {currentPage !== 3 ? (
            <>
              <header className="onboarding-header">
                <div className="onboarding-step-meta">
                  <span>{`Step ${currentPage} of 3`}</span>
                  <span>{selectedBusinessType || 'Brand setup'}</span>
                </div>
              </header>

              <div className="onboarding-progress" aria-hidden="true">
                {[1, 2, 3].map((step) => (
                  <span
                    key={step}
                    className={step <= currentPage
                      ? 'onboarding-progress-segment active'
                      : 'onboarding-progress-segment'}
                  />
                ))}
              </div>
            </>
          ) : null}

          {currentPage === 1 ? (
            <section className="onboarding-panel">
              <div className="onboarding-page-copy">
                <h2 className="onboarding-page-title">
                  What kind of business do you have?
                </h2>
              </div>

              <div className="onboarding-business-grid">
                {BUSINESS_TYPES.map((option) => {
                  const isSelected = option === selectedBusinessType

                  return (
                    <button
                      key={option}
                      className={isSelected
                        ? 'onboarding-business-card active'
                        : 'onboarding-business-card'}
                      type="button"
                      aria-label={option}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedBusinessType(option)}
                    >
                      <strong>{option}</strong>
                    </button>
                  )
                })}
              </div>

              <footer className="onboarding-footer onboarding-footer-end">
                <button
                  className="action-button onboarding-action-button onboarding-action-button-primary"
                  type="button"
                  disabled={!canContinueFromBusinessType}
                  onClick={() => setCurrentPage(2)}
                >
                  Next
                </button>
              </footer>
            </section>
          ) : null}

          {currentPage === 2 ? (
            <section className="onboarding-panel">
              <div className="onboarding-page-copy">
                <h2 className="onboarding-page-title onboarding-page-title-wide">
                  Share some examples of posts of your business to personalize your experience.
                </h2>
              </div>

              <div className="onboarding-upload-grid">
                {uploadedImages.map((slot, index) => (
                  <div className="onboarding-upload-slot-shell" key={`upload-slot-${index + 1}`}>
                    <input
                      ref={(node) => {
                        uploadInputRefs.current[index] = node
                      }}
                      className="onboarding-upload-input"
                      type="file"
                      accept="image/*"
                      multiple
                      aria-label={`Upload image ${index + 1}`}
                      onChange={handleUploadChange}
                    />
                    <button
                      className={slot
                        ? 'onboarding-upload-slot has-image'
                        : 'onboarding-upload-slot'}
                      type="button"
                      onClick={() => openUploadPicker(index)}
                      aria-label={slot
                        ? `Add more images from slot ${index + 1}`
                        : `Select image ${index + 1}`}
                    >
                      <span className="onboarding-upload-slot-index">{`0${index + 1}`}</span>

                      {slot ? (
                        <img
                          className="onboarding-upload-preview"
                          src={slot.previewUrl}
                          alt={`Uploaded image ${index + 1} preview`}
                        />
                      ) : (
                        <span className="onboarding-upload-plus" aria-hidden="true">
                          +
                        </span>
                      )}

                      <span className="onboarding-upload-slot-copy">
                        <strong>{slot ? 'Added image' : 'Upload image'}</strong>
                        <span>{slot?.fileName || `Slot ${index + 1}`}</span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>

              <footer className="onboarding-footer onboarding-footer-end">
                <div className="onboarding-action-group">
                  <button
                    className="action-button onboarding-action-button"
                    type="button"
                    onClick={() => setCurrentPage(3)}
                  >
                    I am a new business
                  </button>
                  <button
                    className="action-button onboarding-action-button onboarding-action-button-primary"
                    type="button"
                    disabled={!canContinueFromUploads}
                    onClick={() => setCurrentPage(3)}
                  >
                    Next
                  </button>
                </div>
              </footer>
            </section>
          ) : null}

          {currentPage === 3 ? (
            <section className="onboarding-panel onboarding-panel-video">
              <div className="onboarding-video-layout onboarding-video-layout-single">
                <div
                  className="onboarding-video-placeholder"
                  role="img"
                  aria-label="Future onboarding video placeholder"
                >
                  <div className="onboarding-video-placeholder-core">
                    <span className="onboarding-video-play" aria-hidden="true">
                      &#9654;
                    </span>
                    <strong>Informative video placeholder</strong>
                  </div>
                </div>
              </div>

              <footer className="onboarding-footer onboarding-footer-end">
                <button
                  className="action-button onboarding-action-button onboarding-action-button-primary"
                  type="button"
                  onClick={handleStartCreating}
                >
                  Start Creating!
                </button>
              </footer>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
