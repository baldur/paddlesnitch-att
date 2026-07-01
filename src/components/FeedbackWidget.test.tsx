// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import FeedbackWidget from './FeedbackWidget'
import FeedbackTrigger from './FeedbackTrigger'

// #102: the floating "report" button was easy to miss, so an always-visible
// header REPORT link opens the same modal via a window event. These pin the
// event contract between the two components.

let container: HTMLDivElement
let root: Root

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  container?.remove()
})

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(node) })
}

describe('FeedbackWidget ↔ header trigger (#102)', () => {
  it('opens the modal when an att:open-feedback event fires', async () => {
    await mount(<FeedbackWidget />)
    // Closed: the floating trigger shows, the form does not.
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).toContain('REPORT AN ISSUE')

    await act(async () => {
      window.dispatchEvent(new CustomEvent('att:open-feedback'))
    })
    // Open: the report form (textarea) is now mounted.
    expect(container.querySelector('textarea')).not.toBeNull()
  })

  it('the header REPORT trigger dispatches att:open-feedback', async () => {
    await mount(<FeedbackTrigger />)
    let fired = false
    const onEvt = () => { fired = true }
    window.addEventListener('att:open-feedback', onEvt)
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('REPORT')
    await act(async () => { button!.click() })
    window.removeEventListener('att:open-feedback', onEvt)
    expect(fired).toBe(true)
  })
})
