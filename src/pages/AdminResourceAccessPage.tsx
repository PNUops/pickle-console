import { Link, useParams, useSearchParams } from 'react-router'
import type { ResourceType } from '../api/queries'
import { ResourceAccessSection } from '../components/resource/ResourceAccessSection'
import { Alert, PageHeader } from '../components/ui'
import { adminPaths } from '../lib/paths'
import { safeInternalPath } from '../lib/redirect'
import { useAdminScope } from '../lib/use-admin-scope'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

const TYPES: ResourceType[] = ['VM', 'LLM_API_KEY', 'DOMAIN', 'GPU']

/** Return only to the exact resource's supported administrator detail surface. */
function exactResourceReturn(value: string | null, type: ResourceType, resourceId: string, orgId?: string): string {
  const fallback = type === 'VM' ? adminPaths.vmDetail(resourceId, orgId)
    : type === 'LLM_API_KEY' ? adminPaths.llmKeyDetail(resourceId, orgId)
      : type === 'GPU' ? adminPaths.gpuDetail(resourceId, orgId)
        : adminPaths.domainDetail(resourceId, orgId)
  if (!safeInternalPath(value)) return fallback
  const proposed = new URL(value!, 'https://pickle.invalid')
  const expected = new URL(fallback, 'https://pickle.invalid')
  if (proposed.pathname !== expected.pathname || proposed.hash) return fallback
  if (type === 'DOMAIN' && proposed.searchParams.get('domainId') !== resourceId) return fallback
  const proposedOrg = proposed.searchParams.get('org')
  if (proposedOrg != null && !isUuid(proposedOrg)) return fallback
  if ((proposedOrg ?? undefined) !== orgId) return fallback
  return `${proposed.pathname}${proposed.search}`
}

export function AdminResourceAccessPage() {
  const { resourceType, resourceId = '' } = useParams()
  const [search] = useSearchParams()
  const scope = useAdminScope()
  const type = TYPES.find((candidate) => candidate === resourceType)
  if (!type || !isUuid(resourceId)) return <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
  return <div className="space-y-6">
    <Link to={exactResourceReturn(search.get('returnTo'), type, resourceId, scope.activeOrgId)} className="text-sm text-primary-700 hover:underline">← 자원 상세</Link>
    <PageHeader title="접근 권한 지원" description="자원별 접근 목록을 조회하고 허용된 역할에서 부여·등급 변경·회수를 처리합니다." />
    <ResourceAccessSection type={type} resourceId={resourceId} support />
  </div>
}
