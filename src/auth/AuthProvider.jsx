import { useEffect, useMemo, useState } from 'react'
import { buildPath, getSafeRedirectPath } from '../navigation'
import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from '../lib/supabaseBrowser'
import { AuthContext, SUPABASE_CONFIG_ERROR } from './authContext'

const PASSWORD_RECOVERY_STORAGE_KEY = 'fukmall.auth.password-recovery'

function buildAbsoluteUrl(pathname) {
  if (typeof window === 'undefined') {
    return pathname
  }

  return new URL(pathname, window.location.origin).toString()
}

function buildAuthCallbackUrl(redirectPath = '/app') {
  return buildAbsoluteUrl(buildPath('/auth/callback', {
    next: getSafeRedirectPath(redirectPath, '/app'),
  }))
}

function buildPasswordResetUrl() {
  return buildAbsoluteUrl('/auth/reset')
}

function readPasswordRecoveryFlag() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === 'true'
}

function writePasswordRecoveryFlag(value) {
  if (typeof window === 'undefined') {
    return
  }

  if (value) {
    window.sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, 'true')
    return
  }

  window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY)
}

export function AuthProvider({ children }) {
  const supabase = getSupabaseBrowserClient()
  const { isConfigured } = getSupabaseBrowserConfig()
  const [state, setState] = useState(() => ({
    status: isConfigured ? 'loading' : 'unconfigured',
    session: null,
    user: null,
    isPasswordRecovery: readPasswordRecoveryFlag(),
  }))

  useEffect(() => {
    if (!supabase || !isConfigured) {
      return undefined
    }

    let isMounted = true

    async function loadInitialSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      if (error) {
        console.error('Failed to load the initial Supabase auth session', error)
      }

      const session = data.session ?? null

      setState((currentState) => ({
        ...currentState,
        status: 'ready',
        session,
        user: session?.user ?? null,
        isPasswordRecovery: currentState.isPasswordRecovery && Boolean(session?.user),
      }))
    }

    void loadInitialSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        writePasswordRecoveryFlag(true)
      } else if (event === 'SIGNED_OUT') {
        writePasswordRecoveryFlag(false)
      }

      setState((currentState) => ({
        ...currentState,
        status: 'ready',
        session,
        user: session?.user ?? null,
        isPasswordRecovery:
          event === 'PASSWORD_RECOVERY'
            ? true
            : event === 'SIGNED_OUT'
              ? false
              : currentState.isPasswordRecovery && Boolean(session?.user),
      }))
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase, isConfigured])

  const contextValue = useMemo(() => {
    const assertConfigured = () => {
      if (!supabase || !isConfigured) {
        throw new Error(SUPABASE_CONFIG_ERROR)
      }
    }

    return {
      status: state.status,
      isLoading: state.status === 'loading',
      isConfigured,
      isAuthenticated: Boolean(state.user),
      user: state.user,
      session: state.session,
      isPasswordRecovery: state.isPasswordRecovery,
      async signUp({ email, password, name, redirectPath = '/app' }) {
        assertConfigured()

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              name,
            },
            emailRedirectTo: buildAuthCallbackUrl(redirectPath),
          },
        })

        if (error) {
          throw error
        }

        return {
          user: data.user,
          session: data.session,
          needsEmailConfirmation: !data.session,
        }
      },
      async signInWithPassword({ email, password }) {
        assertConfigured()

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          throw error
        }

        return data
      },
      async signInWithGoogle({ redirectPath = '/app' } = {}) {
        assertConfigured()

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: buildAuthCallbackUrl(redirectPath),
          },
        })

        if (error) {
          throw error
        }

        return data
      },
      async sendPasswordResetEmail({ email }) {
        assertConfigured()

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: buildPasswordResetUrl(),
        })

        if (error) {
          throw error
        }

        return data
      },
      async updatePassword({ password }) {
        assertConfigured()

        const { data, error } = await supabase.auth.updateUser({
          password,
        })

        if (error) {
          throw error
        }

        writePasswordRecoveryFlag(false)

        setState((currentState) => ({
          ...currentState,
          isPasswordRecovery: false,
        }))

        return data
      },
      async signOut() {
        assertConfigured()

        const { error } = await supabase.auth.signOut()

        if (error) {
          throw error
        }
      },
      clearPasswordRecovery() {
        writePasswordRecoveryFlag(false)

        setState((currentState) => ({
          ...currentState,
          isPasswordRecovery: false,
        }))
      },
    }
  }, [isConfigured, state, supabase])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}
