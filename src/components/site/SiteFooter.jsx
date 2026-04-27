import logoConceptTransparent from '../../assets/logo concept-transparent.png'
import { navigateTo } from '../../navigation'

const FOOTER_LINKS = [
  { label: 'Terms', href: '#' },
  { label: 'Privacy', href: '#' },
  { label: 'Contact', href: '#' },
  { label: 'Pricing', href: '/pricing', internal: true },
]

const SOCIAL_LINKS = [
  { label: 'Instagram', href: '#' },
  { label: 'X', href: '#' },
  { label: 'LinkedIn', href: '#' },
]

function handleFooterLinkClick(event, link) {
  if (link.internal) {
    event.preventDefault()
    navigateTo(link.href)
    return
  }

  if (link.href === '#') {
    event.preventDefault()
  }
}

function handleBrandClick(event) {
  event.preventDefault()
  navigateTo('/')
}

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer-shell">
        <div className="site-footer-brand">
          <a
            className="site-footer-brand-link"
            href="/"
            aria-label="Kryopic home"
            onClick={handleBrandClick}
          >
            <img className="site-footer-brand-mark" src={logoConceptTransparent} alt="" />
            <span className="site-footer-brand-name">Kryopic</span>
          </a>

          <p className="site-footer-tagline">
            Focused tools for creating polished weekly content without the usual friction.
          </p>
        </div>

        <nav className="site-footer-group" aria-label="Footer links">
          <span className="site-footer-group-title">Links</span>
          <ul className="site-footer-links">
            {FOOTER_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  className="site-footer-link"
                  href={link.href}
                  onClick={(event) => handleFooterLinkClick(event, link)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="site-footer-group" aria-label="Social links">
          <span className="site-footer-group-title">Social</span>
          <ul className="site-footer-links">
            {SOCIAL_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  className="site-footer-link"
                  href={link.href}
                  onClick={(event) => handleFooterLinkClick(event, link)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
