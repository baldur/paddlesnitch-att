'use client'

// An always-visible "Report an issue" entry point for the header nav. The
// floating FeedbackWidget button was low-contrast and easy to miss after the
// header restyle (#102), so this surfaces a plain REPORT link alongside the
// other nav links. It doesn't own the modal — it dispatches a window event that
// the globally-mounted FeedbackWidget listens for, keeping modal state in one
// place.
export default function FeedbackTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('att:open-feedback'))}
      className="tt-nav-link"
    >
      REPORT
    </button>
  )
}
