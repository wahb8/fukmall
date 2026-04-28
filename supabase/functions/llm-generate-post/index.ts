import { AppError } from '../_shared/errors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { accepted, errorResponse, methodNotAllowed, optionsResponse, parseJsonBody } from '../_shared/http.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import { getActiveSubscriptionWithPlan } from '../_shared/plans.ts'
import { assertGenerationAllowed, getOrCreateUsagePeriod } from '../_shared/usage.ts'

interface GeneratePostRequest {
  chat_id: string
  business_profile_id?: string | null
  prompt: string
  width: number
  height: number
  attachment_asset_ids?: string[]
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return optionsResponse()
  }

  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  try {
    const { user } = await requireAuthenticatedUser(request)
    const body = await parseJsonBody<GeneratePostRequest>(request)
    const prompt = body.prompt?.trim()

    if (!prompt) {
      throw new AppError('VALIDATION_ERROR', 'Prompt is required.', 400)
    }

    if (prompt.length > 4000) {
      throw new AppError('VALIDATION_ERROR', 'Prompt must be 4000 characters or fewer.', 400)
    }

    assertUuid(body.chat_id, 'chat_id')

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
    const adminClient = createAdminClient()

    const { data: chat, error: chatError } = await adminClient
      .from('chats')
      .select('id, user_id, business_profile_id, status')
      .eq('id', body.chat_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (chatError) {
      throw new AppError('CHAT_LOOKUP_FAILED', 'Failed to load chat.', 500)
    }

    if (!chat) {
      throw new AppError('NOT_FOUND', 'Chat not found.', 404)
    }

    if (chat.status !== 'active') {
      throw new AppError('CHAT_NOT_ACTIVE', 'Generations are only allowed in active chats.', 400)
    }

    const effectiveBusinessProfileId = body.business_profile_id ?? chat.business_profile_id ?? null

    if (
      body.business_profile_id &&
      chat.business_profile_id &&
      body.business_profile_id !== chat.business_profile_id
    ) {
      throw new AppError(
        'CHAT_BUSINESS_PROFILE_MISMATCH',
        'The supplied business profile does not match the chat context.',
        400,
      )
    }

    if (effectiveBusinessProfileId) {
      const { data: businessProfile, error: businessProfileError } = await adminClient
        .from('business_profiles')
        .select('id')
        .eq('id', effectiveBusinessProfileId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (businessProfileError) {
        throw new AppError('BUSINESS_PROFILE_LOOKUP_FAILED', 'Failed to load business profile.', 500)
      }

      if (!businessProfile) {
        throw new AppError('NOT_FOUND', 'Business profile not found.', 404)
      }
    }

    if (attachmentAssetIds.length > 0) {
      const { data: assets, error: assetsError } = await adminClient
        .from('uploaded_assets')
        .select('id')
        .eq('user_id', user.id)
        .in('id', attachmentAssetIds)

      if (assetsError) {
        throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load attachment assets.', 500)
      }

      if ((assets?.length ?? 0) !== attachmentAssetIds.length) {
        throw new AppError(
          'ATTACHMENT_NOT_FOUND',
          'One or more attachment assets were not found.',
          404,
        )
      }
    }

    const subscription = await getActiveSubscriptionWithPlan(adminClient, user.id)
    const usagePeriod = await getOrCreateUsagePeriod(adminClient, user.id, subscription)

    assertGenerationAllowed(subscription, usagePeriod)

    const { data: message, error: messageError } = await adminClient
      .from('chat_messages')
      .insert({
        chat_id: chat.id,
        user_id: user.id,
        role: 'user',
        message_type: 'generation_request',
        content_text: prompt,
        metadata: {
          width: body.width,
          height: body.height,
          attachment_asset_ids: attachmentAssetIds,
          business_profile_id: effectiveBusinessProfileId,
        },
      })
      .select('id, created_at')
      .single()

    if (messageError || !message) {
      throw new AppError('MESSAGE_CREATE_FAILED', 'Failed to store generation request.', 500)
    }

    const { data: job, error: jobError } = await adminClient
      .from('generation_jobs')
      .insert({
        user_id: user.id,
        chat_id: chat.id,
        source_message_id: message.id,
        business_profile_id: effectiveBusinessProfileId,
        status: 'pending',
        input_prompt: prompt,
        requested_width: body.width,
        requested_height: body.height,
        provider: 'openai',
        request_payload: {
          attachment_asset_ids: attachmentAssetIds,
          business_profile_id: effectiveBusinessProfileId,
        },
      })
      .select('id, status, queued_at, source_message_id')
      .single()

    if (jobError || !job) {
      const { error: rollbackMessageError } = await adminClient
        .from('chat_messages')
        .delete()
        .eq('id', message.id)
        .eq('user_id', user.id)

      if (rollbackMessageError) {
        console.error('Failed to roll back orphaned generation request message', rollbackMessageError)
      }

      throw new AppError('JOB_CREATE_FAILED', 'Failed to create generation job.', 500)
    }

    return accepted({
      job,
      message,
      usage: {
        period_start: usagePeriod.period_start,
        period_end: usagePeriod.period_end,
        generation_count: usagePeriod.generation_count,
        generation_limit: subscription.plan.monthly_generation_limit,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
})
