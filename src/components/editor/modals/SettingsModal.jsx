import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BRAND_COLOR_SLOT_COUNT,
  BUSINESS_TYPE_OPTIONS,
  CAPTION_TONE_OPTIONS,
  REFERENCE_SLOT_COUNT,
} from '../../../lib/businessProfileOptions'
import { fetchDefaultBusinessProfile, saveBusinessProfile } from '../../../lib/onboarding'
import { AssetImage } from '../../ui/AssetImage'

function createEmptyBrandColorValues() {
  return Array.from({ length: BRAND_COLOR_SLOT_COUNT }, () => '')
}

function fillBrandColorSlots(colors) {
  const nextValues = createEmptyBrandColorValues()

  ;(Array.isArray(colors) ? colors : []).slice(0, BRAND_COLOR_SLOT_COUNT).forEach((value, index) => {
    nextValues[index] = String(value ?? '')
  })

  return nextValues
}

function getFileIdentityKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function revokePreviewUrl(entry) {
  if (
    entry?.isObjectUrl &&
    typeof entry.previewUrl === 'string' &&
    entry.previewUrl.length > 0 &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(entry.previewUrl)
  }
}

function createLocalPreviewEntry(file) {
  return {
    id: null,
    file,
    fileName: file.name,
    previewUrl: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : '',
    isObjectUrl: true,
  }
}

function createExistingAssetEntry(asset) {
  return {
    id: asset.id,
    file: null,
    fileName: asset.original_file_name || 'Uploaded asset',
    previewUrl: asset.previewUrl || '',
    isObjectUrl: false,
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

function isValidHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value ?? '').trim())
}

