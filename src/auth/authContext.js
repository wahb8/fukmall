import { createContext, useContext } from 'react'

export const SUPABASE_CONFIG_ERROR =
  'Supabase auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'

const defaultAsyncAction = async () => {
  throw new Error(SUPABASE_CONFIG_ERROR)
}

export const defaultAuthContextValue = {
  status: 'unconfigured',
  isLoading: false,
  isConfigured: false,
  isAuthenticated: false,
  user: null,
  session: null,
  isPasswordRecovery: false,
  signUp: defaultAsyncAction,
  signInWithPassword: defaultAsyncAction,
  signInWithGoogle: defaultAsyncAction,
  sendPasswordResetEmail: defaultAsyncAction,
  updatePassword: defaultAsyncAction,
  signOut: defaultAsyncAction,
  clearPasswordRecovery: () => {},
}

export const AuthContext = createContext(defaultAuthContextValue)

export function useAuth() {
  return useContext(AuthContext)
}
