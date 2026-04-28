import { useState } from 'react'
import logoConceptTransparent from '../assets/logo concept-transparent.png'
import { useAuth } from '../auth/authContext'
import { AuthModal } from '../components/site/AuthModal'
import { navigateTo } from '../navigation'

export function LandingPage({
  initialAuthMode = null,
  initialAuthRedirectPath = '/app',
}) {
  const auth = useAuth()
  const [authModalMode, setAuthModalMode] = useState(
    !auth.isAuthenticated ? initialAuthMode : null,
  )

  async function handleSignOut() {
    try {
      await auth.signOut()
    } catch (error) {
      console.error('Failed to sign out', error)
    }
  }

  function handleAuthModalClose() {
    setAuthModalMode(null)

    if (initialAuthMode) {
      navigateTo('/', { replace: true })
    }
  }

  function handlePrimaryCta() {
    if (auth.isAuthenticated) {
      navigateTo('/app')
      return
    }

    setAuthModalMode('signup')
  }

  return (
    <main className="app-shell landing-shell" id="top">
      <div className="landing-frame">
        <header className="landing-nav" aria-label="Primary navigation">
          <a className="landing-brand" href="#top" aria-label="Kryopic home">
            <img className="landing-brand-mark" src={logoConceptTransparent} alt="" />
            <span className="landing-brand-name">Kryopic</span>
          </a>

          <div className="landing-nav-actions">
            <button
              className="landing-pricing-button"
              type="button"
              onClick={() => navigateTo('/pricing')}
            >
              Pricing
            </button>

            {auth.isAuthenticated ? (
              <>
                <button
                  className="landing-nav-button landing-nav-button-ghost"
                  type="button"
                  onClick={() => navigateTo('/app')}
                >
                  Open app
                </button>

                <button
                  className="landing-nav-button landing-nav-button-solid"
                  type="button"
                  onClick={handleSignOut}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <button
                  className="landing-nav-button landing-nav-button-ghost"
                  type="button"
                  onClick={() => setAuthModalMode('login')}
                >
                  Log in
                </button>

                <button
                  className="landing-nav-button landing-nav-button-solid"
                  type="button"
                  onClick={() => setAuthModalMode('signup')}
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1 className="landing-title">
              Create your <span className="landing-title-nowrap">entire week&apos;s</span> posts{' '}
              <span className="landing-title-nowrap">in one</span> sitting.
            </h1>
            <p className="landing-subhead">
              A focused tool for clean, fast visuals.
            </p>

            <div className="landing-hero-actions">
              <button
                className="landing-primary-cta"
                type="button"
                onClick={handlePrimaryCta}
              >
                Get started
              </button>

              <a className="landing-secondary-cta" href="#preview">
                Preview
              </a>
            </div>
          </div>

          <div
            className="landing-hero-visual"
            id="preview"
            role="img"
            aria-label="Product preview"
          >
            <div className="landing-visual-stack">
              <div className="landing-visual-glow" aria-hidden="true" />

              <div className="landing-preview-shell" aria-hidden="true">
                <div className="landing-preview-chrome">
                  <span />
                  <span />
                  <span />
                </div>

                <div className="landing-preview-layout">
                  <div className="landing-preview-rail">
                    <span className="landing-preview-tool landing-preview-tool-active" />
                    <span className="landing-preview-tool" />
                    <span className="landing-preview-tool" />
                    <span className="landing-preview-tool" />
                  </div>

                  <div className="landing-preview-workspace">
                    <div className="landing-preview-panel landing-preview-panel-top" />
                    <div className="landing-preview-panel landing-preview-panel-bottom" />

                    <div className="landing-preview-stage-card">
                      <div className="landing-preview-tag-row">
                        <span className="landing-preview-tag" />
                        <span className="landing-preview-tag landing-preview-tag-short" />
                      </div>

                      <div className="landing-preview-artboard">
                        <span className="landing-preview-block landing-preview-block-small" />
                        <span className="landing-preview-block landing-preview-block-large" />
                        <span className="landing-preview-block landing-preview-block-medium" />
                        <span className="landing-preview-line" />
                        <span className="landing-preview-line landing-preview-line-short" />

                        <div className="landing-preview-chip-row">
                          <span className="landing-preview-chip" />
                          <span className="landing-preview-chip" />
                          <span className="landing-preview-chip landing-preview-chip-short" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
      <AuthModal
        isOpen={authModalMode !== null}
        mode={authModalMode ?? 'login'}
        redirectPath={initialAuthRedirectPath}
        onClose={handleAuthModalClose}
      />
    </main>
  )
}
