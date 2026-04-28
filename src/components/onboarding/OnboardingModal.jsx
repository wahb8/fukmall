import { useEffect, useMemo, useRef, useState } from 'react'
import cafeImage from '../../assets/cafe.png'
import clothingImage from '../../assets/clothing.png'
import ecommerceImage from '../../assets/e-commerce.png'
import otherImage from '../../assets/other.png'
import restaurantImage from '../../assets/resturant.png'
import startupImage from '../../assets/startup.png'
import {
  BRAND_COLOR_SLOT_COUNT,
  BUSINESS_TYPE_OPTIONS,
  CAPTION_TONE_OPTIONS,
  REFERENCE_SLOT_COUNT,
} from '../../lib/businessProfileOptions'
import './OnboardingModal.css'

const BUSINESS_TYPE_IMAGES = {
  Restaurant: restaurantImage,
  Cafe: cafeImage,
  Gym: otherImage,
  Salon: otherImage,
  Clothing: clothingImage,
  'E-Commerce Shop': ecommerceImage,
  Startup: startupImage,
  Other: otherImage,
}

const BUSINESS_TYPES = BUSINESS_TYPE_OPTIONS.map((name) => ({
  name,
  imageSrc: BUSINESS_TYPE_IMAGES[name] ?? otherImage,
}))

const EMPTY_BRAND_COLOR_VALUES = Array.from({ length: BRAND_COLOR_SLOT_COUNT }, () => '')

function createEmptyReferenceSlots() {
  return Array.from({ length: REFERENCE_SLOT_COUNT }, () => null)
}

