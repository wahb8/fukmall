import { describe, expect, it } from 'vitest'
import {
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
      hasUserAttachments: false,
      generationMode: 'initial',
    })

    expect(prompt).toContain('Using the attached images, create an Instagram post that matches their aesthetic and style. However, do not include anything from the attached images unless specified, only match the exact style of the images.')
    expect(prompt).toContain('This is what I want:')
    expect(prompt).toContain('Announce a new iced latte.')
    expect(prompt).toContain('Make the aspect ratio 4:5')
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
      hasUserAttachments: false,
      generationMode: 'initial',
    })

    expect(prompt).toContain('Create an Instagram post that matches the written brand context and user request.')
    expect(prompt).toContain('Make the aspect ratio 1:1')
    expect(prompt).not.toContain('Using the attached images')
    expect(prompt).not.toContain('Requested canvas:')
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
