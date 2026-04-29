interface BusinessProfileContext {
  name: string
  business_type: string
  brand_description: string | null
  tone_preferences: string[]
  style_preferences: string[]
  brand_colors: string[]
}

interface ImagePromptParams {
  businessProfile: BusinessProfileContext | null
  userPrompt: string
  requestedWidth: number
  requestedHeight: number
  aspectRatioLabel: string
  hasBrandReferences: boolean
  hasBrandLogo: boolean
  hasUserAttachments: boolean
  generationMode: 'initial' | 'edit'
  previousCaption?: string | null
}

interface CaptionPromptParams {
  businessProfile: BusinessProfileContext | null
  userPrompt: string
  generationMode: 'initial' | 'edit'
  previousCaption?: string | null
}

function formatList(values: string[]) {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean)

  return normalized.length > 0 ? normalized.join(', ') : null
}

function formatBrandColors(colors: string[]) {
  const normalized = colors
    .map((value) => value.trim())
    .filter(Boolean)

  return normalized.length > 0 ? normalized.join(', ') : null
}

function buildBusinessContext(profile: BusinessProfileContext | null) {
  if (!profile) {
    return [
      '- No saved business profile is available for this user.',
    ].join('\n')
  }

  const tonePreferences = formatList(profile.tone_preferences)
  const stylePreferences = formatList(profile.style_preferences)
  const brandColors = formatBrandColors(profile.brand_colors)

  return [
    `- Business name: ${profile.name}`,
    `- Business type: ${profile.business_type}`,
    profile.brand_description ? `- Brand description: ${profile.brand_description}` : null,
    tonePreferences ? `- Preferred caption tone: ${tonePreferences}` : null,
    stylePreferences ? `- Style preferences: ${stylePreferences}` : null,
    brandColors ? `- Brand colors: ${brandColors}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildImageGenerationInstructions(params: ImagePromptParams) {
  const referenceGuidance = params.hasBrandReferences
    ? 'Brand reference images are attached. Match their aesthetic, composition rhythm, color behavior, and overall feel without copying them exactly.'
    : 'No brand reference images are attached. Use only the written brand context and the user request.'
  const attachmentGuidance = params.hasUserAttachments
    ? 'User-supplied content images are attached. Incorporate their important subjects or products naturally when relevant.'
    : 'No user-supplied content images are attached for this request.'
  const logoGuidance = params.hasBrandLogo
    ? 'A brand logo image is attached and named logo. Treat it as the official brand mark, not as a general style reference.'
    : 'No brand logo image is attached for this request.'
  const modeGuidance = params.generationMode === 'edit'
    ? 'You are revising an existing social post. Preserve the core brand language unless the user explicitly asks for a change.'
    : 'You are creating a fresh social post from scratch.'

  return [
    'You create polished, production-ready social media post images for businesses.',
    modeGuidance,
    referenceGuidance,
    logoGuidance,
    attachmentGuidance,
    'Keep the image appropriate for Instagram and readable as a finished marketing visual.',
    'Do not clone the reference images directly. Use them only as style and layout guidance.',
    'Prefer a clean, premium composition over cluttered visuals.',
    'If text is needed inside the post, keep it concise and legible.',
    'Respect the requested aspect ratio when composing the scene.',
  ].join('\n')
}

export function buildImageGenerationUserPrompt(params: ImagePromptParams) {
  const hasStyleReferences = params.hasBrandReferences
  const styleReferenceRestriction = params.hasBrandLogo
    ? 'Use the attached reference images only as style references. Do not copy or reuse exact layouts, text, people, products, specific objects, or logos from the style reference images. The attached image named logo is the only logo that may be used as a brand asset.'
    : 'Use the attached images only as style references. Do not copy or reuse exact layouts, logos, text, people, products, or specific objects from the reference images unless the user explicitly asks for them.'
  const firstInstruction = params.generationMode === 'edit'
    ? 'Update the current post based on the latest instruction.'
    : hasStyleReferences
      ? [
        'Create a polished Instagram post design that matches the visual style, mood, color palette, typography feel, spacing, and composition style of the attached reference images.',
        '',
        styleReferenceRestriction,
      ].join('\n')
      : 'Create a polished Instagram post design based on the written brand context and user request.'

  return [
    firstInstruction,
    '',
    'Brand context:',
    buildBusinessContext(params.businessProfile),
    '',
    params.previousCaption && params.generationMode === 'edit'
      ? `Current caption: ${params.previousCaption}`
      : null,
    '',
    'User request:',
    params.userPrompt,
    '',
    'Design requirements:',
    '- Make it look like a finished social media post, not a generic illustration.',
    '- Keep the layout clean, balanced, and commercially usable.',
    '- If the post needs text, make the text short, readable, and visually integrated.',
    params.hasBrandLogo
      ? '- Use the uploaded logo as the brand logo. You may include it when it fits the design, but keep it subtle and professionally integrated.'
      : null,
    hasStyleReferences && params.generationMode !== 'edit'
      ? '- Prioritize the user request over the reference images when they conflict.'
      : '- Use the brand colors and style preferences where appropriate.',
    `- Match the requested aspect ratio: ${params.aspectRatioLabel}.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildCaptionInstructions() {
  return [
    'You write concise, platform-ready social media captions.',
    'Return only the caption text.',
    'Do not include quotation marks, bullet points, labels, or extra explanation.',
  ].join('\n')
}

export function buildCaptionUserPrompt(params: CaptionPromptParams) {
  return [
    params.generationMode === 'edit'
      ? 'This post is being revised. Update the caption to match the latest request.'
      : 'I want to create a post with this prompt:',
    params.generationMode === 'edit' && params.previousCaption
      ? `Existing caption: ${params.previousCaption}`
      : null,
    params.generationMode === 'edit'
      ? `Latest edit request: ${params.userPrompt}`
      : params.userPrompt,
    '',
    'Brand context:',
    buildBusinessContext(params.businessProfile),
    '',
    'Come up with a proper caption for a social media post that would fit the context. Only respond with that caption and that caption only.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildAssistantSummaryText(generationMode: 'initial' | 'edit') {
  return generationMode === 'edit'
    ? 'Updated the post draft.'
    : 'Generated a new post draft.'
}

export function buildSafeGenerationErrorMessage(errorCode?: string) {
  if (errorCode === 'OPENAI_IMAGE_TIMEOUT') {
    return 'Image generation timed out. Please try again.'
  }

  return 'I could not generate the post right now. Please try again in a moment.'
}
