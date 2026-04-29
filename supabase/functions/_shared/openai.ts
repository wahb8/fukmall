import { AppError } from './errors.ts'
import { getRequiredEnv } from './env.ts'

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
const DEFAULT_CAPTION_MODEL = 'gpt-4.1-mini'
const DEFAULT_IMAGE_QUALITY = 'high'
const DEFAULT_IMAGE_TIMEOUT_MS = 135000
const MIN_IMAGE_TIMEOUT_MS = 10000
const MAX_IMAGE_TIMEOUT_MS = 145000
const SUPPORTED_IMAGE_QUALITIES = new Set(['low', 'medium', 'high', 'auto'])

type JsonRecord = Record<string, unknown>

interface OpenAiErrorPayload {
  error?: {
    message?: string
    code?: string
    type?: string
  }
}

interface OpenAiResponsesOutputItem extends JsonRecord {
  type?: string
  result?: string
  revised_prompt?: string
}

interface OpenAiResponsesPayload extends JsonRecord {
  id?: string
  output?: OpenAiResponsesOutputItem[]
  output_text?: string
  usage?: JsonRecord
}

interface OpenAiImageDataItem extends JsonRecord {
  b64_json?: string
  revised_prompt?: string
}

interface OpenAiImagesPayload extends JsonRecord {
  id?: string
  data?: OpenAiImageDataItem[]
  usage?: JsonRecord
}

export interface ResolvedImageCanvas {
  requestedSize: string
  outputWidth: number
  outputHeight: number
  aspectRatioLabel: string
}

export interface OpenAiGeneratedImage {
  model: string
  responseId: string | null
  imageBase64: string
  revisedPrompt: string | null
  outputWidth: number
  outputHeight: number
  requestedSize: string
  usage: JsonRecord | null
}

export interface OpenAiGeneratedCaption {
  responseId: string | null
  caption: string
  usage: JsonRecord | null
}

function getOpenAiApiKey() {
  return getRequiredEnv('OPENAI_API_KEY')
}

function getOpenAiImageModel() {
  return Deno.env.get('OPENAI_IMAGE_MODEL')?.trim() || DEFAULT_IMAGE_MODEL
}

function getOpenAiCaptionModel() {
  return Deno.env.get('OPENAI_CAPTION_MODEL')?.trim() || DEFAULT_CAPTION_MODEL
}

function getOpenAiImageQuality() {
  const quality = Deno.env.get('OPENAI_IMAGE_QUALITY')?.trim().toLowerCase()

  return quality && SUPPORTED_IMAGE_QUALITIES.has(quality)
    ? quality
    : DEFAULT_IMAGE_QUALITY
}

function getOpenAiImageTimeoutMs() {
  const rawTimeoutMs = Number(Deno.env.get('OPENAI_IMAGE_TIMEOUT_MS'))

  if (!Number.isFinite(rawTimeoutMs)) {
    return DEFAULT_IMAGE_TIMEOUT_MS
  }

  return Math.min(
    MAX_IMAGE_TIMEOUT_MS,
    Math.max(MIN_IMAGE_TIMEOUT_MS, Math.round(rawTimeoutMs)),
  )
}

