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

    const assistantMessage = ['completed', 'failed'].includes(job.status)
      ? await loadAssistantMessageForJob(adminClient, user.id, job.chat_id, job.id)
      : null

    return ok({
      job,
      assistant_message: assistantMessage,
      poll_after_ms: job.status === 'pending' ? 1500 : 2500,
    })
  } catch (error) {
    return errorResponse(error)
  }
})
