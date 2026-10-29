import type { AdminLlmCapacity, InferenceDevice, LlmCapacityQuery } from '../../../api/queries'
import { uuid } from '../ids'

type Metric = InferenceDevice['series'][number]['host'][string]

export function observationMetric(value: number | null, state: Metric['state'] = value == null ? 'NOT_REPORTED' : 'OBSERVED', intervalSeconds = 0): Metric {
  return { state, mean: value, min: value, max: value, observedSamples: value == null ? 0 : 1, intervalSeconds: value == null ? 0 : intervalSeconds }
}

/** Synthetic history only; no probe, reporter or real device is contacted. */
export function inferenceDeviceFixture(query: Partial<LlmCapacityQuery> = {}, now = Date.now()): InferenceDevice {
  const from = query.from ?? '2026-10-20T00:00:00.125Z'
  const to = query.to ?? '2026-10-20T00:03:00.125Z'
  const start = Date.parse(from)
  const span = (Date.parse(to) - start) / 1000
  const bucketSeconds = query.bucketSeconds ?? [60, 300, 3600, 21600, 86400].find((n) => Math.ceil(span / n) <= 1440) ?? 86400
  const buckets = Math.ceil(span / bucketSeconds)
  const active = new Set([Math.max(0, buckets - 3), Math.max(0, buckets - 2)])
  const retained = now - 90 * 86400_000
  const retention = Date.parse(to) <= retained ? 'OUTSIDE' : start < retained ? 'PARTIAL' : 'WITHIN'
  const result: InferenceDevice = {
    sourceId: query.telemetrySourceId ?? uuid(401), upstreamId: uuid(301), upstreamName: '합성 관측 원천',
    from, to, bucketSeconds, sampleIntervalSeconds: 60, retentionDays: 90,
    evidence: { retainedFrom: new Date(retained).toISOString(), retentionState: retention,
      latestObservedAt: new Date(now).toISOString(), latestReceivedAt: new Date(now).toISOString(),
      freshness: 'FRESH', samplesInWindow: active.size, expectedSamples: Math.ceil(Math.max(0, Date.parse(to) - Math.max(start, retained)) / 60_000), failedSamples: 0,
      baselineIntervals: 1, resetIntervals: 0, gapIntervals: buckets > active.size ? 1 : 0, truncated: false },
    series: Array.from({ length: buckets }, (_, index): InferenceDevice['series'][number] => {
      const pointStart = start + index * bucketSeconds * 1000
      const pointEnd = Math.min(Date.parse(to), start + (index + 1) * bucketSeconds * 1000)
      const pointRetention = pointEnd <= retained ? 'OUTSIDE' : pointStart < retained ? 'PARTIAL' : 'WITHIN'
      const reported = active.has(index) && pointStart >= retained
      const valid = reported && active.has(index - 1) && pointStart - bucketSeconds * 1000 >= retained
      return {
        from: new Date(start + index * bucketSeconds * 1000).toISOString(),
        to: new Date(Math.min(Date.parse(to), start + (index + 1) * bucketSeconds * 1000)).toISOString(),
        retentionState: pointRetention, samples: pointRetention === 'OUTSIDE' ? null : reported ? 1 : 0, failedSamples: pointRetention === 'OUTSIDE' ? null : 0,
        host: reported ? {
          cpu_load1: observationMetric(0.25),
          memory_total_bytes: observationMetric(16 * 1024 ** 3), memory_available_bytes: observationMetric(8 * 1024 ** 3),
          swap_used_bytes: observationMetric(0), gpu_utilization_percent: observationMetric(0),
          gpu_temperature_celsius: observationMetric(40), gpu_power_watts: observationMetric(20),
          gpu_memory_total_bytes: observationMetric(null, 'UNSUPPORTED'), gpu_power_limit_watts: observationMetric(null, 'UNSUPPORTED'),
        } : {},
        engines: reported ? [{ modelName: 'example/model', engineId: '0', epoch: uuid(501),
          bootId: 'example-boot', processId: 'example-process', configId: 'example-config',
          intervalState: valid ? 'VALID' : 'BASELINE', validIntervals: valid ? 1 : 0,
          baselineIntervals: valid ? 0 : 1, resetIntervals: 0, gapIntervals: 0,
          gauges: { 'vllm:num_requests_running': observationMetric(0), 'vllm:num_requests_waiting': observationMetric(0), 'vllm:kv_cache_usage_perc': observationMetric(0) },
          rates: valid ? { 'vllm:generation_tokens_total': observationMetric(20, 'OBSERVED', 60), 'vllm:num_preemptions_total': observationMetric(0, 'OBSERVED', 60) } : {},
          histogramMeans: valid ? { 'vllm:time_to_first_token_seconds': observationMetric(0.25, 'OBSERVED', 60), 'vllm:request_time_per_output_token_seconds': observationMetric(0.02, 'OBSERVED', 60) } : {},
        }] : [],
      }
    }),
  }
  result.evidence.samplesInWindow = retention === 'OUTSIDE' ? null : result.series.reduce((sum, p) => sum + (p.samples ?? 0), 0)
  result.evidence.expectedSamples = retention === 'OUTSIDE' ? null : result.evidence.expectedSamples
  result.evidence.failedSamples = retention === 'OUTSIDE' ? null : 0
  result.evidence.baselineIntervals = retention === 'OUTSIDE' ? null : result.series.reduce((sum, p) => sum + p.engines.reduce((n, e) => n + e.baselineIntervals, 0), 0)
  result.evidence.resetIntervals = retention === 'OUTSIDE' ? null : 0
  result.evidence.gapIntervals = retention === 'OUTSIDE' ? null : result.evidence.gapIntervals
  return result
}

