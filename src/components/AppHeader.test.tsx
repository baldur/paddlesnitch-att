import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

// AuthNav is a client component that calls useRouter()/fetch on mount, neither
// of which exist in this render context — stub it so we can test AppHeader's
// own markup in isolation.
vi.mock('@/components/AuthNav', () => ({ default: () => <span>AUTHNAV</span> }))

import AppHeader from './AppHeader'

describe('AppHeader', () => {
  it('header row wraps on narrow viewports instead of overlapping (#100)', () => {
    // The reported bug: on a ~426px mobile viewport the breadcrumb and the nav
    // collide because the header never wrapped. The fix is `flex-wrap` on the
    // header element — assert it stays there.
    const html = renderToStaticMarkup(<AppHeader breadcrumb={<span>CLUBS</span>} />)
    expect(html).toContain('<header')
    expect(html).toContain('flex-wrap')
  })

  it('renders the breadcrumb, any extra nav children, and AuthNav last', () => {
    const html = renderToStaticMarkup(
      <AppHeader breadcrumb={<span>BREADCRUMB</span>}>
        <a href="/x">EXTRA</a>
      </AppHeader>,
    )
    expect(html).toContain('BREADCRUMB')
    expect(html).toContain('EXTRA')
    expect(html).toContain('AUTHNAV')
    // AuthNav is always the right-most nav item.
    expect(html.indexOf('EXTRA')).toBeLessThan(html.indexOf('AUTHNAV'))
  })
})