async function withOpenAiImageTimeout<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), getOpenAiImageTimeoutMs())

  try {
    return await operation(controller.signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AppError(
        'OPENAI_IMAGE_TIMEOUT',
        'OpenAI image generation timed out. Please try again.',
        504,
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseJsonResponse<T extends JsonRecord>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('OPENAI_RESPONSE_INVALID', 'OpenAI returned an invalid JSON payload.', 502)
  }

  return payload as T
}

function parseSizeLabel(sizeLabel: string) {
  const match = sizeLabel.match(/^(\d+)x(\d+)$/)

  if (!match) {
    throw new AppError('OPENAI_SIZE_INVALID', 'Resolved OpenAI image size is invalid.', 500)
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  }
}

function normalizeAspectRatioLabel(width: number, height: number) {
  const ratio = width / height

  if (Math.abs(ratio - 1) < 0.025) {
    return '1:1'
  }

  if (Math.abs(ratio - (4 / 5)) < 0.03) {
    return '4:5'
  }

  if (Math.abs(ratio - (9 / 16)) < 0.03) {
    return '9:16'
  }

  return `${width}:${height}`
}

export function resolveRequestedImageCanvas(width: number, height: number): ResolvedImageCanvas {
  return {
    requestedSize: `${width}x${height}`,
    outputWidth: width,
    outputHeight: height,
    aspectRatioLabel: normalizeAspectRatioLabel(width, height),
  }
}

function getFallbackOpenAiSize(width: number, height: number) {
  const ratio = width / height

  if (Math.abs(ratio - 1) < 0.025) {
    return '1024x1024'
  }

  return width > height ? '1536x1024' : '1024x1536'
}

function buildImageSizeCandidates(width: number, height: number) {
  const exactSize = `${width}x${height}`
  const fallbackSize = getFallbackOpenAiSize(width, height)

  return exactSize === fallbackSize
    ? [exactSize]
    : [exactSize, fallbackSize]
}

function isRetryableSizeError(error: unknown) {
  return error instanceof AppError &&
    error.code === 'OPENAI_REQUEST_FAILED' &&
    typeof error.message === 'string' &&
    /size|resolution|dimensions/i.test(error.message)
}

async function callOpenAiResponsesApi(body: JsonRecord, signal: AbortSignal | null = null) {
  const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: signal ?? undefined,
  })

  const rawPayload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const payload = parseJsonResponse<OpenAiErrorPayload>(rawPayload)
    throw new AppError(
      'OPENAI_REQUEST_FAILED',
      payload.error?.message || 'OpenAI request failed.',
      response.status >= 400 && response.status < 600 ? response.status : 502,
      {
        provider: 'openai',
        provider_code: payload.error?.code ?? null,
        provider_type: payload.error?.type ?? null,
      },
    )
  }

  return parseJsonResponse<OpenAiResponsesPayload>(rawPayload)
}

async function callOpenAiImagesJsonApi(path: string, body: JsonRecord, signal: AbortSignal) {
  const response = await fetch(`${OPENAI_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  const rawPayload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const payload = parseJsonResponse<OpenAiErrorPayload>(rawPayload)
    throw new AppError(
      'OPENAI_REQUEST_FAILED',
      payload.error?.message || 'OpenAI image request failed.',
      response.status >= 400 && response.status < 600 ? response.status : 502,
      {
        provider: 'openai',
        provider_code: payload.error?.code ?? null,
        provider_type: payload.error?.type ?? null,
      },
    )
  }

  return parseJsonResponse<OpenAiImagesPayload>(rawPayload)
}

async function callOpenAiImagesFormApi(path: string, body: FormData, signal: AbortSignal) {
  const response = await fetch(`${OPENAI_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
    },
    body,
    signal,
  })

  const rawPayload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const payload = parseJsonResponse<OpenAiErrorPayload>(rawPayload)
    throw new AppError(
      'OPENAI_REQUEST_FAILED',
      payload.error?.message || 'OpenAI image request failed.',
      response.status >= 400 && response.status < 600 ? response.status : 502,
      {
        provider: 'openai',
        provider_code: payload.error?.code ?? null,
        provider_type: payload.error?.type ?? null,
      },
    )
  }

  return parseJsonResponse<OpenAiImagesPayload>(rawPayload)
}

function extractGeneratedImageOutput(response: OpenAiResponsesPayload) {
  const outputItems = Array.isArray(response.output) ? response.output : []
  const imageOutput = outputItems.find((item) => item?.type === 'image_generation_call' && typeof item?.result === 'string')

  if (!imageOutput || typeof imageOutput.result !== 'string' || !imageOutput.result.trim()) {
    throw new AppError('OPENAI_RESPONSE_INVALID', 'OpenAI did not return an image result.', 502)
  }

  return imageOutput
}

