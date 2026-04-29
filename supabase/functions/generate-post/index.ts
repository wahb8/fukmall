import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { AppError } from '../_shared/errors.ts'
import { errorResponse, methodNotAllowed, ok, optionsResponse, parseJsonBody } from '../_shared/http.ts'
import { generateCaption, generatePostImage, resolveRequestedImageCanvas } from '../_shared/openai.ts'
import {
  buildAssistantSummaryText,
  buildCaptionInstructions,
  buildCaptionUserPrompt,
  buildImageGenerationInstructions,
  buildImageGenerationUserPrompt,
  buildSafeGenerationErrorMessage,
} from '../_shared/promptTemplates.ts'
import { getActiveSubscriptionWithPlan } from '../_shared/plans.ts'
import { buildGeneratedPostStoragePath } from '../_shared/storage.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import {
  assertEditAllowed,
  assertGenerationAllowed,
  assertStorageAllowed,
  getOrCreateUsagePeriod,
  recordUsageEvent,
} from '../_shared/usage.ts'

interface GeneratePostRequest {
  chat_id: string
  business_profile_id?: string | null
  prompt: string
  width: number
  height: number
  aspect_ratio?: string | null
  attachment_asset_ids?: string[]
}

interface ChatRow {
  id: string
  user_id: string
  business_profile_id: string | null
  title: string
  status: string
}

interface BusinessProfileRow {
  id: string
  user_id: string
  name: string
  business_type: string
  brand_description: string | null
  tone_preferences: string[]
  style_preferences: string[]
  brand_colors: string[]
  is_default: boolean
}

interface UploadedAssetRow {
  id: string
  user_id: string
  business_profile_id: string | null
  chat_id: string | null
  asset_kind: string
  bucket_name: string
  storage_path: string
  original_file_name: string | null
  mime_type: string
  file_size_bytes: number
  width: number | null
  height: number | null
}

interface GeneratedPostRow {
  id: string
  user_id: string
  chat_id: string
  source_message_id: string | null
  business_profile_id: string | null
  previous_post_id: string | null
  version_group_id: string
  version_number: number
  status: string
  prompt_text: string | null
  caption_text: string | null
  bucket_name: string | null
  image_storage_path: string | null
  width: number
  height: number
  metadata: Record<string, unknown>
  created_at: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SUPPORTED_REFERENCE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
])

function assertUuid(value: string, fieldName: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400)
  }
}

function normalizeAttachmentIds(attachmentAssetIds?: string[]) {
  const normalized = Array.isArray(attachmentAssetIds)
    ? [...new Set(attachmentAssetIds.filter(Boolean))]
    : []

  if (normalized.length > 5) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A maximum of 5 attachment assets is allowed per generation request.',
      400,
    )
  }

  normalized.forEach((assetId) => assertUuid(assetId, 'attachment_asset_ids'))

  return normalized
}

function normalizeBrandColors(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function getRequestedAspectRatioLabel(width: number, height: number, explicitAspectRatio?: string | null) {
  const normalizedExplicitAspectRatio = explicitAspectRatio?.trim()

  if (normalizedExplicitAspectRatio) {
    return normalizedExplicitAspectRatio
  }

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

function isAutoTitle(title: string) {
  const normalizedTitle = title.trim().toLowerCase()
  return normalizedTitle === 'untitled chat' || normalizedTitle === 'new file'
}

function buildChatTitleFromPrompt(prompt: string, fallbackTitle = 'Untitled chat') {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim()

  if (!normalizedPrompt) {
    return fallbackTitle
  }

  return normalizedPrompt.length > 56
    ? `${normalizedPrompt.slice(0, 53).trimEnd()}...`
    : normalizedPrompt
}

function buildImageUploadBytes(imageBase64: string) {
  try {
    return Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0))
  } catch {
    throw new AppError('OPENAI_RESPONSE_INVALID', 'Generated image payload could not be decoded.', 502)
  }
}

async function createSignedStorageUrl(
  adminClient: ReturnType<typeof createAdminClient>,
  bucketName: string,
  storagePath: string,
  expiresInSeconds = 10 * 60,
) {
  const { data, error } = await adminClient.storage
    .from(bucketName)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw new AppError('STORAGE_SIGN_FAILED', 'Failed to create a signed asset URL.', 500)
  }

  return data.signedUrl
}

