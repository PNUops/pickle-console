/**
 * Fixture identifiers.
 *
 * Every id crossing the API boundary is a UUID, but the fixtures are a web of
 * cross-references — a VM names its workspace, a grant names its user — and
 * those references were written as small integers that had to agree by hand.
 * `uuid(n)` keeps that web intact: the same n always yields the same UUID, so
 * a fixture written as `workspaceId: uuid(5)` still points at `id: uuid(5)`.
 *
 * The shape is a valid v4 UUID (version and variant nibbles fixed) so it passes
 * the console's own `isUuid` guard — a fixture that could not appear in a real
 * URL would let a broken guard pass the tests.
 *
 * The counter is zero-padded to a fixed width on purpose: the handlers sort
 * "newest first" by descending id, and with equal widths `localeCompare` puts
 * them in the same order the old numeric subtraction did. Drop the padding and
 * uuid(9) sorts after uuid(10), silently reordering every paginated fixture.
 */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

/**
 * VMs the metrics handler answers about specially. They are shared with
 * VmDetailPage's tests: the handler branches on them and the test asserts what
 * the branch produces, so a value that moved in one place and not the other
 * would leave the tests passing against the wrong fixture.
 */
/** 아직 프로비저닝되지 않은 VM — 하이퍼바이저에 실체가 없다. */
export const VM_NOT_PROVISIONED_ID = uuid(55)
/** 생성에 실패한 VM — 하이퍼바이저 조회 자체가 실패한다. */
export const VM_METRICS_UNAVAILABLE_ID = uuid(59)