function extractImageApiOutput(response: OpenAiImagesPayload) {
  const outputItems = Array.isArray(response.data) ? response.data : []
  const imageOutput = outputItems.find((item) => typeof item?.b64_json === 'string')

  if (!imageOutput || typeof imageOutput.b64_json !== 'string' || !imageOutput.b64_json.trim()) {
    throw new AppError('OPENAI_RESPONSE_INVALID', 'OpenAI did not return an image result.', 502)
  }

  return imageOutput
}

function extractCaptionOutput(response: OpenAiResponsesPayload) {
  const outputText = typeof response.output_text === 'string'
    ? response.output_text.trim()
    : ''

  if (outputText) {
    return outputText
  }

  const textChunks = (Array.isArray(response.output) ? response.output : [])
    .flatMap((item) => {
      const content = item?.content

      return Array.isArray(content)
        ? content
        : []
    })
    .map((contentItem) => typeof contentItem?.text === 'string' ? contentItem.text.trim() : '')
    .filter(Boolean)

  if (textChunks.length > 0) {
    return textChunks.join('\n').trim()
  }

  throw new AppError('OPENAI_RESPONSE_INVALID', 'OpenAI did not return caption text.', 502)
}

function toInputImageContent(imageUrl: string) {
  return {
    type: 'input_image',
    image_url: imageUrl,
  }
}

function canConfigureImageInputFidelity(model: string) {
  return !model.trim().toLowerCase().startsWith('gpt-image-2')
}

function shouldUseDirectImagesApi(model: string) {
  const normalizedModel = model.trim().toLowerCase()

  return normalizedModel.startsWith('gpt-image-') ||
    normalizedModel === 'chatgpt-image-latest'
}

function buildImageApiPrompt(instructions: string, userPrompt: string) {
  return [instructions, userPrompt]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
}

function getReferenceImageFileName(index: number, contentType: string) {
  const normalizedContentType = contentType.toLowerCase()
  const extension = normalizedContentType.includes('webp')
    ? 'webp'
    : normalizedContentType.includes('jpeg') || normalizedContentType.includes('jpg')
      ? 'jpg'
      : 'png'

  return `reference-${index + 1}.${extension}`
}

async function fetchReferenceImageBlob(imageUrl: string, index: number, signal: AbortSignal) {
  const response = await fetch(imageUrl, { signal })

  if (!response.ok) {
    throw new AppError(
      'OPENAI_REFERENCE_IMAGE_FETCH_FAILED',
      'Unable to prepare a reference image for generation.',
      502,
    )
  }

  const blob = await response.blob()
  const contentType = response.headers.get('content-type') || blob.type || 'image/png'

  return {
    blob,
    fileName: getReferenceImageFileName(index, contentType),
  }
}

async function generatePostImageWithImagesApi(params: {
  model: string
  instructions: string
  userPrompt: string
  referenceImageUrls: string[]
  sizeCandidate: string
  quality: string
  signal: AbortSignal
}) {
  const prompt = buildImageApiPrompt(params.instructions, params.userPrompt)
  const response = params.referenceImageUrls.length > 0
    ? await callOpenAiImagesFormApi(
      '/images/edits',
      await buildImageEditFormData(
        params.model,
        prompt,
        params.sizeCandidate,
        params.quality,
        params.referenceImageUrls,
        params.signal,
      ),
      params.signal,
    )
    : await callOpenAiImagesJsonApi('/images/generations', {
      model: params.model,
      prompt,
      size: params.sizeCandidate,
      quality: params.quality,
      background: 'opaque',
    }, params.signal)
  const imageOutput = extractImageApiOutput(response)
  const parsedSize = parseSizeLabel(params.sizeCandidate)

  return {
    model: params.model,
    responseId: typeof response.id === 'string' ? response.id : null,
    imageBase64: imageOutput.b64_json,
    revisedPrompt: typeof imageOutput.revised_prompt === 'string'
      ? imageOutput.revised_prompt
      : null,
    outputWidth: parsedSize.width,
    outputHeight: parsedSize.height,
    requestedSize: params.sizeCandidate,
    usage: typeof response.usage === 'object' && response.usage !== null
      ? response.usage
      : null,
  }
}

