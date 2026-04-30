import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { AppError } from '../_shared/errors.ts'
import { errorResponse, methodNotAllowed, ok, optionsResponse, parseJsonBody } from '../_shared/http.ts'
import { createAdminClient } from '../_shared/supabase.ts'

interface GenerationJobStatusRequest {
  job_id: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertUuid(value: string, fieldName: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400)
  }
}

async function loadAssistantMessageForJob(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  chatId: string,
  jobId: string,
) {
  const { data, error } = await adminClient
    .from('chat_messages')
    .select('id, role, message_type, content_text, metadata, created_at')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .in('message_type', ['generation_result', 'error'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new AppError('MESSAGE_LOOKUP_FAILED', 'Failed to load generation message state.', 500)
  }

  return (data ?? []).find((message) => (
    message?.metadata?.generation_job_id === jobId
  )) ?? null
}

async function createSignedGeneratedPostPreviewUrl(
  adminClient: ReturnType<typeof createAdminClient>,
  bucketName: string | null,
  storagePath: string | null,
) {
  if (!bucketName || !storagePath) {
    return null
  }

  const { data, error } = await adminClient.storage
    .from(bucketName)
    .createSignedUrl(storagePath, 60 * 60)

  if (error || !data?.signedUrl) {
    throw new AppError('STORAGE_SIGN_FAILED', 'Failed to create a signed generated post URL.', 500)
  }

  return data.signedUrl
}

async function loadGeneratedPostForJob(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  job: {
    status: string
    output_post_id?: string | null
  },
) {
  if (job.status !== 'completed' || !job.output_post_id) {
    return null
  }

  const { data, error } = await adminClient
    .from('generated_posts')
    .select(`
      id,
      user_id,
      chat_id,
      source_message_id,
      status,
      prompt_text,
      caption_text,
      bucket_name,
      image_storage_path,
      width,
      height,
      metadata,
      created_at,
      updated_at
    `)
    .eq('id', job.output_post_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new AppError('POST_LOOKUP_FAILED', 'Failed to load generated post state.', 500)
  }

  if (!data) {
    return null
  }

  const previewUrl = await createSignedGeneratedPostPreviewUrl(
    adminClient,
    data.bucket_name,
    data.image_storage_path,
  )

  return {
    ...data,
    preview_url: previewUrl,
    previewUrl,
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
    const body = await parseJsonBody<GenerationJobStatusRequest>(request)
    const jobId = body.job_id?.trim()

    if (!jobId) {
      throw new AppError('VALIDATION_ERROR', 'job_id is required.', 400)
    }

    assertUuid(jobId, 'job_id')

    const adminClient = createAdminClient()
    const { data: job, error: jobError } = await adminClient
      .from('generation_jobs')
      .select(`
        id,
        user_id,
        chat_id,
        source_message_id,
        business_profile_id,
        output_post_id,
        status,
        input_prompt,
        requested_width,
        requested_height,
        provider,
        model,
        error_message,
        queued_at,
        started_at,
        completed_at,
        request_payload,
        response_payload,
        created_at,
        updated_at
      `)
      .eq('id', jobId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (jobError) {
      throw new AppError('JOB_LOOKUP_FAILED', 'Failed to load generation job.', 500)
    }

    if (!job) {
      throw new AppError('NOT_FOUND', 'Generation job not found.', 404)
    }

    const [
      assistantMessage,
      generatedPost,
    ] = await Promise.all([
      ['completed', 'failed'].includes(job.status)
        ? loadAssistantMessageForJob(adminClient, user.id, job.chat_id, job.id)
        : Promise.resolve(null),
      loadGeneratedPostForJob(adminClient, user.id, job),
    ])

    return ok({
      job,
      assistant_message: assistantMessage,
      generated_post: generatedPost,
      poll_after_ms: job.status === 'pending' ? 1500 : 2500,
    })
  } catch (error) {
    return errorResponse(error)
  }
})
