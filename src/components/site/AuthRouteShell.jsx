import logoConceptTransparent from '../../assets/logo concept-transparent.png'
import { AssetImage } from '../ui/AssetImage'
import { navigateTo } from '../../navigation'

export function AuthRouteShell({
  title,
  description,
  children = null,
  actions = null,
}) {
  return (
    <main className="app-shell auth-route-shell">
      <section className="auth-route-card">
        <button
          className="auth-route-brand"
          type="button"
          onClick={() => navigateTo('/')}
        >
          <AssetImage
            className="landing-brand-mark"
            src={logoConceptTransparent}
            alt=""
            aria-hidden="true"
            fit="contain"
          />
          <span className="landing-brand-name">Kryopic</span>
        </button>

        <div className="auth-route-copy">
          <h1 className="auth-route-title">{title}</h1>
          {description ? <p className="auth-route-description">{description}</p> : null}
        </div>

        {children}

        {actions ? <div className="auth-route-actions">{actions}</div> : null}
      </section>
    </main>
  )
}