async function buildImageEditFormData(
  model: string,
  prompt: string,
  sizeCandidate: string,
  quality: string,
  referenceImageUrls: string[],
  signal: AbortSignal,
) {
  const formData = new FormData()
  const referenceImages = await Promise.all(
    referenceImageUrls.map((imageUrl, index) => fetchReferenceImageBlob(imageUrl, index, signal)),
  )

  formData.set('model', model)
  formData.set('prompt', prompt)
  formData.set('size', sizeCandidate)
  formData.set('quality', quality)
  formData.set('background', 'opaque')

  for (const referenceImage of referenceImages) {
    formData.append('image[]', referenceImage.blob, referenceImage.fileName)
  }

  return formData
}

async function generatePostImageWithResponsesApi(params: {
  model: string
  instructions: string
  userPrompt: string
  referenceImageUrls: string[]
  sizeCandidate: string
  quality: string
  signal: AbortSignal
}) {
  const response = await callOpenAiResponsesApi({
    model: params.model,
    instructions: params.instructions,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: params.userPrompt,
          },
          ...params.referenceImageUrls.map(toInputImageContent),
        ],
      },
    ],
    tool_choice: {
      type: 'image_generation',
    },
    tools: [
      {
        type: 'image_generation',
        size: params.sizeCandidate,
        quality: params.quality,
        background: 'opaque',
        ...(params.referenceImageUrls.length > 0 && canConfigureImageInputFidelity(params.model)
          ? { input_fidelity: 'high' }
          : {}),
      },
    ],
  }, params.signal)
  const imageOutput = extractGeneratedImageOutput(response)
  const parsedSize = parseSizeLabel(params.sizeCandidate)

  return {
    model: params.model,
    responseId: typeof response.id === 'string' ? response.id : null,
    imageBase64: imageOutput.result,
    revisedPrompt: typeof imageOutput.revised_prompt === 'string'
      ? imageOutput.revised_prompt
      : null,
    outputWidth: parsedSize.width,
    outputHeight: parsedSize.height,
    requestedSize: params.sizeCandidate,
    usage: typeof response.usage === 'object' && response.usage !== null
      ? response.usage
      : null,
  }
}

export async function generatePostImage(params: {
  instructions: string
  userPrompt: string
  referenceImageUrls: string[]
  requestedWidth: number
  requestedHeight: number
}) : Promise<OpenAiGeneratedImage> {
  const model = getOpenAiImageModel()
  const quality = getOpenAiImageQuality()
  const sizeCandidates = buildImageSizeCandidates(params.requestedWidth, params.requestedHeight)
  let lastError: unknown = null

  for (const sizeCandidate of sizeCandidates) {
    try {
      return await withOpenAiImageTimeout(async (signal) => {
        if (shouldUseDirectImagesApi(model)) {
          return generatePostImageWithImagesApi({
            model,
            instructions: params.instructions,
            userPrompt: params.userPrompt,
            referenceImageUrls: params.referenceImageUrls,
            sizeCandidate,
            quality,
            signal,
          })
        }

        return generatePostImageWithResponsesApi({
          model,
          instructions: params.instructions,
          userPrompt: params.userPrompt,
          referenceImageUrls: params.referenceImageUrls,
          sizeCandidate,
          quality,
          signal,
        })
      })
    } catch (error) {
      lastError = error

      if (!isRetryableSizeError(error) || sizeCandidate === sizeCandidates.at(-1)) {
        throw error
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AppError('OPENAI_REQUEST_FAILED', 'OpenAI image generation failed.', 502)
}

export async function generateCaption(params: {
  instructions: string
  userPrompt: string
}) : Promise<OpenAiGeneratedCaption> {
  const response = await callOpenAiResponsesApi({
    model: getOpenAiCaptionModel(),
    instructions: params.instructions,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: params.userPrompt,
          },
        ],
      },
    ],
  })

  return {
    responseId: typeof response.id === 'string' ? response.id : null,
    caption: extractCaptionOutput(response),
    usage: typeof response.usage === 'object' && response.usage !== null
      ? response.usage
      : null,
  }
}
