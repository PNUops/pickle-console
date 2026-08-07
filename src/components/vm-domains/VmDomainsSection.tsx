import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchDomains, type DomainSummary, type VmDetail } from '../../api/queries'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '../ui'
import { useVmGroupRole } from '../vm-group-role'
import { AddPlatformSubdomainModal } from './AddPlatformSubdomainModal'
import { ConnectCustomDomainDrawer } from './ConnectCustomDomainDrawer'
import { DomainDrawer } from './DomainDrawer'
import { DomainRow } from './DomainRow'
import { foldDomainStatus } from './domain-status'

/** 이 상태에서만 도메인 연결 접수가 가능하다 (계약: 그 외 409 VM_INVALID_STATE). */
const CONNECTABLE_STATUSES: VmDetail['status'][] = ['RUNNING', 'STOPPED']

/** 플랫폼 추가 모달의 초기값 — 예약 중 이름 다시 연결 때 채워진다. */
interface PlatformModalState {
  subdomain?: string
  rootDomain?: string
}

/**
 * VM 도메인 카드 — 이 VM의 HTTP 서비스를 공개하는 주소 목록. 도메인이 1급
 * 개체이고 공개는 그 파생이므로, 화면의 동사는 "공개"가 아니라 "연결/해제"다.
 * 서빙 중 목록은 VM 상세(publications)에서, 예약 중 목록은 도메인 목록
 * 조회에서 온다 — 예약 행은 트래픽을 받지 않으므로 절을 분리해 보여준다.
 */
export function VmDomainsSection({ vm }: { vm: VmDetail }) {
  const { canMutate, roleFallback } = useVmGroupRole(vm)
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [platformModal, setPlatformModal] = useState<PlatformModalState | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  // 도메인마다 포트가 다르다 — 직전에 쓴 값을 다음 추가 폼의 기본값으로 쓴다.
  const [lastPort, setLastPort] = useState('80')

  const domains = useQuery({
    queryKey: ['domains', { vmId: vm.id }],
    queryFn: () => fetchDomains({ vmId: vm.id }),
  })

  const live = vm.publications
  // 해제됐지만 이름 예약이 남은 행 — 예약이 없는 REMOVED(커스텀 해제 등)는
  // 이미 끝난 이름이므로 보여줄 것이 없다.
  const reserved = (domains.data?.content ?? []).filter(
    (d) => d.status === 'REMOVED' && d.reservedUntil != null,
  )

  const connectable = CONNECTABLE_STATUSES.includes(vm.status)
  const empty = live.length === 0 && reserved.length === 0

  const reconnect = (domain: DomainSummary) => {
    // 예약된 이름 그대로 다시 연결 — 포트만 확인받도록 모달을 채워서 연다.
    const root = domain.rootDomain ?? undefined
    const subdomain = root ? domain.fqdn.slice(0, -(root.length + 1)) : domain.fqdn
    setPlatformModal({ subdomain, rootDomain: root })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>도메인</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600">
          이 VM의 HTTP 서비스를 공개하는 주소 목록입니다.
        </p>

        {canMutate && !connectable && (
          <Alert variant="warning">
            실행 중 또는 중지됨 상태의 VM만 도메인을 연결할 수 있습니다.
          </Alert>
        )}

        {domains.isError && (
          <Alert variant="danger" title="도메인 목록을 불러오지 못했습니다">
            <Button
              size="sm"
              variant="secondary"
              loading={domains.isFetching}
              onClick={() => void domains.refetch()}
            >
              다시 시도
            </Button>
          </Alert>
        )}
        {domains.isPending && empty && (
          <div className="flex justify-center py-4">
            <Spinner label="도메인 목록 불러오는 중" />
          </div>
        )}

        {empty && !domains.isPending ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm font-medium text-neutral-700">
              아직 연결된 도메인이 없습니다
            </p>
            <p className="text-sm text-neutral-500">
              도메인을 연결하면 VM의 HTTP 서비스가 그 주소로 공개됩니다. 플랫폼
              서브도메인은 바로 연결되고, 내 소유 도메인은 DNS 확인을 거쳐
              연결됩니다.
            </p>
            {(roleFallback ??
              (canMutate ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <AddButtons
                    connectable={connectable}
                    onPlatform={() => setPlatformModal({})}
                    onCustom={() => setCustomOpen(true)}
                  />
                </div>
              ) : (
                <ReadOnlyNote />
              )))}
          </div>
        ) : (
          <>
            {live.length > 0 && (
              <ul className="divide-y divide-neutral-100">
                {live.map((pub) => (
                  <DomainRow
                    key={pub.domain.id}
                    fqdn={pub.fqdn}
                    kind={pub.domain.kind}
                    port={pub.route?.targetPort}
                    fold={foldDomainStatus({
                      kind: pub.domain.kind,
                      status: pub.domain.status,
                      route: pub.route,
                      certificate: pub.certificate,
                    })}
                    live
                    onDetail={() => setDrawerId(pub.domain.id)}
                  />
                ))}
              </ul>
            )}

            {!empty &&
              (roleFallback ??
                (canMutate ? (
                  <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                    <AddButtons
                      connectable={connectable}
                      onPlatform={() => setPlatformModal({})}
                      onCustom={() => setCustomOpen(true)}
                    />
                  </div>
                ) : (
                  <ReadOnlyNote />
                )))}

            {reserved.length > 0 && (
              <section className="space-y-1 border-t border-neutral-100 pt-4">
                <h3 className="text-sm font-semibold text-neutral-800">예약 중</h3>
                <ul className="divide-y divide-neutral-100">
                  {reserved.map((domain) => (
                    <DomainRow
                      key={domain.id}
                      fqdn={domain.fqdn}
                      kind={domain.kind}
                      fold={foldDomainStatus({
                        kind: domain.kind,
                        status: domain.status,
                        releasedAt: domain.releasedAt,
                        reservedUntil: domain.reservedUntil,
                      })}
                      live={false}
                      reservedUntil={domain.reservedUntil}
                      onDetail={() => setDrawerId(domain.id)}
                      onReconnect={
                        canMutate && connectable ? () => reconnect(domain) : undefined
                      }
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>

      <DomainDrawer
        vm={vm}
        reserved={reserved}
        openId={drawerId}
        onClose={() => setDrawerId(null)}
        canMutate={canMutate}
        onPortUsed={(port) => setLastPort(String(port))}
      />

      {platformModal && (
        <AddPlatformSubdomainModal
          vm={vm}
          open
          onClose={() => setPlatformModal(null)}
          defaultPort={lastPort}
          initialSubdomain={platformModal.subdomain}
          initialRootDomain={platformModal.rootDomain}
          onAccepted={(_pub, port) => setLastPort(String(port))}
        />
      )}

      <ConnectCustomDomainDrawer
        vm={vm}
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        defaultPort={lastPort}
        onAccepted={(_pub, port) => setLastPort(String(port))}
      />
    </Card>
  )
}

function AddButtons({
  connectable,
  onPlatform,
  onCustom,
}: {
  connectable: boolean
  onPlatform: () => void
  onCustom: () => void
}) {
  return (
    <>
      <Button variant="secondary" size="sm" disabled={!connectable} onClick={onPlatform}>
        ＋ 플랫폼 서브도메인 추가
      </Button>
      <Button variant="secondary" size="sm" disabled={!connectable} onClick={onCustom}>
        ＋ 내 도메인 연결
      </Button>
    </>
  )
}

function ReadOnlyNote() {
  return (
    <p className="text-sm text-neutral-500">
      도메인 연결·해제는 그룹의 소유자·편집자만 할 수 있습니다.
    </p>
  )
}
