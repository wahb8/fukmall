import { describe, expect, it } from 'vitest'
import { AppError, isAppError } from './errors.ts'

describe('AppError', () => {
  it('stores the provided code, status, and details', () => {
    const error = new AppError('BAD_REQUEST', 'Nope', 422, {
      field: 'email',
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AppError')
    expect(error.code).toBe('BAD_REQUEST')
    expect(error.message).toBe('Nope')
    expect(error.status).toBe(422)
    expect(error.details).toEqual({
      field: 'email',
    })
  })

  it('defaults the status to 400', () => {
    const error = new AppError('VALIDATION_ERROR', 'Missing field')

    expect(error.status).toBe(400)
  })
})

describe('isAppError', () => {
  it('returns true for AppError instances', () => {
    expect(isAppError(new AppError('NOPE', 'Wrong'))).toBe(true)
  })

  it('returns false for non-AppError values', () => {
    expect(isAppError(new Error('Wrong'))).toBe(false)
    expect(isAppError('wrong')).toBe(false)
    expect(isAppError(null)).toBe(false)
  })
})