export function SettingsModal({
  isOpen,
  theme,
  trimTransparentImports,
  showChatPanel = false,
  onClose,
  onToggleTheme,
  onToggleTrimTransparentImports,
  onToggleShowChatPanel,
}) {
  const [activeTab, setActiveTab] = useState('workspace')
  const [businessName, setBusinessName] = useState('')
  const [selectedBusinessType, setSelectedBusinessType] = useState('')
  const [selectedTone, setSelectedTone] = useState('')
  const [brandColors, setBrandColors] = useState(createEmptyBrandColorValues)
  const [logoEntry, setLogoEntry] = useState(null)
  const [referenceEntries, setReferenceEntries] = useState([])
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const [profileStatusMessage, setProfileStatusMessage] = useState('')
  const [profileStatusTone, setProfileStatusTone] = useState('info')
  const logoInputRef = useRef(null)
  const referenceInputRef = useRef(null)
  const logoEntryRef = useRef(logoEntry)
  const referenceEntriesRef = useRef(referenceEntries)

  useEffect(() => {
    logoEntryRef.current = logoEntry
  }, [logoEntry])

  useEffect(() => {
    referenceEntriesRef.current = referenceEntries
  }, [referenceEntries])

  useEffect(() => {
    if (isOpen) {
      return
    }

    revokePreviewUrl(logoEntryRef.current)
    referenceEntriesRef.current.forEach(revokePreviewUrl)
    setLogoEntry(null)
    setReferenceEntries([])
    setProfileStatusMessage('')
  }, [isOpen])

  useEffect(() => () => {
    revokePreviewUrl(logoEntryRef.current)
    referenceEntriesRef.current.forEach(revokePreviewUrl)
  }, [])

  function replaceEditableState(profile) {
    revokePreviewUrl(logoEntryRef.current)
    referenceEntriesRef.current.forEach(revokePreviewUrl)

    const nextLogoEntry = profile?.logoAsset ? createExistingAssetEntry(profile.logoAsset) : null
    const nextReferenceEntries = (profile?.referenceAssets ?? []).map(createExistingAssetEntry)

    setBusinessName(profile?.name ?? '')
    setSelectedBusinessType(profile?.business_type ?? '')
    setSelectedTone(Array.isArray(profile?.tone_preferences) ? profile.tone_preferences[0] ?? '' : '')
    setBrandColors(fillBrandColorSlots(profile?.brand_colors))
    setLogoEntry(nextLogoEntry)
    setReferenceEntries(nextReferenceEntries)
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    let isMounted = true
    setIsProfileLoading(true)
    setProfileStatusMessage('')
    setProfileStatusTone('info')

    async function loadProfile() {
      try {
        const profile = await fetchDefaultBusinessProfile()

        if (!isMounted) {
          return
        }

        replaceEditableState(profile)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setProfileStatusMessage(error instanceof Error ? error.message : 'Unable to load the business profile.')
        setProfileStatusTone('error')
        replaceEditableState(null)
      } finally {
        if (isMounted) {
          setIsProfileLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [isOpen])

  const canSaveProfile = useMemo(() => (
    businessName.trim().length > 0 &&
    selectedBusinessType.length > 0 &&
    selectedTone.length > 0 &&
    !isProfileLoading &&
    !isProfileSaving
  ), [businessName, isProfileLoading, isProfileSaving, selectedBusinessType, selectedTone])

  const remainingReferenceSlots = Math.max(0, REFERENCE_SLOT_COUNT - referenceEntries.length)
  const filledBrandColorCount = brandColors.filter((value) => String(value ?? '').trim().length > 0).length

  if (!isOpen) {
    return null
  }

  function handleRequestClose() {
    if (isProfileSaving) {
      return
    }

    onClose?.()
  }

  function handleLogoChange(event) {
    const selectedFile = Array.from(event.target.files ?? []).find(isAcceptedImageFile) ?? null
    event.target.value = ''

    if (!selectedFile) {
      return
    }

    setProfileStatusMessage('')
    setLogoEntry((currentEntry) => {
      revokePreviewUrl(currentEntry)
      return createLocalPreviewEntry(selectedFile)
    })
  }

  function handleReferenceFilesChange(event) {
    const selectedFiles = Array.from(event.target.files ?? []).filter(isAcceptedImageFile)
    event.target.value = ''

    if (selectedFiles.length === 0 || remainingReferenceSlots === 0) {
      return
    }

    setProfileStatusMessage('')
    setReferenceEntries((currentEntries) => {
      const nextEntries = [...currentEntries]
      const seenFileKeys = new Set(
        currentEntries
          .filter((entry) => entry.file)
          .map((entry) => getFileIdentityKey(entry.file)),
      )

      selectedFiles.forEach((file) => {
        if (nextEntries.length >= REFERENCE_SLOT_COUNT) {
          return
        }

        const fileKey = getFileIdentityKey(file)

        if (seenFileKeys.has(fileKey)) {
          return
        }

        seenFileKeys.add(fileKey)
        nextEntries.push(createLocalPreviewEntry(file))
      })

      return nextEntries
    })
  }

  function handleRemoveLogo() {
    setProfileStatusMessage('')
    setLogoEntry((currentEntry) => {
      revokePreviewUrl(currentEntry)
      return null
    })
  }

  function handleRemoveReference(indexToRemove) {
    setProfileStatusMessage('')
    setReferenceEntries((currentEntries) => currentEntries.filter((entry, index) => {
      if (index === indexToRemove) {
        revokePreviewUrl(entry)
        return false
      }

      return true
    }))
  }

  function updateBrandColor(index, nextValue) {
    setBrandColors((currentValues) => {
      const nextValues = [...currentValues]
      nextValues[index] = nextValue
      return nextValues
    })
  }

  async function handleSaveProfile() {
    if (!canSaveProfile) {
      return
    }

    setIsProfileSaving(true)
    setProfileStatusMessage('')
    setProfileStatusTone('info')

    try {
      await saveBusinessProfile({
        name: businessName.trim(),
        businessType: selectedBusinessType,
        tonePreference: selectedTone,
        brandColors,
        logoFile: logoEntry?.file ?? null,
        referenceFiles: referenceEntries
          .filter((entry) => entry.file)
          .map((entry) => entry.file),
        existingLogoAssetId: logoEntry?.file ? null : logoEntry?.id ?? null,
        existingReferenceAssetIds: referenceEntries
          .filter((entry) => !entry.file && entry.id)
          .map((entry) => entry.id),
      })

      const refreshedProfile = await fetchDefaultBusinessProfile()
      replaceEditableState(refreshedProfile)
      setProfileStatusMessage('Business profile updated.')
      setProfileStatusTone('success')
    } catch (error) {
      setProfileStatusMessage(error instanceof Error ? error.message : 'Unable to save the business profile.')
      setProfileStatusTone('error')
    } finally {
      setIsProfileSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={handleRequestClose} role="presentation">
      <div
        className="modal-card settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="settings-modal-heading">
            <h2>Editor Preferences</h2>
          </div>
        </div>
        <div className="settings-tab-list" role="tablist" aria-label="Settings sections">
          <button
            className={activeTab === 'workspace' ? 'settings-tab-button active' : 'settings-tab-button'}
            type="button"
            role="tab"
            aria-selected={activeTab === 'workspace'}
            aria-controls="settings-workspace-panel"
            id="settings-workspace-tab"
            onClick={() => setActiveTab('workspace')}
          >
            Workspace
          </button>
          <button
            className={activeTab === 'brand' ? 'settings-tab-button active' : 'settings-tab-button'}
            type="button"
            role="tab"
            aria-selected={activeTab === 'brand'}
            aria-controls="settings-brand-panel"
            id="settings-brand-tab"
            onClick={() => setActiveTab('brand')}
          >
            Brand & onboarding
          </button>
        </div>
        <div className="modal-body single-column settings-modal-body">
          {activeTab === 'workspace' ? (
            <section
              className="settings-section settings-section-compact"
              role="tabpanel"
              id="settings-workspace-panel"
              aria-labelledby="settings-workspace-tab"
            >
            <div className="settings-section-copy settings-section-copy-compact">
              <h3>Workspace</h3>
              <p>Small controls for the editor itself.</p>
            </div>
            <div className="settings-toggle-grid">
              <button
                className={theme === 'dark' ? 'settings-toggle active' : 'settings-toggle'}
                type="button"
                onClick={onToggleTheme}
                aria-label="Toggle dark mode"
              >
                <span>UI Theme</span>
                <strong>{theme === 'dark' ? 'Light UI' : 'Dark UI'}</strong>
              </button>
              <button
                className={trimTransparentImports ? 'settings-toggle active' : 'settings-toggle'}
                type="button"
                onClick={onToggleTrimTransparentImports}
                aria-pressed={trimTransparentImports}
              >
                <span>Trim Transparent Imports</span>
                <strong>{trimTransparentImports ? 'On' : 'Off'}</strong>
              </button>
              <button
                className={showChatPanel ? 'settings-toggle active' : 'settings-toggle'}
                type="button"
                onClick={onToggleShowChatPanel}
                aria-pressed={showChatPanel}
              >
                <span>Chat Side Panel</span>
                <strong>{showChatPanel ? 'Shown' : 'Hidden'}</strong>
              </button>
            </div>
            </section>
          ) : null}

          {activeTab === 'brand' ? (
            <section
              className="settings-section settings-profile-section"
              role="tabpanel"
              id="settings-brand-panel"
              aria-labelledby="settings-brand-tab"
            >
            <div className="settings-section-copy">
              <h3>Brand & onboarding</h3>
              <p>Edit the same business profile used during onboarding.</p>
            </div>

            <div className="settings-profile-layout">
              <section className="settings-subsection settings-subsection-basics">
                <div className="settings-subsection-copy">
                  <strong>Business basics</strong>
                  <span>Name, type, and caption voice.</span>
                </div>

                <div className="settings-field-grid">
                  <label className="property-field full-width">
                    <span>Business name</span>
                    <input
                      type="text"
                      aria-label="Business name"
                      value={businessName}
                      onChange={(event) => {
                        setProfileStatusMessage('')
                        setBusinessName(event.target.value)
                      }}
                      placeholder="Moonline Cafe"
                      disabled={isProfileLoading || isProfileSaving}
                    />
                  </label>

                  <label className="property-field">
                    <span>Business type</span>
                    <select
                      aria-label="Business type"
                      value={selectedBusinessType}
                      onChange={(event) => {
                        setProfileStatusMessage('')
                        setSelectedBusinessType(event.target.value)
                      }}
                      disabled={isProfileLoading || isProfileSaving}
                    >
                      <option value="">Select a type</option>
                      {BUSINESS_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="property-field full-width">
                  <span>Preferred caption tone</span>
                  <div className="settings-tone-grid">
                    {CAPTION_TONE_OPTIONS.map((tone) => {
                      const isSelected = tone === selectedTone

                      return (
                        <button
                          key={tone}
                          className={isSelected ? 'settings-tone-chip active' : 'settings-tone-chip'}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setProfileStatusMessage('')
                            setSelectedTone(tone)
                          }}
                          disabled={isProfileLoading || isProfileSaving}
                        >
                          {tone}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>

              <section className="settings-subsection settings-subsection-assets">
                <div className="settings-subsection-copy">
                  <strong>Brand assets</strong>
                  <span>Logo plus visual references for generation.</span>
                </div>

                <div className="settings-upload-grid">
                  <section className="settings-upload-panel settings-logo-panel">
                    <div className="settings-upload-panel-header">
                      <div>
                        <strong>Logo</strong>
                        <span>{logoEntry ? 'Current mark ready to use.' : 'Optional but helpful.'}</span>
                      </div>
                      <div className="settings-inline-actions">
                        <input
                          ref={logoInputRef}
                          className="settings-upload-input"
                          type="file"
                          accept="image/*"
                          aria-label="Upload business logo"
                          onChange={handleLogoChange}
                        />
                        <button
                          className="settings-inline-button"
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={isProfileLoading || isProfileSaving}
                        >
                          {logoEntry ? 'Replace' : 'Upload'}
                        </button>
                        {logoEntry ? (
                          <button
                            className="settings-inline-button settings-inline-button-danger"
                            type="button"
                            onClick={handleRemoveLogo}
                            disabled={isProfileLoading || isProfileSaving}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className={logoEntry ? 'settings-logo-card has-image' : 'settings-logo-card'}>
                      {logoEntry?.previewUrl ? (
                        <AssetImage
                          className="settings-logo-preview"
                          src={logoEntry.previewUrl}
                          alt="Business logo preview"
                        />
                      ) : (
                        <span className="settings-upload-empty-mark" aria-hidden="true">
                          +
                        </span>
                      )}
                      <div className="settings-logo-copy">
                        <strong>{logoEntry ? 'Logo ready' : 'No logo added yet'}</strong>
                        <span>{logoEntry?.fileName || 'PNG, JPG, WEBP, GIF, or SVG'}</span>
                      </div>
                    </div>
                  </section>

                  <section className="settings-upload-panel settings-reference-panel">
                    <div className="settings-upload-panel-header">
                      <div>
                        <strong>Reference images</strong>
                        <span>{`${referenceEntries.length} of ${REFERENCE_SLOT_COUNT} selected`}</span>
                      </div>
                      <div className="settings-inline-actions">
                        <input
                          ref={referenceInputRef}
                          className="settings-upload-input"
                          type="file"
                          accept="image/*"
                          multiple
                          aria-label="Add reference images"
                          onChange={handleReferenceFilesChange}
                        />
                        <button
                          className="settings-inline-button"
                          type="button"
                          onClick={() => referenceInputRef.current?.click()}
                          disabled={isProfileLoading || isProfileSaving || remainingReferenceSlots === 0}
                        >
                          Add images
                        </button>
                      </div>
                    </div>

                    <div className="settings-reference-grid">
                      {referenceEntries.map((entry, index) => (
                        <article className="settings-reference-card" key={entry.id ?? `${entry.fileName}-${index}`}>
                          {entry.previewUrl ? (
                            <AssetImage
                              className="settings-reference-preview"
                              src={entry.previewUrl}
                              alt={`Reference image ${index + 1} preview`}
                            />
                          ) : (
                            <span className="settings-upload-empty-mark" aria-hidden="true">
                              +
                            </span>
                          )}

                          <div className="settings-reference-copy">
                            <strong>{entry.fileName}</strong>
                            <span>{entry.file ? 'Pending upload' : 'Saved reference'}</span>
                          </div>

                          <button
                            className="settings-reference-remove"
                            type="button"
                            aria-label={`Remove reference image ${index + 1}`}
                            onClick={() => handleRemoveReference(index)}
                            disabled={isProfileLoading || isProfileSaving}
                          >
                            Remove
                          </button>
                        </article>
                      ))}

                      {referenceEntries.length === 0 ? (
                        <button
                          className="settings-reference-add-card"
                          type="button"
                          onClick={() => referenceInputRef.current?.click()}
                          disabled={isProfileLoading || isProfileSaving}
                        >
                          <span className="settings-upload-empty-mark" aria-hidden="true">
                            +
                          </span>
                          <strong>Add example posts</strong>
                          <span>Upload a few references to steer the visual style.</span>
                        </button>
                      ) : null}
                    </div>
                  </section>
                </div>
              </section>

              <section className="settings-subsection settings-subsection-colors full-width">
                <div className="settings-subsection-copy">
                  <strong>Color palette</strong>
                  <span>{filledBrandColorCount > 0
                    ? `${filledBrandColorCount} brand ${filledBrandColorCount === 1 ? 'color' : 'colors'} set`
                    : 'Optional accent colors for generation.'}</span>
                </div>

                <div className="settings-color-grid">
                  {brandColors.map((value, index) => (
                    <label key={`settings-brand-color-${index + 1}`} className="property-field">
                      <span>{`Color ${index + 1}`}</span>
                      <span className="settings-color-input-shell">
                        <span
                          className={isValidHexColor(value)
                            ? 'settings-color-preview active'
                            : 'settings-color-preview'}
                          aria-hidden="true"
                          style={isValidHexColor(value) ? { backgroundColor: value.trim() } : undefined}
                        />
                        <input
                          type="text"
                          aria-label={`Brand color ${index + 1}`}
                          value={value}
                          onChange={(event) => {
                            setProfileStatusMessage('')
                            updateBrandColor(index, event.target.value)
                          }}
                          placeholder="#D97706"
                          disabled={isProfileLoading || isProfileSaving}
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            </div>

            {profileStatusMessage ? (
              <p
                className={profileStatusTone === 'error'
                  ? 'settings-status-message settings-status-message-error'
                  : 'settings-status-message'}
                role={profileStatusTone === 'error' ? 'alert' : 'status'}
              >
                {profileStatusMessage}
              </p>
            ) : null}
            </section>
          ) : null}
        </div>
        <div className="modal-actions settings-modal-actions">
          <button className="action-button" type="button" onClick={handleRequestClose} disabled={isProfileSaving}>
            Close
          </button>
          {activeTab === 'brand' ? (
            <button
              className="action-button settings-save-button"
              type="button"
              onClick={() => {
                void handleSaveProfile()
              }}
              disabled={!canSaveProfile}
            >
              {isProfileSaving ? 'Saving...' : 'Save profile'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