/** Browser-only scenario input is read by the mock handler, never sent to the API. */
export function inferenceTelemetryFixture(query: Partial<LlmCapacityQuery>, scenario = 'reported', now = Date.now()): AdminLlmCapacity['telemetry'] {
  if (scenario === 'not-configured') return { status: 'NOT_CONFIGURED', device: null }
  const device = inferenceDeviceFixture(query, now)
  if (scenario === 'not-reported') {
    device.evidence.latestObservedAt = null
    device.evidence.latestReceivedAt = null
    device.evidence.freshness = 'NOT_REPORTED'
    if (device.evidence.retentionState !== 'OUTSIDE') {
      device.evidence.samplesInWindow = 0
      device.evidence.failedSamples = 0
      device.evidence.baselineIntervals = 0
      device.evidence.resetIntervals = 0
      device.evidence.gapIntervals = 0
    }
    device.series = device.series.map((point) => ({ ...point, samples: point.retentionState === 'OUTSIDE' ? null : 0, host: {}, engines: [] }))
    return { status: 'NOT_REPORTED', device }
  }
  if (scenario === 'stale') {
    device.evidence.freshness = 'STALE'
    device.evidence.latestObservedAt = device.series.filter((p) => p.samples).at(-1)?.from ?? null
    device.evidence.latestReceivedAt = device.evidence.latestObservedAt
  }
  if (scenario === 'source-failed') {
    device.series = device.series.map((point) => ({ ...point, failedSamples: point.samples,
      host: Object.fromEntries(Object.keys(point.host).map((key) => [key, observationMetric(null, 'SOURCE_FAILED')])), engines: [] }))
    device.evidence.failedSamples = device.evidence.samplesInWindow
    device.evidence.baselineIntervals = device.evidence.retentionState === 'OUTSIDE' ? null : 0
  }
  if (scenario === 'unknown') {
    device.series = device.series.map((point) => ({ ...point,
      host: point.samples ? { ...point.host, gpu_power_watts: observationMetric(null, 'UNKNOWN') } : point.host }))
  }
  return { status: 'REPORTED', device }
}