async function loadChat(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  chatId: string,
) {
  const { data, error } = await adminClient
    .from('chats')
    .select('id, user_id, business_profile_id, title, status')
    .eq('id', chatId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new AppError('CHAT_LOOKUP_FAILED', 'Failed to load chat.', 500)
  }

  if (!data) {
    throw new AppError('NOT_FOUND', 'Chat not found.', 404)
  }

  if (data.status !== 'active') {
    throw new AppError('CHAT_NOT_ACTIVE', 'Generations are only allowed in active chats.', 400)
  }

  return data as ChatRow
}

async function loadBusinessProfile(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  chat: ChatRow,
  requestedBusinessProfileId?: string | null,
) {
  if (
    requestedBusinessProfileId &&
    chat.business_profile_id &&
    requestedBusinessProfileId !== chat.business_profile_id
  ) {
    throw new AppError(
      'CHAT_BUSINESS_PROFILE_MISMATCH',
      'The supplied business profile does not match the chat context.',
      400,
    )
  }

  const targetBusinessProfileId = requestedBusinessProfileId ?? chat.business_profile_id ?? null
  const baseQuery = adminClient
    .from('business_profiles')
    .select(`
      id,
      user_id,
      name,
      business_type,
      brand_description,
      tone_preferences,
      style_preferences,
      brand_colors,
      is_default
    `)
    .eq('user_id', userId)

  const { data, error } = targetBusinessProfileId
    ? await baseQuery.eq('id', targetBusinessProfileId).maybeSingle()
    : await baseQuery.eq('is_default', true).maybeSingle()

  if (error) {
    throw new AppError('BUSINESS_PROFILE_LOOKUP_FAILED', 'Failed to load business profile.', 500)
  }

  if (!data) {
    throw new AppError(
      'BUSINESS_PROFILE_REQUIRED',
      'A business profile is required before generating a post.',
      400,
    )
  }

  if (!chat.business_profile_id) {
    const { error: updateChatError } = await adminClient
      .from('chats')
      .update({
        business_profile_id: data.id,
      })
      .eq('id', chat.id)
      .eq('user_id', userId)

    if (updateChatError) {
      throw new AppError('CHAT_UPDATE_FAILED', 'Failed to attach the business profile to the chat.', 500)
    }
  }

  return {
    id: data.id,
    user_id: data.user_id,
    name: data.name,
    business_type: data.business_type,
    brand_description: data.brand_description ?? null,
    tone_preferences: normalizeStringArray(data.tone_preferences),
    style_preferences: normalizeStringArray(data.style_preferences),
    brand_colors: normalizeBrandColors(data.brand_colors),
    is_default: Boolean(data.is_default),
  } satisfies BusinessProfileRow
}

async function loadAttachmentAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  chatId: string,
  attachmentAssetIds: string[],
) {
  if (attachmentAssetIds.length === 0) {
    return []
  }

  const { data, error } = await adminClient
    .from('uploaded_assets')
    .select(`
      id,
      user_id,
      business_profile_id,
      chat_id,
      asset_kind,
      bucket_name,
      storage_path,
      original_file_name,
      mime_type,
      file_size_bytes,
      width,
      height
    `)
    .eq('user_id', userId)
    .in('id', attachmentAssetIds)

  if (error) {
    throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load attachment assets.', 500)
  }

  if ((data?.length ?? 0) !== attachmentAssetIds.length) {
    throw new AppError('ATTACHMENT_NOT_FOUND', 'One or more attachment assets were not found.', 404)
  }

  const assets = data as UploadedAssetRow[]

  for (const asset of assets) {
    if (asset.chat_id && asset.chat_id !== chatId) {
      throw new AppError(
        'ATTACHMENT_CHAT_MISMATCH',
        'One or more attachment assets do not belong to the active chat.',
        400,
      )
    }
  }

  return attachmentAssetIds
    .map((assetId) => assets.find((asset) => asset.id === assetId))
    .filter((asset): asset is UploadedAssetRow => Boolean(asset))
}

