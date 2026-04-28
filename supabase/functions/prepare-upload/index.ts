import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { AppError } from '../_shared/errors.ts'
import { errorResponse, methodNotAllowed, ok, optionsResponse, parseJsonBody } from '../_shared/http.ts'
import { getActiveSubscriptionWithPlan } from '../_shared/plans.ts'
import {
  assertAllowedUploadMimeType,
  assertAllowedUploadSize,
  assertSupportedUploadAssetKind,
  buildStoragePath,
  getBucketForAssetKind,
  type SupportedUploadAssetKind,
} from '../_shared/storage.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import {
  assertAssetUploadAllowed,
  assertStorageAllowed,
  getOrCreateUsagePeriod,
} from '../_shared/usage.ts'

interface PrepareUploadRequest {
  asset_kind: string
  file_name: string
  mime_type: string
  file_size_bytes: number
  chat_id?: string | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertUuid(value: string, fieldName: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400)
  }
}

async function assertOwnedActiveChat(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  chatId: string,
) {
  const { data, error } = await adminClient
    .from('chats')
    .select('id, status')
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
    throw new AppError('CHAT_NOT_ACTIVE', 'Uploads are only allowed for active chats.', 400)
  }
}

function assertChatContext(assetKind: SupportedUploadAssetKind, chatId?: string | null) {
  if ((assetKind === 'prompt_attachment' || assetKind === 'chat_attachment') && !chatId) {
    throw new AppError('VALIDATION_ERROR', 'chat_id is required for chat attachments.', 400)
  }
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
    const body = await parseJsonBody<PrepareUploadRequest>(request)
    const assetKind = body.asset_kind?.trim()
    const fileName = body.file_name?.trim()
    const mimeType = body.mime_type?.trim().toLowerCase()

    if (!assetKind) {
      throw new AppError('VALIDATION_ERROR', 'asset_kind is required.', 400)
    }

    if (!fileName) {
      throw new AppError('VALIDATION_ERROR', 'file_name is required.', 400)
    }

    if (!mimeType) {
      throw new AppError('VALIDATION_ERROR', 'mime_type is required.', 400)
    }

    assertSupportedUploadAssetKind(assetKind)
    assertAllowedUploadMimeType(mimeType)
    assertAllowedUploadSize(assetKind, body.file_size_bytes)
    assertChatContext(assetKind, body.chat_id)

    if (body.chat_id) {
      assertUuid(body.chat_id, 'chat_id')
    }

    const adminClient = createAdminClient()

    if (body.chat_id) {
      await assertOwnedActiveChat(adminClient, user.id, body.chat_id)
    }

    const subscription = await getActiveSubscriptionWithPlan(adminClient, user.id)
    const usagePeriod = await getOrCreateUsagePeriod(adminClient, user.id, subscription)

    assertAssetUploadAllowed(subscription, usagePeriod)
    assertStorageAllowed(subscription, usagePeriod, body.file_size_bytes)

    const bucketName = getBucketForAssetKind(assetKind)
    const storagePath = buildStoragePath(user.id, assetKind, fileName)
    const signedUpload = await adminClient.storage
      .from(bucketName)
      .createSignedUploadUrl(storagePath)

    if (signedUpload.error || !signedUpload.data) {
      throw new AppError('SIGNED_UPLOAD_FAILED', 'Failed to prepare the upload.', 500)
    }

    return ok({
      upload: {
        asset_kind: assetKind,
        bucket_name: bucketName,
        storage_path: storagePath,
        token: signedUpload.data.token,
      },
      usage: {
        period_start: usagePeriod.period_start,
        period_end: usagePeriod.period_end,
        asset_upload_count: usagePeriod.asset_upload_count,
        asset_upload_limit: subscription.plan.monthly_asset_upload_limit,
        storage_bytes_used: usagePeriod.storage_bytes_used,
        storage_limit_bytes: subscription.plan.monthly_storage_limit_bytes,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
})
