import { describe, expect, it } from 'vitest'
import {
  buildImageGenerationInstructions,
  buildCaptionUserPrompt,
  buildImageGenerationUserPrompt,
  buildSafeGenerationErrorMessage,
} from './promptTemplates.ts'

const businessProfile = {
  name: 'Moonline Cafe',
  business_type: 'Cafe',
  brand_description: 'A warm specialty coffee shop.',
  tone_preferences: ['Friendly'],
  style_preferences: ['Editorial'],
  brand_colors: ['#f3b56a'],
}

describe('prompt template helpers', () => {
  it('uses attached-image guidance when reference images are available', () => {
    const prompt = buildImageGenerationUserPrompt({
      businessProfile,
      userPrompt: 'Announce a new iced latte.',
      requestedWidth: 1080,
      requestedHeight: 1350,
      aspectRatioLabel: '4:5',
      hasBrandReferences: true,
      hasBrandLogo: true,
      hasUserAttachments: false,
      generationMode: 'initial',
    })

    expect(prompt).toContain('Create a polished Instagram post design that matches the visual style, mood, color palette, typography feel, spacing, and composition style of the attached reference images.')
    expect(prompt).toContain('Make sure to use the same color scheme in the attached images as well.')
    expect(prompt).toContain('- Logo reference: attached as "logo" when available.')
    expect(prompt).toContain('The attached image named logo is the only logo that may be used as a brand asset.')
    expect(prompt).toContain('User request:')
    expect(prompt).toContain('Announce a new iced latte.')
    expect(prompt).toContain('- Use the uploaded logo as the brand logo.')
    expect(prompt).toContain('- Prioritize the user request over the reference images when they conflict.')
    expect(prompt).toContain('- Match the requested aspect ratio: 4:5.')
    expect(prompt).not.toContain('Requested canvas:')
  })

  it('does not claim images are attached when fallback references are deferred', () => {
    const prompt = buildImageGenerationUserPrompt({
      businessProfile,
      userPrompt: 'Create a breakfast promo.',
      requestedWidth: 1080,
      requestedHeight: 1080,
      aspectRatioLabel: '1:1',
      hasBrandReferences: false,
      hasBrandLogo: false,
      hasUserAttachments: false,
      generationMode: 'initial',
    })

    expect(prompt).toContain('Create a polished Instagram post design based on the written brand context and user request.')
    expect(prompt).toContain('- Logo reference: no logo reference is provided. Do not invent a logo.')
    expect(prompt).toContain('- Use the brand colors and style preferences where appropriate.')
    expect(prompt).toContain('- Match the requested aspect ratio: 1:1.')
    expect(prompt).not.toContain('Using the attached images')
    expect(prompt).not.toContain('uploaded logo')
    expect(prompt).not.toContain('Requested canvas:')
  })

  it('does not treat user attachments as style reference images', () => {
    const prompt = buildImageGenerationUserPrompt({
      businessProfile,
      userPrompt: 'Use the attached product photo in a launch post.',
      requestedWidth: 1080,
      requestedHeight: 1080,
      aspectRatioLabel: '1:1',
      hasBrandReferences: false,
      hasBrandLogo: false,
      hasUserAttachments: true,
      generationMode: 'initial',
    })

    expect(prompt).toContain('Create a polished Instagram post design based on the written brand context and user request.')
    expect(prompt).toContain('- Use the brand colors and style preferences where appropriate.')
    expect(prompt).not.toContain('attached reference images')
  })

  it('uses strict preservation guidance for image edits', () => {
    const instructions = buildImageGenerationInstructions({
      businessProfile,
      userPrompt: 'Move the logo to the right.',
      requestedWidth: 1080,
      requestedHeight: 1350,
      aspectRatioLabel: '4:5',
      hasBrandReferences: true,
      hasBrandLogo: true,
      hasUserAttachments: false,
      generationMode: 'edit',
      previousCaption: 'Fresh coffee, now pouring.',
    })
    const prompt = buildImageGenerationUserPrompt({
      businessProfile,
      userPrompt: 'Move the logo to the right.',
      requestedWidth: 1080,
      requestedHeight: 1350,
      aspectRatioLabel: '4:5',
      hasBrandReferences: true,
      hasBrandLogo: true,
      hasUserAttachments: false,
      generationMode: 'edit',
      previousCaption: 'Fresh coffee, now pouring.',
    })

    expect(instructions).toContain('Change only the specific element, area, wording, object, color, or layout detail requested by the user.')
    expect(instructions).toContain('Do not redesign, restyle, replace, or reinterpret unrelated parts of the post.')
    expect(prompt).toContain('Only change the part the user asks to edit.')
    expect(prompt).toContain('Preserve all unrelated parts of the current post.')
    expect(prompt).toContain('Make the requested edit blend cleanly with the existing design')
  })

  it('builds the requested caption-only prompt for first generation', () => {
    const prompt = buildCaptionUserPrompt({
      businessProfile,
      userPrompt: 'Create a post for our new coffee.',
      generationMode: 'initial',
    })

    expect(prompt).toContain('I want to create a post with this prompt:')
    expect(prompt).toContain('Create a post for our new coffee.')
    expect(prompt).toContain('Only respond with that caption and that caption only.')
  })

  it('treats follow-up caption prompts as edits', () => {
    const prompt = buildCaptionUserPrompt({
      businessProfile,
      userPrompt: 'Make it more playful.',
      generationMode: 'edit',
      previousCaption: 'Fresh coffee, now pouring.',
    })

    expect(prompt).toContain('This post is being revised.')
    expect(prompt).toContain('Existing caption: Fresh coffee, now pouring.')
    expect(prompt).toContain('Latest edit request: Make it more playful.')
  })

  it('returns a specific safe message for image timeouts', () => {
    expect(buildSafeGenerationErrorMessage('OPENAI_IMAGE_TIMEOUT')).toBe(
      'Image generation timed out. Please try again.',
    )
    expect(buildSafeGenerationErrorMessage('OPENAI_ERROR')).toBe(
      'I could not generate the post right now. Please try again in a moment.',
    )
  })
})