async function loadBrandReferenceAssets(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  businessProfileId: string,
) {
  const { data, error } = await adminClient
    .from('uploaded_assets')
    .select(`
      id,
      user_id,
      business_profile_id,
      chat_id,
      asset_kind,
      bucket_name,
      storage_path,
      original_file_name,
      mime_type,
      file_size_bytes,
      width,
      height
    `)
    .eq('user_id', userId)
    .eq('business_profile_id', businessProfileId)
    .eq('asset_kind', 'brand_reference')
    .order('created_at', { ascending: false })
    .limit(4)

  if (error) {
    throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load business reference images.', 500)
  }

  return (data ?? []) as UploadedAssetRow[]
}

async function loadLatestGeneratedPost(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  chatId: string,
) {
  const { data, error } = await adminClient
    .from('generated_posts')
    .select(`
      id,
      user_id,
      chat_id,
      source_message_id,
      business_profile_id,
      previous_post_id,
      version_group_id,
      version_number,
      status,
      prompt_text,
      caption_text,
      bucket_name,
      image_storage_path,
      width,
      height,
      metadata,
      created_at
    `)
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AppError('POST_LOOKUP_FAILED', 'Failed to load previous generated posts.', 500)
  }

  return data as GeneratedPostRow | null
}

async function uploadGeneratedImage(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  postId: string,
  imageBase64: string,
) {
  const imageBytes = buildImageUploadBytes(imageBase64)
  const storagePath = buildGeneratedPostStoragePath(userId, postId, '.png')
  const { error } = await adminClient.storage
    .from('generated-posts')
    .upload(storagePath, imageBytes, {
      contentType: 'image/png',
      upsert: false,
    })

  if (error) {
    throw new AppError('STORAGE_UPLOAD_FAILED', 'Failed to store the generated image.', 500)
  }

  return {
    bucketName: 'generated-posts',
    storagePath,
    imageBytesLength: imageBytes.byteLength,
  }
}

async function removeStoredGeneratedImage(
  adminClient: ReturnType<typeof createAdminClient>,
  bucketName: string | null | undefined,
  storagePath: string | null | undefined,
) {
  if (!bucketName || !storagePath) {
    return
  }

  const { error } = await adminClient.storage.from(bucketName).remove([storagePath])

  if (error) {
    console.error('Failed to remove generated image after rollback', error)
  }
}

async function updateGenerationJob(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  jobId: string,
  values: Record<string, unknown>,
) {
  const { error } = await adminClient
    .from('generation_jobs')
    .update(values)
    .eq('id', jobId)
    .eq('user_id', userId)

  if (error) {
    throw new AppError('JOB_UPDATE_FAILED', 'Failed to update generation job.', 500)
  }
}

async function insertAssistantErrorMessage(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  chatId: string,
  jobId: string,
  errorCode: string,
) {
  const { error } = await adminClient
    .from('chat_messages')
    .insert({
      chat_id: chatId,
      user_id: userId,
      role: 'assistant',
      message_type: 'error',
      content_text: buildSafeGenerationErrorMessage(errorCode),
      metadata: {
        generation_job_id: jobId,
        error_code: errorCode,
      },
    })

  if (error) {
    console.error('Failed to write generation error message', error)
  }
}

