// Product analytics via CloudWatch Embedded Metric Format (EMF).
//
// We emit one specially-shaped JSON line per event. In the Lambda runtime,
// CloudWatch automatically extracts a `Count` metric (dimension: Event) from
// these lines — no metric filters, no log-parsing pipeline, no extra IAM (the
// function already writes to CloudWatch Logs). Locally / in tests it just prints
// JSON, which is a harmless no-op for metrics.
//
// Cardinality discipline: the ONLY metric dimension is `Event` (a small fixed
// allowlist), so metric cost stays bounded. High-cardinality context like the
// page path is attached as a plain property — queryable in CloudWatch Logs
// Insights, but it does NOT create per-path metrics.

export const NAMESPACE = 'Paddlesnitch/App'

export type MetricEvent =
  | 'pageview'
  | 'signup'
  | 'login'
  | 'upload'
  | 'trial_create'
  | 'course_create'

export const METRIC_EVENTS: readonly MetricEvent[] = [
  'pageview', 'signup', 'login', 'upload', 'trial_create', 'course_create',
]

export function isMetricEvent(v: unknown): v is MetricEvent {
  return typeof v === 'string' && (METRIC_EVENTS as readonly string[]).includes(v)
}

// Build the EMF document for an event (exported for testing).
export function buildEmf(event: MetricEvent, props: Record<string, string> = {}) {
  return {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: NAMESPACE,
        Dimensions: [['Event']],
        Metrics: [{ Name: 'Count', Unit: 'Count' }],
      }],
    },
    Event: event,
    Count: 1,
    ...props,
  }
}

// Emit a single event. Never throws — analytics must never break a request.
export function emitMetric(event: MetricEvent, props: Record<string, string> = {}): void {
  try {
    console.log(JSON.stringify(buildEmf(event, props)))
  } catch {
    // swallow — a metric emission failure must not surface to the caller
  }
}
