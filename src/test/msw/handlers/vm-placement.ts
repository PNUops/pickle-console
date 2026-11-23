import type { components } from '../../../api/schema'
import { uuid } from '../ids'

type Preview = components['schemas']['AdminVmPlacementPreviewResponse']
type Input = components['schemas']['AdminVmPlacementPreviewRequest']

export function vmPlacementFixture(input: Partial<Input> = {}): Preview {
  const count = input.count ?? 1
  const vcpu = input.vcpu ?? 2
  const memoryMb = input.memoryMb ?? 2048
  const diskGb = input.diskGb ?? 20
  const placeableCount = Math.min(count, Math.floor(36 / vcpu), Math.floor(65536 / memoryMb), Math.floor(640 / diskGb))
  const remaining = { vcpu: 36, memoryMb: 65536, diskGb: 640 }
  const after = { vcpu: 36 - vcpu * placeableCount, memoryMb: 65536 - memoryMb * placeableCount, diskGb: 640 - diskGb * placeableCount }
  const budget = { vcpu: 56, memoryMb: 98304, diskGb: 800 }
  const allocated = { vcpu: 20, memoryMb: 32768, diskGb: 160 }
  return {
    orgId: input.orgId ?? uuid(1), inputImageId: input.imageId ?? uuid(1), nodeId: input.nodeId ?? null,
    observedAt: '2026-11-23T01:00:00Z', count, placeableCount, shortfallCount: count - placeableCount,
    fitsAllNow: placeableCount === count, fitsAnyOneNow: placeableCount > 0,
    image: { id: uuid(1), name: 'Ubuntu 24.04 LTS', version: 1, selectableNow: true },
    totals: { budget, allocated, remaining, after },
    candidates: [{ nodeId: uuid(2), nodeName: 'pve2', fitsOneNow: placeableCount > 0,
      status: 'ACTIVE', liveStatus: 'REACHABLE', liveObservedAt: '2026-11-23T01:00:00Z',
      eligible: true, exclusionReasons: [], capacityMode: 'PREPARED', budget, allocated, remaining, after,
      placeableCount, plannedCount: placeableCount, limitingResources: placeableCount < count ? ['CPU'] : [],
    }],
  }
}
