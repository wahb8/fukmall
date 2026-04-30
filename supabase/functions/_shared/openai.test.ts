import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('OpenAI shared helper', () => {
  beforeEach(() => {
    vi.resetModules()
    globalThis.Deno = {
      env: {
        get: vi.fn((name: string) => {
          if (name === 'OPENAI_API_KEY') {
            return 'test-openai-key'
          }

          return undefined
        }),
      },
    } as unknown as typeof Deno
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the direct GPT Image 2 edit endpoint without unsupported image parameters', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://example.com/reference.png') {
        return new Response(new Blob(['reference'], { type: 'image/png' }), {
          status: 200,
          headers: {
            'content-type': 'image/png',
          },
        })
      }

      return new Response(JSON.stringify({
        id: 'response-1',
        data: [
          {
            b64_json: btoa('image'),
          },
        ],
        usage: {},
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { generatePostImage } = await import('./openai.ts')
    const result = await generatePostImage({
      instructions: 'Create a post.',
      userPrompt: 'Create a cafe launch post.',
      referenceImageUrls: [{ url: 'https://example.com/reference.png', fileName: 'logo' }],
      requestedWidth: 1080,
      requestedHeight: 1080,
    })

    expect(result.imageBase64).toBe(btoa('image'))

    const openAiCall = fetchMock.mock.calls.find(([url]) => (
      String(url).endsWith('/images/edits')
    ))

    expect(openAiCall).toBeTruthy()
    const requestBody = openAiCall?.[1]?.body as FormData
    expect(requestBody.get('model')).toBe('gpt-image-2')
    expect(requestBody.get('size')).toBe('1080x1080')
    expect(requestBody.get('quality')).toBe('medium')
    expect(requestBody.get('background')).toBe('opaque')
    expect(requestBody.get('format')).toBeNull()
    expect(requestBody.get('input_fidelity')).toBeNull()
    expect(requestBody.getAll('image[]')).toHaveLength(1)
    expect((requestBody.getAll('image[]')[0] as File).name).toBe('logo.png')
  })

  it('uses the direct GPT Image 2 generation endpoint when no reference images are provided', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'response-1',
      data: [
        {
          b64_json: btoa('image'),
        },
      ],
      usage: {},
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { generatePostImage } = await import('./openai.ts')
    await generatePostImage({
      instructions: 'Create a post.',
      userPrompt: 'Create a cafe launch post.',
      referenceImageUrls: [],
      requestedWidth: 1080,
      requestedHeight: 1080,
    })

    expect(String(fetchMock.mock.calls[0][0])).toContain('/images/generations')
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody).toMatchObject({
      model: 'gpt-image-2',
      size: '1080x1080',
      quality: 'medium',
      background: 'opaque',
    })
  })

  it('keeps configurable input fidelity for older image-capable model overrides', async () => {
    ;(Deno.env.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'OPENAI_API_KEY') {
        return 'test-openai-key'
      }

      if (name === 'OPENAI_IMAGE_MODEL') {
        return 'gpt-4.1-mini'
      }

      return undefined
    })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'response-1',
      output: [
        {
          type: 'image_generation_call',
          result: btoa('image'),
        },
      ],
      usage: {},
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { generatePostImage } = await import('./openai.ts')
    await generatePostImage({
      instructions: 'Create a post.',
      userPrompt: 'Create a cafe launch post.',
      referenceImageUrls: ['https://example.com/reference.png'],
      requestedWidth: 1080,
      requestedHeight: 1080,
    })

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody.model).toBe('gpt-4.1-mini')
    expect(requestBody.tools[0]).toMatchObject({
      quality: 'medium',
      input_fidelity: 'high',
    })
  })

  it('generates a short chat title with the small title model', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'title-response-1',
      output_text: '"New Iced Latte"',
      usage: {
        output_tokens: 4,
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { generateChatTitle } = await import('./openai.ts')
    const result = await generateChatTitle({
      prompt: 'Create a post for my cafe announcing a new iced latte.',
    })

    expect(result).toMatchObject({
      responseId: 'title-response-1',
      title: 'New Iced Latte',
      usage: {
        output_tokens: 4,
      },
    })

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(String(fetchMock.mock.calls[0][0])).toContain('/responses')
    expect(requestBody.model).toBe('gpt-4.1-mini')
    expect(requestBody.instructions).toContain('Return only the title')
    expect(requestBody.input[0].content[0].text).toContain('new iced latte')
  })
})
