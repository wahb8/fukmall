import { useState } from 'react'
import logoConceptTransparent from '../assets/logo concept-transparent.png'
import { useAuth } from '../auth/authContext'
import { AuthModal } from '../components/site/AuthModal'
import { AssetImage } from '../components/ui/AssetImage'
import { navigateTo } from '../navigation'
import './PricingPage.css'

const PRICING_TIERS = [
  {
    name: 'Free',
    badge: 'Starter',
    price: '0 KWD',
    cadence: ' / month',
    description: 'A calm way to explore the tool and build lighter one-off post runs.',
    features: [
      '5 Posts & stories per month',
      'Core Post Generation Functionality',
    ],
    footer: 'Best for trying the workflow.',
  },
  {
    name: 'Business',
    badge: 'Most flexible',
    price: '29 KWD',
    cadence: ' / month',
    description: 'For teams turning weekly ideas into a more repeatable content routine.',
    features: [
      {
        key: '30-posts',
        emphasis: '30 Posts & stories',
        suffix: ' per month',
      },
      'Everything in Free',
      'Caption and CTA Generation',
      'Accent-aware text generation for culturally authentic content',
      'Content recommendations with real-time post mockups',
      'Personalized post generation that matches brand identity',
    ],
    footer: 'Built for steady weekly output.',
    featured: true,
  },
  {
    name: 'Enterprise',
    badge: 'Custom',
    price: '49 KWD',
    cadence: ' / month',
    description: 'For larger rollouts that need more structure, support, and tailored setup.',
    features: [
      '50 Posts & stories per month',
      'Everything in Free & Business',
    ],
    footer: 'A tier for larger implementations.',
  },
]

const COMPARISON_ROWS = [
  {
    label: 'Content Delivery Speed',
    agencies: '~ 1-3 Days',
    kryopic: '~ 2-3 minutes',
  },
  {
    label: 'Monthly Price',
    agencies: '300-500 KWD/month',
    kryopic: '~ 29 KWD/month',
  },
  {
    label: 'Revision/Edits Time',
    agencies: '~ 1-2 Days',
    kryopic: 'Instant',
  },
  {
    label: '24/7 Availability',
    agencies: 'Not possible',
    kryopic: 'Possible',
  },
  {
    label: 'Communication Needed',
    agencies: 'Constant back-and-forth',
    kryopic: 'None / minimal',
  },
]

const FAQ_ITEMS = [
  {
    question: 'Can I change plans later?',
    answer: 'Yes. Plan changes can be supported from your account settings when billing is connected.',
  },
  {
    question: 'What counts as a post or story?',
    answer: 'Each generated post or story counts toward your monthly post limit.',
  },
  {
    question: 'Do I need design experience?',
    answer: 'No. Kryopic is designed to help businesses generate polished content without needing design experience.',
  },
  {
    question: 'Is payment connected yet?',
    answer: 'Not yet. This page is frontend-only for now, and checkout can be connected later.',
  },
]

function handleNavigate(event, pathname) {
  event.preventDefault()
  navigateTo(pathname)
}

