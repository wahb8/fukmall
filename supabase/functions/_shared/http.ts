import { AppError, isAppError } from './errors.ts'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-signature',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  })
}

export function ok(data: unknown, status = 200): Response {
  return jsonResponse({ ok: true, data }, status)
}

export function accepted(data: unknown): Response {
  return ok(data, 202)
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS,
  })
}

export function methodNotAllowed(allowedMethods: string[]): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: `Allowed methods: ${allowedMethods.join(', ')}`,
      },
    },
    405,
  )
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  } catch {
    throw new AppError('INVALID_JSON', 'Request body must be valid JSON.', 400)
  }
}

export function errorResponse(error: unknown): Response {
  if (isAppError(error)) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      error.status,
    )
  }

  console.error(error)

  return jsonResponse(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    },
    500,
  )
}
