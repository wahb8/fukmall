import { AppError } from './errors.ts'
import { createRequestClient } from './supabase.ts'

export async function requireAuthenticatedUser(request: Request) {
  const authorizationHeader = request.headers.get('Authorization')

  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing bearer token.', 401)
  }

  const client = createRequestClient(authorizationHeader)
  const { data, error } = await client.auth.getUser()

  if (error || !data.user) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401)
  }

  return {
    user: data.user,
    client,
  }
}
