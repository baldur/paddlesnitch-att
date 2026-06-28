import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, afterEach } from 'vitest'

import ReportLink, { FEEDBACK_OPEN_EVENT } from './ReportLink'

// The header "REPORT" link (issue #102) opens the global FeedbackWidget modal by
// dispatching FEEDBACK_OPEN_EVENT on window — the two components share no React
// state, so the event is the contract between them.
describe('ReportLink', () => {
  let container: HTMLDivElement | null = null

  afterEach(() => {
    container?.remove()
    container = null
  })

  it('dispatches FEEDBACK_OPEN_EVENT when clicked', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => { root.render(<ReportLink />) })

    let fired = false
    const onOpen = () => { fired = true }
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen)

    const button = container.querySelector('button')
    expect(button?.textContent).toBe('REPORT')

    act(() => { button?.click() })
    window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen)

    expect(fired).toBe(true)
    act(() => { root.unmount() })
  })
})