async function createGenerationArtifacts(params: {
  adminClient: ReturnType<typeof createAdminClient>
  userId: string
  chatId: string
  businessProfileId: string
  jobId: string
  userMessageId: string
  prompt: string
  caption: string
  generationMode: 'initial' | 'edit'
  requestedWidth: number
  requestedHeight: number
  resolvedWidth: number
  resolvedHeight: number
  requestedAspectRatioLabel: string
  latestGeneratedPost: GeneratedPostRow | null
  imageBase64: string
  imageModel: string
  imageResponseId: string | null
  captionResponseId: string | null
  imageUsage: Record<string, unknown> | null
  captionUsage: Record<string, unknown> | null
  revisedPrompt: string | null
  attachmentAssetIds: string[]
  brandReferenceAssetIds: string[]
}) {
  const postId = crypto.randomUUID()
  const generationModeStatus = params.generationMode === 'edit' ? 'edited' : 'draft'
  const uploadResult = await uploadGeneratedImage(
    params.adminClient,
    params.userId,
    postId,
    params.imageBase64,
  )
  let generatedPostId: string | null = null

  try {
    const generatedPostPayload = {
      id: postId,
      user_id: params.userId,
      chat_id: params.chatId,
      source_message_id: params.userMessageId,
      business_profile_id: params.businessProfileId,
      previous_post_id: params.latestGeneratedPost?.id ?? null,
      version_group_id: params.latestGeneratedPost?.version_group_id ?? postId,
      version_number: (params.latestGeneratedPost?.version_number ?? 0) + 1,
      status: generationModeStatus,
      prompt_text: params.prompt,
      caption_text: params.caption,
      bucket_name: uploadResult.bucketName,
      image_storage_path: uploadResult.storagePath,
      width: params.resolvedWidth,
      height: params.resolvedHeight,
      metadata: {
        generation_mode: params.generationMode,
        requested_width: params.requestedWidth,
        requested_height: params.requestedHeight,
        requested_aspect_ratio: params.requestedAspectRatioLabel,
        openai_image_model: params.imageModel,
        openai_image_response_id: params.imageResponseId,
        openai_caption_response_id: params.captionResponseId,
        openai_image_usage: params.imageUsage,
        openai_caption_usage: params.captionUsage,
        revised_prompt: params.revisedPrompt,
        attachment_asset_ids: params.attachmentAssetIds,
        brand_reference_asset_ids: params.brandReferenceAssetIds,
        used_fallback_reference_assets: false,
        fallback_reference_assets_deferred: params.brandReferenceAssetIds.length === 0,
      },
    }

    const { data: generatedPost, error: generatedPostError } = await params.adminClient
      .from('generated_posts')
      .insert(generatedPostPayload)
      .select('*')
      .single()

    if (generatedPostError || !generatedPost) {
      throw new AppError('POST_CREATE_FAILED', 'Failed to store the generated post.', 500)
    }

    generatedPostId = generatedPost.id

    const { data: assistantMessage, error: assistantMessageError } = await params.adminClient
      .from('chat_messages')
      .insert({
        chat_id: params.chatId,
        user_id: params.userId,
        role: 'assistant',
        message_type: 'generation_result',
        content_text: buildAssistantSummaryText(params.generationMode),
        metadata: {
          generated_post_id: generatedPost.id,
          caption_text: params.caption,
          generation_job_id: params.jobId,
          generation_mode: params.generationMode,
        },
      })
      .select('id, role, message_type, content_text, metadata, created_at')
      .single()

    if (assistantMessageError || !assistantMessage) {
      throw new AppError('MESSAGE_CREATE_FAILED', 'Failed to store the assistant response.', 500)
    }

    return {
      generatedPost: generatedPost as GeneratedPostRow,
      assistantMessage,
      imageBytesLength: uploadResult.imageBytesLength,
      bucketName: uploadResult.bucketName,
      storagePath: uploadResult.storagePath,
    }
  } catch (error) {
    if (generatedPostId) {
      await params.adminClient.from('generated_posts').delete().eq('id', generatedPostId).eq('user_id', params.userId)
    }

    await removeStoredGeneratedImage(params.adminClient, uploadResult.bucketName, uploadResult.storagePath)
    throw error
  }
}

