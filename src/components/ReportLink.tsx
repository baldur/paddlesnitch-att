'use client'

// Event name shared with FeedbackWidget. The "Report an issue" trigger lives in
// the header nav (this component) but the modal state lives in FeedbackWidget
// (rendered globally from layout.tsx), so the link opens the modal by
// dispatching this custom event on `window` rather than sharing React state.
export const FEEDBACK_OPEN_EVENT = 'att:open-feedback'

// Persistent "REPORT" link in the header nav. Always visible (issue #102) — the
// old floating bottom-right button was low-contrast and overlapped Leaflet map
// controls. Styled like the other nav links (COURSES/CLUBS/ACCOUNT).
export default function ReportLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(FEEDBACK_OPEN_EVENT))}
      className="tt-nav-link"
    >
      REPORT
    </button>
  )
}
