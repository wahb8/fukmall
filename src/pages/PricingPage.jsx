import { useState } from 'react'
import logoConceptTransparent from '../assets/logo concept-transparent.png'
import { OnboardingModal } from '../components/onboarding/OnboardingModal'
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

function handleNavigate(event, pathname) {
  event.preventDefault()
  navigateTo(pathname)
}

export function PricingPage() {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)

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
            <img className="landing-brand-mark" src={logoConceptTransparent} alt="" />
            <span className="landing-brand-name">Kryopic</span>
          </a>

          <div className="landing-nav-actions pricing-nav-actions">
            <button
              className="landing-nav-button landing-nav-button-ghost"
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
            >
              log-in
            </button>

            <button
              className="landing-nav-button landing-nav-button-solid"
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
            >
              sign-up
            </button>
          </div>
        </header>

        <section className="pricing-page-content">
          <div className="pricing-hero pricing-enter pricing-enter-hero">
            <div className="pricing-copy">
              <h1 className="pricing-title">Three tiers, one calm workflow.</h1>
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
                    onClick={() => setIsOnboardingOpen(true)}
                  >
                    Get Started
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {isOnboardingOpen ? (
        <OnboardingModal
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          onComplete={() => navigateTo('/app')}
        />
      ) : null}
    </main>
  )
}
