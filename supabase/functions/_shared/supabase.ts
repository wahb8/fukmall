import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { getRequiredEnv } from './env.ts'

const supabaseUrl = getRequiredEnv('SUPABASE_URL')
const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

function baseOptions(headers?: HeadersInit) {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: headers ? { headers } : undefined,
  }
}

export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, baseOptions())
}

export function createRequestClient(authorizationHeader: string) {
  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    baseOptions({
      Authorization: authorizationHeader,
    }),
  )
}
