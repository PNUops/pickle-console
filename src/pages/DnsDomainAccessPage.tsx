import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchDnsDomainAccessGrants } from '../api/queries'
import { ResourceAccessSection } from '../components/resource/ResourceAccessSection'
import { Alert, DomainStatusBadge, Spinner } from '../components/ui'
import { consolePaths } from '../lib/paths'
import type { DomainStatus } from '../lib/status'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

/**
 * The access list of one domain, on its own.
 *
 * <p>Separate from the detail for the reason the VM and LLM key screens are:
 * whoever opens this may not be able to open the detail at all. A workspace
 * owner with no grant cannot see inside the domain but may still decide who
 * can, and that is the only way to take back a name whose issuer has left. So
 * this page never calls the detail; the name and state it shows are the ones
 * the access response carries with it.</p>
 */
export function DnsDomainAccessPage() {
  const params = useParams()
  const domainId = params.domainId ?? ''
  const idValid = isUuid(domainId)
  const access = useQuery({
    queryKey: ['dns-domains', domainId, 'access'],
    queryFn: () => fetchDnsDomainAccessGrants(domainId),
    // An address that is not even the right shape has nothing to ask the server.
    enabled: idValid,
  })
  const domain = access.data?.resource

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to={consolePaths.dnsDomains(null)} className="text-primary-700 hover:underline">
          ← 내 도메인
        </Link>
      </nav>

      {!idValid ? (
        <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      ) : access.isPending ? (
        <Spinner label="접근 권한 불러오는 중" />
      ) : access.isError ? (
        <Alert variant="danger">{access.error.message}</Alert>
      ) : (
        <>
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-neutral-900">{domain?.name}</h1>
              {domain?.type === 'DOMAIN' && (
                <DomainStatusBadge status={domain.status as DomainStatus} />
              )}
            </div>
            <p className="text-sm text-neutral-500">{domain?.workspaceName} 소유</p>
          </header>
          <ResourceAccessSection type="DOMAIN" resourceId={domainId} />
        </>
      )}
    </div>
  )
}