async function recordSuccessfulUsage(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  usagePeriodId: string,
  generationMode: 'initial' | 'edit',
  generatedPostId: string,
  jobId: string,
  imageBytesLength: number,
) {
  await recordUsageEvent(adminClient, {
    userId,
    usagePeriodId,
    eventType: 'storage_upload',
    resourceType: 'generated_post',
    resourceId: generatedPostId,
    quantity: 1,
    storageBytesDelta: imageBytesLength,
    metadata: {
      generation_job_id: jobId,
    },
  })

  try {
    await recordUsageEvent(adminClient, {
      userId,
      usagePeriodId,
      eventType: generationMode === 'edit' ? 'edit' : 'generation',
      resourceType: 'generated_post',
      resourceId: generatedPostId,
      quantity: 1,
      metadata: {
        generation_job_id: jobId,
      },
    })
  } catch (error) {
    try {
      await recordUsageEvent(adminClient, {
        userId,
        usagePeriodId,
        eventType: 'storage_delete',
        resourceType: 'generated_post',
        resourceId: generatedPostId,
        quantity: 1,
        storageBytesDelta: -imageBytesLength,
        metadata: {
          generation_job_id: jobId,
          rollback_reason: 'generation_usage_write_failed',
        },
      })
    } catch (rollbackError) {
      console.error('Failed to roll back generated-post storage usage after generation usage failure', rollbackError)
    }

    throw error
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return optionsResponse()
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  const adminClient = createAdminClient()
  let userIdForFailure: string | null = null
  let chatIdForFailure: string | null = null
  let jobIdForFailure: string | null = null

  try {
    const { user } = await requireAuthenticatedUser(request)
    userIdForFailure = user.id
    const body = await parseJsonBody<GeneratePostRequest>(request)
    const prompt = body.prompt?.trim()

    if (!prompt) {
      throw new AppError('VALIDATION_ERROR', 'Prompt is required.', 400)
    }

    if (prompt.length > 4000) {
      throw new AppError('VALIDATION_ERROR', 'Prompt must be 4000 characters or fewer.', 400)
    }

    assertUuid(body.chat_id, 'chat_id')
    chatIdForFailure = body.chat_id

    if (!Number.isInteger(body.width) || body.width <= 0 || body.width > 4096) {
      throw new AppError('VALIDATION_ERROR', 'Width must be an integer between 1 and 4096.', 400)
    }

    if (!Number.isInteger(body.height) || body.height <= 0 || body.height > 4096) {
      throw new AppError('VALIDATION_ERROR', 'Height must be an integer between 1 and 4096.', 400)
    }

    if (body.business_profile_id) {
      assertUuid(body.business_profile_id, 'business_profile_id')
    }

    const attachmentAssetIds = normalizeAttachmentIds(body.attachment_asset_ids)
    const requestedCanvas = resolveRequestedImageCanvas(body.width, body.height)
    const chat = await loadChat(adminClient, user.id, body.chat_id)
    const businessProfile = await loadBusinessProfile(
      adminClient,
      user.id,
      chat,
      body.business_profile_id ?? null,
    )
    const attachmentAssets = await loadAttachmentAssets(
      adminClient,
      user.id,
      chat.id,
      attachmentAssetIds,
    )
    const latestGeneratedPost = await loadLatestGeneratedPost(adminClient, user.id, chat.id)
    const generationMode = latestGeneratedPost ? 'edit' : 'initial'

    const subscription = await getActiveSubscriptionWithPlan(adminClient, user.id)
    const usagePeriod = await getOrCreateUsagePeriod(adminClient, user.id, subscription)

    if (generationMode === 'edit') {
      assertEditAllowed(subscription, usagePeriod)
      assertStorageAllowed(subscription, usagePeriod, 20 * 1024 * 1024)
    } else {
      assertGenerationAllowed(subscription, usagePeriod)
      assertStorageAllowed(subscription, usagePeriod, 20 * 1024 * 1024)
    }

    const brandReferenceAssets = await loadBrandReferenceAssets(adminClient, user.id, businessProfile.id)
    const usableBrandReferenceAssets = brandReferenceAssets
      .filter((asset) => SUPPORTED_REFERENCE_MIME_TYPES.has(asset.mime_type))
    const usableAttachmentAssets = attachmentAssets
      .filter((asset) => SUPPORTED_REFERENCE_MIME_TYPES.has(asset.mime_type))

    const userMessagePayload = {
      chat_id: chat.id,
      user_id: user.id,
      role: 'user',
      message_type: generationMode === 'edit' ? 'edit_request' : 'generation_request',
      content_text: prompt,
      metadata: {
        width: body.width,
        height: body.height,
        requested_aspect_ratio: getRequestedAspectRatioLabel(body.width, body.height, body.aspect_ratio),
        attachment_asset_ids: attachmentAssetIds,
        business_profile_id: businessProfile.id,
        brand_reference_asset_ids: usableBrandReferenceAssets.map((asset) => asset.id),
        fallback_reference_assets_deferred: usableBrandReferenceAssets.length === 0,
      },
    }
    const { data: userMessage, error: userMessageError } = await adminClient
      .from('chat_messages')
      .insert(userMessagePayload)
      .select('id, role, message_type, content_text, metadata, created_at')
      .single()

    if (userMessageError || !userMessage) {
      throw new AppError('MESSAGE_CREATE_FAILED', 'Failed to store generation request.', 500)
    }

    if (isAutoTitle(chat.title)) {
      const suggestedTitle = buildChatTitleFromPrompt(prompt)
      await adminClient
        .from('chats')
        .update({
          title: suggestedTitle,
        })
        .eq('id', chat.id)
        .eq('user_id', user.id)
    }

    const { data: job, error: jobError } = await adminClient
      .from('generation_jobs')
      .insert({
        user_id: user.id,
        chat_id: chat.id,
        source_message_id: userMessage.id,
        business_profile_id: businessProfile.id,
        status: 'pending',
        input_prompt: prompt,
        requested_width: body.width,
        requested_height: body.height,
        provider: 'openai',
        request_payload: {
          attachment_asset_ids: attachmentAssetIds,
          business_profile_id: businessProfile.id,
          requested_aspect_ratio: getRequestedAspectRatioLabel(body.width, body.height, body.aspect_ratio),
          generation_mode: generationMode,
          fallback_reference_assets_deferred: usableBrandReferenceAssets.length === 0,
        },
      })
      .select('id, status, queued_at, source_message_id')
      .single()

    if (jobError || !job) {
      await adminClient
        .from('chat_messages')
        .delete()
        .eq('id', userMessage.id)
        .eq('user_id', user.id)
      throw new AppError('JOB_CREATE_FAILED', 'Failed to create generation job.', 500)
    }

    jobIdForFailure = job.id

    await updateGenerationJob(adminClient, user.id, job.id, {
      status: 'processing',
      started_at: new Date().toISOString(),
    })

    const brandReferenceImageUrls = await Promise.all(
      usableBrandReferenceAssets
        .map((asset) => createSignedStorageUrl(adminClient, asset.bucket_name, asset.storage_path)),
    )
    const attachmentImageUrls = await Promise.all(
      usableAttachmentAssets
        .map((asset) => createSignedStorageUrl(adminClient, asset.bucket_name, asset.storage_path)),
    )
    const inputImageUrls = generationMode === 'edit' && latestGeneratedPost?.bucket_name && latestGeneratedPost?.image_storage_path
      ? [
        await createSignedStorageUrl(
          adminClient,
          latestGeneratedPost.bucket_name,
          latestGeneratedPost.image_storage_path,
        ),
        ...attachmentImageUrls,
      ]
      : [
        ...brandReferenceImageUrls,
        ...attachmentImageUrls,
      ]

    const imageInstructions = buildImageGenerationInstructions({
      businessProfile,
      userPrompt: prompt,
      requestedWidth: body.width,
      requestedHeight: body.height,
      aspectRatioLabel: getRequestedAspectRatioLabel(body.width, body.height, body.aspect_ratio),
      hasBrandReferences: brandReferenceImageUrls.length > 0,
      hasUserAttachments: attachmentImageUrls.length > 0,
      generationMode,
      previousCaption: latestGeneratedPost?.caption_text ?? null,
    })
    const imageUserPrompt = buildImageGenerationUserPrompt({
      businessProfile,
      userPrompt: prompt,
      requestedWidth: body.width,
      requestedHeight: body.height,
      aspectRatioLabel: getRequestedAspectRatioLabel(body.width, body.height, body.aspect_ratio),
      hasBrandReferences: brandReferenceImageUrls.length > 0,
      hasUserAttachments: attachmentImageUrls.length > 0,
      generationMode,
      previousCaption: latestGeneratedPost?.caption_text ?? null,
    })
    const captionInstructions = buildCaptionInstructions()
    const captionUserPrompt = buildCaptionUserPrompt({
      businessProfile,
      userPrompt: prompt,
      generationMode,
      previousCaption: latestGeneratedPost?.caption_text ?? null,
    })

    const [generatedImage, generatedCaption] = await Promise.all([
      generatePostImage({
        instructions: imageInstructions,
        userPrompt: imageUserPrompt,
        referenceImageUrls: inputImageUrls,
        requestedWidth: body.width,
        requestedHeight: body.height,
      }),
      generateCaption({
        instructions: captionInstructions,
        userPrompt: captionUserPrompt,
      }),
    ])

    const generationArtifacts = await createGenerationArtifacts({
      adminClient,
      userId: user.id,
      chatId: chat.id,
      businessProfileId: businessProfile.id,
      jobId: job.id,
      userMessageId: userMessage.id,
      prompt,
      caption: generatedCaption.caption,
      generationMode,
      requestedWidth: body.width,
      requestedHeight: body.height,
      resolvedWidth: generatedImage.outputWidth,
      resolvedHeight: generatedImage.outputHeight,
      requestedAspectRatioLabel: getRequestedAspectRatioLabel(body.width, body.height, body.aspect_ratio),
      latestGeneratedPost,
      imageBase64: generatedImage.imageBase64,
      imageModel: generatedImage.model,
      imageResponseId: generatedImage.responseId,
      captionResponseId: generatedCaption.responseId,
      imageUsage: generatedImage.usage,
      captionUsage: generatedCaption.usage,
      revisedPrompt: generatedImage.revisedPrompt,
      attachmentAssetIds,
      brandReferenceAssetIds: usableBrandReferenceAssets.map((asset) => asset.id),
    })

    try {
      await recordSuccessfulUsage(
        adminClient,
        user.id,
        usagePeriod.id,
        generationMode,
        generationArtifacts.generatedPost.id,
        job.id,
        generationArtifacts.imageBytesLength,
      )
    } catch (error) {
      await adminClient
        .from('chat_messages')
        .delete()
        .eq('id', generationArtifacts.assistantMessage.id)
        .eq('user_id', user.id)
      await adminClient
        .from('generated_posts')
        .delete()
        .eq('id', generationArtifacts.generatedPost.id)
        .eq('user_id', user.id)
      await removeStoredGeneratedImage(
        adminClient,
        generationArtifacts.bucketName,
        generationArtifacts.storagePath,
      )
      throw error
    }

    await updateGenerationJob(adminClient, user.id, job.id, {
      status: 'completed',
      model: generatedImage.model,
      output_post_id: generationArtifacts.generatedPost.id,
      completed_at: new Date().toISOString(),
      response_payload: {
        generation_mode: generationMode,
        image_model: generatedImage.model,
        image_response_id: generatedImage.responseId,
        caption_response_id: generatedCaption.responseId,
        revised_prompt: generatedImage.revisedPrompt,
        requested_size: requestedCanvas.requestedSize,
        delivered_size: `${generatedImage.outputWidth}x${generatedImage.outputHeight}`,
        fallback_reference_assets_deferred: brandReferenceImageUrls.length === 0,
      },
    })

    return ok({
      job: {
        ...job,
        status: 'completed',
        output_post_id: generationArtifacts.generatedPost.id,
      },
      user_message: userMessage,
      assistant_message: generationArtifacts.assistantMessage,
      post: generationArtifacts.generatedPost,
      generation_mode: generationMode,
      usage: {
        period_start: usagePeriod.period_start,
        period_end: usagePeriod.period_end,
        generation_count: generationMode === 'initial'
          ? usagePeriod.generation_count + 1
          : usagePeriod.generation_count,
        edit_count: generationMode === 'edit'
          ? usagePeriod.edit_count + 1
          : usagePeriod.edit_count,
        generation_limit: subscription.plan.monthly_generation_limit,
        edit_limit: subscription.plan.monthly_edit_limit,
      },
    })
  } catch (error) {
    if (userIdForFailure && chatIdForFailure && jobIdForFailure) {
      try {
        await updateGenerationJob(adminClient, userIdForFailure, jobIdForFailure, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Generation failed.',
        })
        await insertAssistantErrorMessage(
          adminClient,
          userIdForFailure,
          chatIdForFailure,
          jobIdForFailure,
          error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        )
      } catch (jobFailureError) {
        console.error('Failed to persist generation failure state', jobFailureError)
      }
    }

    return errorResponse(error)
  }
})