export function PricingPage({
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
      navigateTo('/pricing', { replace: true })
    }
  }

  function handleGetStarted() {
    if (auth.isAuthenticated) {
      navigateTo('/app')
      return
    }

    setAuthModalMode('signup')
  }

  return (
    <main className="app-shell landing-shell pricing-shell">
      <div className="landing-frame pricing-frame">
        <header className="landing-nav" aria-label="Pricing navigation">
          <a
            className="landing-brand pricing-brand-link"
            href="/"
            aria-label="Kryopic home"
            onClick={(event) => handleNavigate(event, '/')}
          >
            <AssetImage
              className="landing-brand-mark asset-load-transparent"
              src={logoConceptTransparent}
              alt=""
              aria-hidden="true"
              fit="contain"
            />
            <span className="landing-brand-name">Kryopic</span>
          </a>

          <div className="landing-nav-actions pricing-nav-actions">
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

        <section className="pricing-page-content">
          <section className="pricing-intro pricing-enter pricing-enter-intro">
            <div className="pricing-intro-shell">
              <div className="pricing-intro-copy">
                <h1 className="pricing-intro-title">
                  Create better posts without the agency back-and-forth.
                </h1>
                <p className="pricing-intro-subhead">
                  Choose the plan that fits your content pace, then start generating posts,
                  captions, and campaign ideas in minutes.
                </p>
              </div>
            </div>
          </section>

          <section className="pricing-comparison pricing-enter pricing-enter-comparison">
            <div className="pricing-comparison-shell">
              <div className="pricing-comparison-intro">
                <span className="pricing-comparison-kicker">Agency comparison</span>
                <p className="pricing-comparison-summary">
                  See how the usual agency workflow compares to Kryopic when speed, revisions, and
                  cost all matter.
                </p>
              </div>

              <div className="pricing-comparison-scroll">
                <table className="pricing-comparison-table">
                  <thead>
                    <tr>
                      <th scope="col">Feature</th>
                      <th scope="col">Social Media Agencies</th>
                      <th scope="col">Kryopic</th>
                    </tr>
                  </thead>

                  <tbody>
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{row.agencies}</td>
                        <td className="pricing-comparison-kryopic-cell">{row.kryopic}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="pricing-hero pricing-enter pricing-enter-hero">
            <div className="pricing-copy">
              <h2 className="pricing-title">Three tiers, one calm workflow.</h2>
              <p className="pricing-subhead">
                Start simple, move into a steadier weekly system, and choose the plan that best
                matches the pace of your content workflow.
              </p>
            </div>
          </div>

          <div className="pricing-grid">
            {PRICING_TIERS.map((tier, index) => (
              <article
                key={tier.name}
                className={tier.featured
                  ? `pricing-card pricing-card-featured pricing-enter pricing-enter-card-${index + 1}`
                  : `pricing-card pricing-enter pricing-enter-card-${index + 1}`}
              >
                {tier.featured ? (
                  <span className="pricing-card-spotlight">Most popular</span>
                ) : null}
                <span className="pricing-card-badge">{tier.badge}</span>

                <header className="pricing-card-header">
                  <h2 className="pricing-card-name">{tier.name}</h2>
                  <p className="pricing-card-copy">{tier.description}</p>
                </header>

                <div className="pricing-card-price" aria-label={`${tier.name} price`}>
                  <strong>{tier.price}</strong>
                  <span>{tier.cadence}</span>
                </div>

                <ul className="pricing-card-features">
                  {tier.features.map((feature) => (
                    <li key={typeof feature === 'string' ? feature : feature.key}>
                      {typeof feature === 'string' ? (
                        feature
                      ) : (
                        <>
                          <strong>{feature.emphasis}</strong>
                          {feature.suffix}
                        </>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="pricing-card-footer">
                  <p>{tier.footer}</p>
                  <button
                    className={tier.featured ? 'landing-primary-cta pricing-card-cta' : 'landing-secondary-cta pricing-card-cta'}
                    type="button"
                    onClick={handleGetStarted}
                  >
                    Get Started
                  </button>
                </div>
              </article>
            ))}
          </div>

          <section className="pricing-faq pricing-enter pricing-enter-faq" aria-labelledby="pricing-faq-title">
            <div className="pricing-section-heading">
              <span className="pricing-section-kicker">FAQ</span>
              <h2 className="pricing-section-title" id="pricing-faq-title">
                A few quick answers before you choose a plan.
              </h2>
            </div>

            <div className="pricing-faq-grid">
              {FAQ_ITEMS.map((item) => (
                <article key={item.question} className="pricing-faq-card">
                  <h3 className="pricing-faq-question">{item.question}</h3>
                  <p className="pricing-faq-answer">{item.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="pricing-cta pricing-enter pricing-enter-cta">
            <div className="pricing-cta-shell">
              <div className="pricing-cta-copy">
                <span className="pricing-cta-kicker">Start creating</span>
                <h2 className="pricing-cta-title">Ready to create your next post?</h2>
                <p className="pricing-cta-subhead">
                  Pick the plan that fits your pace, then start generating polished content ideas
                  in minutes.
                </p>
              </div>

              <button
                className="landing-primary-cta pricing-final-cta"
                type="button"
                onClick={handleGetStarted}
              >
                Get Started
              </button>
            </div>
          </section>
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
