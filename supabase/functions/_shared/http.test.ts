import { describe, expect, it, vi } from 'vitest'
import { AppError } from './errors.ts'
import {
  accepted,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  ok,
  optionsResponse,
  parseJsonBody,
} from './http.ts'

async function readJson(response: Response) {
  return response.json()
}

describe('http helpers', () => {
  it('creates JSON responses with shared headers', async () => {
    const response = jsonResponse({ hello: 'world' }, 201)

    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await readJson(response)).toEqual({ hello: 'world' })
  })

  it('wraps success payloads in ok and accepted helpers', async () => {
    const okResponse = ok({ id: '1' })
    const acceptedResponse = accepted({ id: '2' })

    expect(okResponse.status).toBe(200)
    expect(await readJson(okResponse)).toEqual({
      ok: true,
      data: { id: '1' },
    })

    expect(acceptedResponse.status).toBe(202)
    expect(await readJson(acceptedResponse)).toEqual({
      ok: true,
      data: { id: '2' },
    })
  })

  it('creates a no-content options response with cors headers', () => {
    const response = optionsResponse()

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET,POST,OPTIONS')
  })

  it('returns a structured method not allowed response', async () => {
    const response = methodNotAllowed(['POST'])

    expect(response.status).toBe(405)
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Allowed methods: POST',
      },
    })
  })

  it('parses valid JSON request bodies', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'hello' }),
      headers: {
        'content-type': 'application/json',
      },
    })

    await expect(parseJsonBody(request)).resolves.toEqual({
      prompt: 'hello',
    })
  })

  it('throws an AppError for invalid JSON bodies', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: 'not-json',
      headers: {
        'content-type': 'application/json',
      },
    })

    await expect(parseJsonBody(request)).rejects.toMatchObject({
      code: 'INVALID_JSON',
      status: 400,
    })
  })

  it('serializes AppError responses with details', async () => {
    const response = errorResponse(
      new AppError('LIMIT_EXCEEDED', 'Too many requests.', 429, {
        limit: 10,
      }),
    )

    expect(response.status).toBe(429)
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: 'LIMIT_EXCEEDED',
        message: 'Too many requests.',
        details: { limit: 10 },
      },
    })
  })

  it('hides internal details for unexpected errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = errorResponse(new Error('boom'))

    expect(response.status).toBe(500)
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    })
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
