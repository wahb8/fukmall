import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { AppError } from '../_shared/errors.ts'
import { errorResponse, methodNotAllowed, ok, optionsResponse, parseJsonBody } from '../_shared/http.ts'
import { createAdminClient } from '../_shared/supabase.ts'

interface CancelGenerationJobRequest {
  job_id: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertUuid(value: string, fieldName: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400)
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
    const body = await parseJsonBody<CancelGenerationJobRequest>(request)
    const jobId = body.job_id?.trim()

    if (!jobId) {
      throw new AppError('VALIDATION_ERROR', 'job_id is required.', 400)
    }

    assertUuid(jobId, 'job_id')

    const adminClient = createAdminClient()
    const { data: existingJob, error: lookupError } = await adminClient
      .from('generation_jobs')
      .select('id, user_id, chat_id, status, error_message, completed_at, created_at, updated_at')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (lookupError) {
      throw new AppError('JOB_LOOKUP_FAILED', 'Failed to load generation job.', 500)
    }

    if (!existingJob) {
      throw new AppError('NOT_FOUND', 'Generation job not found.', 404)
    }

    if (!['pending', 'processing'].includes(existingJob.status)) {
      return ok({
        job: existingJob,
        canceled: existingJob.status === 'canceled',
      })
    }

    const { data: canceledJob, error: updateError } = await adminClient
      .from('generation_jobs')
      .update({
        status: 'canceled',
        completed_at: new Date().toISOString(),
        error_message: 'Generation stopped by user.',
      })
      .eq('id', existingJob.id)
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .select('id, user_id, chat_id, status, error_message, completed_at, created_at, updated_at')
      .maybeSingle()

    if (updateError) {
      throw new AppError('JOB_CANCEL_FAILED', 'Failed to stop generation.', 500)
    }

    if (!canceledJob) {
      const { data: currentJob, error: currentJobError } = await adminClient
        .from('generation_jobs')
        .select('id, user_id, chat_id, status, error_message, completed_at, created_at, updated_at')
        .eq('id', existingJob.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (currentJobError) {
        throw new AppError('JOB_LOOKUP_FAILED', 'Failed to load generation job.', 500)
      }

      if (!currentJob) {
        throw new AppError('NOT_FOUND', 'Generation job not found.', 404)
      }

      return ok({
        job: currentJob,
        canceled: currentJob.status === 'canceled',
      })
    }

    return ok({
      job: canceledJob,
      canceled: true,
    })
  } catch (error) {
    return errorResponse(error)
  }
})
