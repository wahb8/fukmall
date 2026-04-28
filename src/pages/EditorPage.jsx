import { useEffect, useState } from 'react'
import App from '../App'
import { useAuth } from '../auth/authContext'
import { OnboardingModal } from '../components/onboarding/OnboardingModal'
import { completeOnboarding, fetchDefaultBusinessProfile } from '../lib/onboarding'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

export function EditorPage() {
  const auth = useAuth()
  const supabase = getSupabaseBrowserClient()
  const [businessProfile, setBusinessProfile] = useState(null)
  const [isCheckingProfile, setIsCheckingProfile] = useState(Boolean(supabase && auth.isAuthenticated))
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!auth.isAuthenticated || !supabase) {
      setBusinessProfile(null)
      setIsCheckingProfile(false)
      return undefined
    }

    let isMounted = true

    async function loadBusinessProfile() {
      setIsCheckingProfile(true)

      try {
        const profile = await fetchDefaultBusinessProfile()

        if (!isMounted) {
          return
        }

        setBusinessProfile(profile)
      } catch (error) {
        console.error('Failed to load the default business profile', error)

        if (!isMounted) {
          return
        }

        setBusinessProfile(null)
      } finally {
        if (isMounted) {
          setIsCheckingProfile(false)
        }
      }
    }

    void loadBusinessProfile()

    return () => {
      isMounted = false
    }
  }, [auth.isAuthenticated, reloadKey, supabase])

  async function handleOnboardingComplete(payload) {
    await completeOnboarding(payload)
    setReloadKey((currentKey) => currentKey + 1)
  }

  return (
    <>
      <App />
      {!isCheckingProfile && supabase && auth.isAuthenticated && !businessProfile ? (
        <OnboardingModal
          isOpen
          canClose={false}
          onClose={() => {}}
          onComplete={handleOnboardingComplete}
        />
      ) : null}
    </>
  )
}
