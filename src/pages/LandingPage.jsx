import logoConceptTransparent from '../assets/logo concept-transparent.png'

function navigateTo(pathname) {
  if (typeof window === 'undefined') {
    return
  }

  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function LandingPage() {
  return (
    <main className="app-shell landing-shell">
      <div className="landing-top-actions" aria-label="Authentication actions">
        <button className="action-button" type="button">
          sign-up
        </button>
        <button className="action-button" type="button">
          log-in
        </button>
      </div>

      <div className="landing-layout">
        <aside className="landing-side-panel" aria-label="Landing sidebar">
          <div className="landing-side-panel-footer">
            <button className="action-button" type="button">
              Plans
            </button>
            <button className="action-button" type="button">
              Settings
            </button>
          </div>
        </aside>

        <section className="landing-main" aria-label="Landing main area">
          <div className="landing-main-stack">
            <img
              className="landing-logo"
              src={logoConceptTransparent}
              alt="Fukmall logo concept"
            />

            <button
              className="action-button active landing-create-button"
              type="button"
              onClick={() => navigateTo('/app')}
            >
              Create
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
