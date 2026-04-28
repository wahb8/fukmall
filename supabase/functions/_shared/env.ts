import { AppError } from './errors.ts'

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)

  if (!value) {
    throw new AppError(
      'CONFIGURATION_ERROR',
      `Missing required environment variable: ${name}`,
      500,
    )
  }

  return value
}
