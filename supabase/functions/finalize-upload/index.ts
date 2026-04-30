import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { AppError } from '../_shared/errors.ts'
import { errorResponse, methodNotAllowed, ok, optionsResponse, parseJsonBody } from '../_shared/http.ts'
import { getActiveSubscriptionWithPlan } from '../_shared/plans.ts'
import {
  assertAllowedUploadMimeType,
  assertAllowedUploadSize,
  assertOwnedOptimizedStoragePath,
  assertOwnedStoragePath,
  assertSupportedUploadAssetKind,
  getBucketForAssetKind,
  normalizeUploadMimeType,
  type SupportedUploadAssetKind,
} from '../_shared/storage.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import {
  assertAssetUploadAllowed,
  assertStorageAllowed,
  getOrCreateUsagePeriod,
  recordUsageEvent,
} from '../_shared/usage.ts'

interface FinalizeUploadRequest {
  asset_kind: string
  bucket_name: string
  storage_path: string
  original_file_name?: string | null
  chat_id?: string | null
  width?: number | null
  height?: number | null
  optimized_bucket_name?: string | null
  optimized_storage_path?: string | null
  optimized_width?: number | null
  optimized_height?: number | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertUuid(value: string, fieldName: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400)
  }
}

function normalizeDimension(value: number | null | undefined, fieldName: string) {
  if (value == null) {
    return null
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a positive integer when provided.`, 400)
  }

  return value
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function firstPositiveIntegerValue(...values: unknown[]) {
  for (const value of values) {
    const parsedValue = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN

    if (Number.isInteger(parsedValue) && parsedValue > 0) {
      return parsedValue
    }
  }

  return 0
}

async function readStorageObjectMetadata(
  adminClient: ReturnType<typeof createAdminClient>,
  bucketName: string,
  storagePath: string,
  fallbackFileName: string,
) {
  const objectInfo = await adminClient.storage.from(bucketName).info(storagePath)

  if (objectInfo.error || !objectInfo.data) {
    throw new AppError('UPLOAD_NOT_FOUND', 'Uploaded file not found. Try uploading again.', 404)
  }

  const objectData = objectInfo.data as Record<string, unknown>
  const objectMetadata = typeof objectData.metadata === 'object' && objectData.metadata !== null
    ? objectData.metadata as Record<string, unknown>
    : {}
  const rawMimeType = firstStringValue(
    objectData.contentType,
    objectData.content_type,
    objectMetadata.mimetype,
    objectMetadata.mimeType,
    objectMetadata.contentType,
    objectMetadata.content_type,
  ).toLowerCase()
  const mimeType = normalizeUploadMimeType(rawMimeType, fallbackFileName)
  const fileSizeBytes = firstPositiveIntegerValue(
    objectData.size,
    objectData.contentLength,
    objectData.content_length,
    objectMetadata.size,
    objectMetadata.contentLength,
    objectMetadata.content_length,
  )

  return {
    mimeType,
    fileSizeBytes,
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

async function removeUploadedObject(
  adminClient: ReturnType<typeof createAdminClient>,
  bucketName: string,
  storagePath: string,
) {
  const { error } = await adminClient.storage.from(bucketName).remove([storagePath])

  if (error) {
    console.error('Failed to remove uploaded object after finalize failure', error)
  }
}

async function removeUploadedObjects(
  adminClient: ReturnType<typeof createAdminClient>,
  objects: Array<{ bucketName: string, storagePath: string }>,
) {
  for (const object of objects) {
    await removeUploadedObject(adminClient, object.bucketName, object.storagePath)
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
    const body = await parseJsonBody<FinalizeUploadRequest>(request)
    const assetKind = body.asset_kind?.trim()
    const bucketName = body.bucket_name?.trim()
    const originalFileName = body.original_file_name?.trim() || null

    if (!assetKind) {
      throw new AppError('VALIDATION_ERROR', 'asset_kind is required.', 400)
    }

    if (!bucketName) {
      throw new AppError('VALIDATION_ERROR', 'bucket_name is required.', 400)
    }

    if (!body.storage_path?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'storage_path is required.', 400)
    }

    assertSupportedUploadAssetKind(assetKind)
    assertChatContext(assetKind, body.chat_id)

    if (body.chat_id) {
      assertUuid(body.chat_id, 'chat_id')
    }

    const expectedBucketName = getBucketForAssetKind(assetKind)

    if (bucketName !== expectedBucketName) {
      throw new AppError('VALIDATION_ERROR', 'bucket_name does not match the supplied asset kind.', 400)
    }

    const storagePath = assertOwnedStoragePath(user.id, assetKind, body.storage_path)
    const width = normalizeDimension(body.width, 'width')
    const height = normalizeDimension(body.height, 'height')
    const optimizedBucketName = body.optimized_bucket_name?.trim() || null
    const optimizedStoragePath = body.optimized_storage_path?.trim()
      ? assertOwnedOptimizedStoragePath(user.id, assetKind, body.optimized_storage_path)
      : null
    const optimizedWidth = normalizeDimension(body.optimized_width, 'optimized_width')
    const optimizedHeight = normalizeDimension(body.optimized_height, 'optimized_height')

    if (optimizedBucketName !== null && optimizedBucketName !== expectedBucketName) {
      throw new AppError('VALIDATION_ERROR', 'optimized_bucket_name does not match the supplied asset kind.', 400)
    }

    if ((optimizedBucketName && !optimizedStoragePath) || (!optimizedBucketName && optimizedStoragePath)) {
      throw new AppError('VALIDATION_ERROR', 'optimized upload bucket and path must be provided together.', 400)
    }

    if ((optimizedWidth && !optimizedHeight) || (!optimizedWidth && optimizedHeight)) {
      throw new AppError('VALIDATION_ERROR', 'optimized image width and height must be provided together.', 400)
    }

    const adminClient = createAdminClient()

    if (body.chat_id) {
      await assertOwnedActiveChat(adminClient, user.id, body.chat_id)
    }

    const { data: existingAsset, error: existingAssetError } = await adminClient
      .from('uploaded_assets')
      .select('*')
      .eq('user_id', user.id)
      .eq('bucket_name', bucketName)
      .eq('storage_path', storagePath)
      .maybeSingle()

    if (existingAssetError) {
      throw new AppError('ASSET_LOOKUP_FAILED', 'Failed to load uploaded asset metadata.', 500)
    }

    if (existingAsset) {
      return ok({
        asset: existingAsset,
        already_finalized: true,
      })
    }

    const originalObject = await readStorageObjectMetadata(
      adminClient,
      bucketName,
      storagePath,
      originalFileName ?? storagePath,
    )
    const mimeType = originalObject.mimeType
    const fileSizeBytes = originalObject.fileSizeBytes

    assertAllowedUploadMimeType(mimeType)
    assertAllowedUploadSize(assetKind, fileSizeBytes)

    const optimizedObject = optimizedBucketName && optimizedStoragePath
      ? await readStorageObjectMetadata(
        adminClient,
        optimizedBucketName,
        optimizedStoragePath,
        optimizedStoragePath,
      )
      : null

    if (optimizedObject) {
      if (optimizedObject.mimeType !== 'image/webp') {
        throw new AppError('VALIDATION_ERROR', 'Optimized upload must be a WEBP image.', 400)
      }

      if (optimizedObject.fileSizeBytes <= 0 || optimizedObject.fileSizeBytes >= fileSizeBytes) {
        throw new AppError('VALIDATION_ERROR', 'Optimized upload must be smaller than the original file.', 400)
      }
    }

    const subscription = await getActiveSubscriptionWithPlan(adminClient, user.id)
    const usagePeriod = await getOrCreateUsagePeriod(adminClient, user.id, subscription)
    const totalStorageBytes = fileSizeBytes + (optimizedObject?.fileSizeBytes ?? 0)

    assertAssetUploadAllowed(subscription, usagePeriod)
    assertStorageAllowed(subscription, usagePeriod, totalStorageBytes)

    const { data: asset, error: assetError } = await adminClient
      .from('uploaded_assets')
      .insert({
        user_id: user.id,
        chat_id: body.chat_id ?? null,
        asset_kind: assetKind,
        bucket_name: bucketName,
        storage_path: storagePath,
        original_file_name: originalFileName,
        mime_type: mimeType,
        file_size_bytes: fileSizeBytes,
        width,
        height,
        optimized_bucket_name: optimizedBucketName,
        optimized_storage_path: optimizedStoragePath,
        optimized_mime_type: optimizedObject?.mimeType ?? null,
        optimized_file_size_bytes: optimizedObject?.fileSizeBytes ?? null,
        optimized_width: optimizedObject ? optimizedWidth : null,
        optimized_height: optimizedObject ? optimizedHeight : null,
      })
      .select('*')
      .single()

    if (assetError || !asset) {
      await removeUploadedObjects(adminClient, [
        { bucketName, storagePath },
        ...(optimizedBucketName && optimizedStoragePath ? [{ bucketName: optimizedBucketName, storagePath: optimizedStoragePath }] : []),
      ])
      throw new AppError('ASSET_CREATE_FAILED', 'Failed to save uploaded asset metadata.', 500)
    }

    try {
      await recordUsageEvent(adminClient, {
        userId: user.id,
        usagePeriodId: usagePeriod.id,
        eventType: 'storage_upload',
        resourceType: 'uploaded_asset',
        resourceId: asset.id,
        quantity: 1,
        storageBytesDelta: totalStorageBytes,
        metadata: {
          asset_kind: assetKind,
          bucket_name: bucketName,
          optimized_storage_path: optimizedStoragePath,
        },
      })
    } catch (error) {
      await adminClient.from('uploaded_assets').delete().eq('id', asset.id).eq('user_id', user.id)
      await removeUploadedObjects(adminClient, [
        { bucketName, storagePath },
        ...(optimizedBucketName && optimizedStoragePath ? [{ bucketName: optimizedBucketName, storagePath: optimizedStoragePath }] : []),
      ])
      throw error
    }

    return ok({
      asset,
    })
  } catch (error) {
    return errorResponse(error)
  }
})