function normalizeHexColor(value) {
  const trimmedValue = value.trim().toUpperCase()

  if (!trimmedValue) {
    return ''
  }

  return trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`
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

function createPreviewEntry(file) {
  return {
    file,
    fileName: file.name,
    previewUrl: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : '',
  }
}

export function OnboardingModal({
  isOpen,
  canClose = true,
  onClose,
  onComplete,
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedBusinessType, setSelectedBusinessType] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [logoFileEntry, setLogoFileEntry] = useState(null)
  const [referenceImages, setReferenceImages] = useState(createEmptyReferenceSlots)
  const [selectedTone, setSelectedTone] = useState('')
  const [brandColors, setBrandColors] = useState(EMPTY_BRAND_COLOR_VALUES)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const referenceImagesRef = useRef(referenceImages)
  const logoFileEntryRef = useRef(logoFileEntry)
  const logoInputRef = useRef(null)
  const uploadInputRefs = useRef([])
  const pendingReferenceSlotIndexRef = useRef(null)

  useEffect(() => {
    referenceImagesRef.current = referenceImages
  }, [referenceImages])

  useEffect(() => {
    logoFileEntryRef.current = logoFileEntry
  }, [logoFileEntry])

  useEffect(() => () => {
    referenceImagesRef.current.forEach((slot) => revokeObjectUrl(slot?.previewUrl))
    revokeObjectUrl(logoFileEntryRef.current?.previewUrl)
  }, [])

  const uploadedReferenceCount = useMemo(
    () => referenceImages.filter(Boolean).length,
    [referenceImages],
  )

  const canContinueFromBusinessType = selectedBusinessType.length > 0 && businessName.trim().length > 0
  const canFinishOnboarding = canContinueFromBusinessType && selectedTone.length > 0

  if (!isOpen) {
    return null
  }

  function safeClose() {
    if (!canClose || isSubmitting) {
      return
    }

    onClose?.()
  }

  function openReferenceUploadPicker(index) {
    pendingReferenceSlotIndexRef.current = index
    uploadInputRefs.current[index]?.click()
  }

  function handleLogoChange(event) {
    const selectedFile = Array.from(event.target.files ?? []).find(isAcceptedImageFile) ?? null
    event.target.value = ''

    if (!selectedFile) {
      return
    }

    setLogoFileEntry((currentLogoFileEntry) => {
      revokeObjectUrl(currentLogoFileEntry?.previewUrl)
      return createPreviewEntry(selectedFile)
    })
  }

  function handleReferenceUploadChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []).filter(isAcceptedImageFile)
    const targetSlotIndex = pendingReferenceSlotIndexRef.current
    pendingReferenceSlotIndexRef.current = null
    event.target.value = ''

    if (selectedFiles.length === 0) {
      return
    }

    setReferenceImages((currentImages) => {
      if (
        Number.isInteger(targetSlotIndex) &&
        targetSlotIndex >= 0 &&
        targetSlotIndex < currentImages.length &&
        currentImages[targetSlotIndex]
      ) {
        const nextImages = [...currentImages]
        revokeObjectUrl(currentImages[targetSlotIndex]?.previewUrl)
        nextImages[targetSlotIndex] = createPreviewEntry(selectedFiles[0])
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
        nextImages[targetIndex] = createPreviewEntry(file)
      })

      return nextImages
    })
  }

  function updateBrandColor(index, nextValue) {
    setBrandColors((currentValues) => {
      const nextValues = [...currentValues]
      nextValues[index] = nextValue
      return nextValues
    })
  }

  async function handleStartCreating() {
    if (!canFinishOnboarding || isSubmitting) {
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await onComplete?.({
        name: businessName.trim(),
        businessType: selectedBusinessType,
        tonePreference: selectedTone,
        brandColors: brandColors
          .map((value) => normalizeHexColor(value))
          .filter(Boolean),
        logoFile: logoFileEntry?.file ?? null,
        referenceFiles: referenceImages
          .filter(Boolean)
          .map((slot) => slot.file),
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to finish onboarding.')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
  }

  return (
    <div
      className="modal-backdrop onboarding-backdrop"
      onPointerDown={safeClose}
      role="presentation"
    >
      <div
        className="modal-card onboarding-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Business onboarding"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="onboarding-modal-shell">
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

          {currentPage === 1 ? (
            <section className="onboarding-panel">
              <div className="onboarding-page-copy">
                <h2 className="onboarding-page-title">
                  Tell us about your business.
                </h2>
                <p className="onboarding-page-description">
                  We use this to shape the brand context behind your generated posts.
                </p>
              </div>

              <label className="property-field onboarding-input-field">
                <span>Business name</span>
                <input
                  type="text"
                  aria-label="Business name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder="Moonline Cafe"
                />
              </label>

              <div className="onboarding-business-grid">
                {BUSINESS_TYPES.map((option) => {
                  const isSelected = option.name === selectedBusinessType

                  return (
                    <button
                      key={option.name}
                      className={isSelected
                        ? 'onboarding-business-card active'
                        : 'onboarding-business-card'}
                      type="button"
                      aria-label={option.name}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedBusinessType(option.name)}
                    >
                      <img
                        className="onboarding-business-card-image"
                        src={option.imageSrc}
                        alt=""
                        aria-hidden="true"
                      />
                      <strong>{option.name}</strong>
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
                  Add your logo and a few example posts.
                </h2>
                <p className="onboarding-page-description">
                  Reference images help the app learn your visual direction. You can skip them for now.
                </p>
              </div>

              <div className="onboarding-upload-stack">
                <div className="onboarding-logo-shell">
                  <input
                    ref={logoInputRef}
                    className="onboarding-upload-input"
                    type="file"
                    accept="image/*"
                    aria-label="Upload logo"
                    onChange={handleLogoChange}
                  />
                  <button
                    className={logoFileEntry
                      ? 'onboarding-logo-slot has-image'
                      : 'onboarding-logo-slot'}
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    aria-label={logoFileEntry ? 'Replace logo' : 'Upload logo'}
                  >
                    {logoFileEntry ? (
                      <img
                        className="onboarding-logo-preview"
                        src={logoFileEntry.previewUrl}
                        alt="Uploaded logo preview"
                      />
                    ) : (
                      <span className="onboarding-upload-plus" aria-hidden="true">
                        +
                      </span>
                    )}
                    <span className="onboarding-logo-copy">
                      <strong>{logoFileEntry ? 'Logo added' : 'Upload your logo'}</strong>
                      <span>{logoFileEntry?.fileName || 'PNG, JPG, WEBP, GIF, or SVG'}</span>
                    </span>
                  </button>
                </div>

                <div className="onboarding-upload-grid">
                  {referenceImages.map((slot, index) => (
                    <div className="onboarding-upload-slot-shell" key={`upload-slot-${index + 1}`}>
                      <input
                        ref={(node) => {
                          uploadInputRefs.current[index] = node
                        }}
                        className="onboarding-upload-input"
                        type="file"
                        accept="image/*"
                        multiple
                        aria-label={`Upload reference image ${index + 1}`}
                        onChange={handleReferenceUploadChange}
                      />
                      <button
                        className={slot
                          ? 'onboarding-upload-slot has-image'
                          : 'onboarding-upload-slot'}
                        type="button"
                        onClick={() => openReferenceUploadPicker(index)}
                        aria-label={slot
                          ? `Replace reference image ${index + 1}`
                          : `Select reference image ${index + 1}`}
                      >
                        <span className="onboarding-upload-slot-index">{`0${index + 1}`}</span>

                        {slot ? (
                          <img
                            className="onboarding-upload-preview"
                            src={slot.previewUrl}
                            alt={`Uploaded reference image ${index + 1} preview`}
                          />
                        ) : (
                          <span className="onboarding-upload-plus" aria-hidden="true">
                            +
                          </span>
                        )}

                        <span className="onboarding-upload-slot-copy">
                          <strong>{slot ? 'Added reference' : 'Upload image'}</strong>
                          <span>{slot?.fileName || `Slot ${index + 1}`}</span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <footer className="onboarding-footer onboarding-footer-between">
                <button
                  className="action-button onboarding-action-button"
                  type="button"
                  onClick={() => setCurrentPage(1)}
                >
                  Back
                </button>

                <div className="onboarding-action-group">
                  <button
                    className="action-button onboarding-action-button"
                    type="button"
                    onClick={() => setCurrentPage(3)}
                  >
                    Skip for now
                  </button>
                  <button
                    className="action-button onboarding-action-button onboarding-action-button-primary"
                    type="button"
                    onClick={() => setCurrentPage(3)}
                  >
                    Next
                  </button>
                </div>
              </footer>
            </section>
          ) : null}

          {currentPage === 3 ? (
            <section className="onboarding-panel">
              <div className="onboarding-page-copy">
                <h2 className="onboarding-page-title onboarding-page-title-wide">
                  Choose your caption tone and brand colors.
                </h2>
                <p className="onboarding-page-description">
                  This becomes the starting point for how captions and visual accents are generated.
                </p>
              </div>

              <div className="onboarding-detail-grid">
                <section className="onboarding-detail-card">
                  <div className="onboarding-detail-copy">
                    <strong>Preferred caption tone</strong>
                    <span>Pick the tone that feels closest to your brand voice.</span>
                  </div>

                  <div className="onboarding-tone-grid">
                    {CAPTION_TONE_OPTIONS.map((tone) => {
                      const isSelected = tone === selectedTone

                      return (
                        <button
                          key={tone}
                          className={isSelected
                            ? 'onboarding-tone-chip active'
                            : 'onboarding-tone-chip'}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedTone(tone)}
                        >
                          {tone}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="onboarding-detail-card">
                  <div className="onboarding-detail-copy">
                    <strong>Brand colors</strong>
                    <span>Optional. Add up to four hex colors to steer accents and styling.</span>
                  </div>

                  <div className="onboarding-color-grid">
                    {brandColors.map((value, index) => (
                      <label key={`brand-color-${index + 1}`} className="property-field onboarding-input-field">
                        <span>{`Color ${index + 1}`}</span>
                        <input
                          type="text"
                          aria-label={`Brand color ${index + 1}`}
                          value={value}
                          onChange={(event) => updateBrandColor(index, event.target.value)}
                          placeholder="#D97706"
                        />
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              {errorMessage ? (
                <p className="onboarding-status-message onboarding-status-message-error" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <footer className="onboarding-footer onboarding-footer-between">
                <button
                  className="action-button onboarding-action-button"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setCurrentPage(2)}
                >
                  Back
                </button>

                <button
                  className="action-button onboarding-action-button onboarding-action-button-primary"
                  type="button"
                  disabled={!canFinishOnboarding || isSubmitting}
                  onClick={handleStartCreating}
                >
                  {isSubmitting ? 'Saving...' : 'Start Creating!'}
                </button>
              </footer>
            </section>
          ) : null}

          {uploadedReferenceCount > 0 && currentPage === 2 ? (
            <p className="onboarding-status-message" role="status">
              {`${uploadedReferenceCount} reference ${uploadedReferenceCount === 1 ? 'image' : 'images'} selected`}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
