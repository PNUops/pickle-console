import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteDnsDomain,
  fetchDnsDomain,
  fetchDnsRecordSets,
  renewDnsDomain,
  replaceDnsRecordSets,
  type DesiredRecordSet,
  type DnsDomain,
  type DnsRecordSet,
  type DnsRecordType,
} from '../api/queries'
import { ResourceAccessSection } from '../components/resource/ResourceAccessSection'
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmNameModal,
  DomainStatusBadge,
  Input,
  Select,
  Spinner,
  TabPanel,
  Tabs,
  Textarea,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { consolePaths } from '../lib/paths'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

const RECORD_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'TXT']

const DOMAIN_TABS = [
  { id: 'overview', label: '개요' },
  { id: 'records', label: '레코드' },
  { id: 'access', label: '접근' },
]

/** One row being edited. Several values are separated by newlines. */
type DraftRow = {
  /** Stable across edits so React keeps focus on the row a reader is typing in. */
  key: string
  name: string
  type: DnsRecordType
  values: string
  ttl: string
}

export function DnsDomainDetailPage() {
  const { domainId = '' } = useParams()
  const idValid = isUuid(domainId)
  const domain = useQuery({
    queryKey: ['dns-domains', domainId],
    queryFn: () => fetchDnsDomain(domainId),
    // An address that is not even the right shape has nothing to ask the server.
    enabled: idValid,
  })

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to={consolePaths.dnsDomains(null)} className="text-primary-700 hover:underline">
          ← 내 도메인
        </Link>
      </nav>

      {!idValid ? (
        <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
      ) : domain.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner label="도메인 정보 불러오는 중" />
        </div>
      ) : domain.isError ? (
        <Alert variant="danger">{domain.error.message}</Alert>
      ) : (
        <DomainDetail key={domain.data.id} domain={domain.data} />
      )}
    </div>
  )
}

function DomainDetail({ domain }: { domain: DnsDomain }) {
  const released = domain.releasedAt != null
  // The rungs the server actually requires: renewing and saving records take an
  // editor, releasing takes a manager. Without reading them the screen draws
  // every action for everyone and the reader finds out from a 403.
  const canEdit = domain.myResourceRole === 'OWNER' || domain.myResourceRole === 'EDITOR'
  // The access tab follows the grant-management right alone, as the key detail
  // does — a reader who cannot manage grants gets the server's refusal as the
  // tab's first render otherwise.
  const tabs = DOMAIN_TABS.filter((tab) => (tab.id === 'access' ? domain.accessManageAllowed : true))
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  // An unknown or hidden tab falls back to the overview; the URL can stay.
  const activeTab = tabs.some((tab) => tab.id === rawTab) ? rawTab! : 'overview'
  // Held here rather than inside the editor: TabPanel unmounts what it hides,
  // so a draft owned by the editor died the moment the reader looked at the
  // overview, with nothing said about it.
  const [draft, setDraft] = useState<DraftRow[] | null>(null)

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-neutral-900">{domain.fqdn}</h1>
          {/* A released row keeps status ACTIVE on the server, so the plain
              badge would read 연결됨 right beside 해제됨. The reservation is
              the state a reader needs here. */}
          {released ? (
            <Badge variant="neutral">예약 중</Badge>
          ) : (
            <DomainStatusBadge status={domain.status} />
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">{domain.workspaceName} 소유</p>
      </div>

      <Tabs
        tabs={tabs}
        value={activeTab}
        onChange={(id) => setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true })}
        aria-label="도메인 상세 영역"
      />

      <TabPanel id="overview" active={activeTab === 'overview'} className="space-y-6">
        <DomainOverview domain={domain} canEdit={canEdit} />
      </TabPanel>

      <TabPanel id="records" active={activeTab === 'records'} className="space-y-6">
        <RecordSetEditor
          domainId={domain.id}
          released={released}
          canEdit={canEdit}
          draft={draft}
          setDraft={setDraft}
        />
      </TabPanel>

      {domain.accessManageAllowed && (
        <TabPanel id="access" active={activeTab === 'access'} className="space-y-6">
          <ResourceAccessSection type="DOMAIN" resourceId={domain.id} />
        </TabPanel>
      )}
    </>
  )
}

function DomainOverview({ domain, canEdit }: { domain: DnsDomain; canEdit: boolean }) {
  const domainId = domain.id
  const queryClient = useQueryClient()
  const [releasing, setReleasing] = useState(false)
  const renew = useMutation({
    mutationFn: () => renewDnsDomain(domainId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dns-domains'] }),
  })
  const release = useMutation({
    mutationFn: () => deleteDnsDomain(domainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dns-domains'] })
      void queryClient.invalidateQueries({ queryKey: ['resources'] })
      setReleasing(false)
    },
  })

  const released = domain.releasedAt != null

  return (
    <>
      {released && (
        <Alert variant="warning">
          해제한 이름입니다.{' '}
          {domain.reservedUntil
            ? `${formatDateTime(domain.reservedUntil)}까지 `
            : '예약이 끝나기 전까지 '}
          같은 이름으로 다시 만들면 되찾을 수 있고, 그 뒤에는 다른 사용자가 쓸 수 있습니다. 레코드는
          함께 돌아오지 않습니다.
        </Alert>
      )}

      <Card className="space-y-3 p-6">
        <h2 className="text-base font-semibold text-neutral-900">도메인 정보</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="루트 도메인" value={domain.rootDomain} />
          <Row label="레코드" value={`${domain.recordSetCount}개`} />
          <Row label="발급일" value={formatDateTime(domain.createdAt)} />
        </dl>
      </Card>

      {!released && (
        <Card className="space-y-3 p-6">
          <h2 className="text-base font-semibold text-neutral-900">사용 기한</h2>
          {/* Losing the name without a renewal is the whole of what this card
              has to say. A deactivated school account receives none of the
              notices, so a reader who is not told that has no way to know. */}
          <p className="text-sm text-neutral-600">
            {formatDateTime(domain.renewDueAt)}까지입니다. 연장하지 않으면 레코드가 삭제되고
            이름은 예약 상태로 바뀝니다. 알림은 기한 전에 보내지만, 학교 계정을 더 쓰지 않게 되면
            그 알림도 닿지 않습니다.
          </p>
          {renew.isError && <Alert variant="danger">{renew.error.message}</Alert>}
          {canEdit && (
            <div>
              <Button onClick={() => renew.mutate()} loading={renew.isPending}>
                사용 연장
              </Button>
            </div>
          )}
        </Card>
      )}

      {!released && domain.accessManageAllowed && (
        <Card className="space-y-3 border-danger-200 p-6">
          <h2 className="text-base font-semibold text-neutral-900">도메인 해제</h2>
          <p className="text-sm text-neutral-600">
            레코드를 지우고 이름을 해제합니다. 예약 기간 동안은 같은 이름으로 다시 만들어 되찾을
            수 있고, 그 기간에도 이 이름은 워크스페이스의 도메인 개수에 계속 포함됩니다.
          </p>
          <div>
            <Button variant="danger" onClick={() => setReleasing(true)}>
              도메인 해제
            </Button>
          </div>
        </Card>
      )}

      {releasing && (
        <ConfirmNameModal
          open
          title="도메인 해제"
          expectedName={domain.fqdn}
          confirmLabel="해제"
          onConfirm={() => release.mutate()}
          onClose={() => setReleasing(false)}
          loading={release.isPending}
        >
          <p>이 이름의 레코드가 모두 지워지고 주소가 더 이상 열리지 않습니다.</p>
          {release.isError && <Alert variant="danger">{release.error.message}</Alert>}
        </ConfirmNameModal>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{value}</dd>
    </div>
  )
}

/**
 * Editing the record sets.
 *
 * <p>Not a partial edit. Saving sends the whole of what this table holds and
 * the server works out the difference, so a row deleted here leaves the zone.
 * That is why the button says 저장 rather than 추가, and why the sentence above
 * the table says so before the press.</p>
 *
 * <p>This shape does not make concurrent editing safe — the last save wins and
 * an edit made elsewhere in between is overwritten. It is the shape the
 * endpoint has, and a per-row call would trade that for a screen that must
 * already know what the zone currently holds.</p>
 */
function RecordSetEditor({
  domainId,
  released,
  canEdit,
  draft,
  setDraft,
}: {
  domainId: string
  released: boolean
  canEdit: boolean
  draft: DraftRow[] | null
  setDraft: (rows: DraftRow[] | null) => void
}) {
  const queryClient = useQueryClient()
  const records = useQuery({
    queryKey: ['dns-domains', domainId, 'records'],
    queryFn: () => fetchDnsRecordSets(domainId),
  })
  const rows = useMemo<DraftRow[]>(() => {
    if (draft) return draft
    return (records.data ?? []).map(toDraft)
  }, [draft, records.data])

  const save = useMutation({
    mutationFn: () => replaceDnsRecordSets(domainId, toDesired(rows)),
    onSuccess: (saved) => {
      setDraft(null)
      // Seed from the response rather than only invalidating: between clearing
      // the draft and the refetch landing, the table would otherwise redraw the
      // pre-save rows, and a row the reader just deleted comes back for a beat.
      queryClient.setQueryData(['dns-domains', domainId, 'records'], saved)
      void queryClient.invalidateQueries({ queryKey: ['dns-domains', domainId] })
    },
  })

  if (records.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="레코드 불러오는 중" />
      </div>
    )
  }
  if (records.isError) return <Alert variant="danger">{records.error.message}</Alert>

  if (released) {
    return (
      <Alert variant="info">
        해제한 이름에는 레코드를 넣을 수 없습니다. 같은 이름으로 다시 만들면 편집할 수 있습니다.
      </Alert>
    )
  }

  const update = (index: number, patch: Partial<DraftRow>) =>
    setDraft(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  // A TTL that is not a number used to fall back to 300 on the way out, which
  // saved a value the reader never typed and said nothing about it. Refuse here
  // instead; the range itself is the server's to judge.
  const ttlInvalid = rows.some((row) => !/^[0-9]+$/.test(row.ttl.trim()))
  const empty = rows.some((row) => toValues(row.values).length === 0)
  // What the zone did with each set, keyed the way the server keys them. A
  // draft row that matches nothing on the server is new and has no answer yet.
  const applied = new Map((records.data ?? []).map((set) => [`${set.name}\u0000${set.type}`, set]))

  if (!canEdit) {
    return (
      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-neutral-900">레코드</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">아직 레코드가 없습니다.</p>
        ) : (
          <dl className="space-y-3">
            {(records.data ?? []).map((set) => (
              <div key={`${set.name}\u0000${set.type}`} className="text-sm">
                <dt className="font-medium text-neutral-900">
                  {set.name || '@'} · {set.type}
                </dt>
                <dd className="text-neutral-600">
                  {set.values.join(', ')} (TTL {set.ttl})
                  <RecordStateNote set={set} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">레코드</h2>
        {/* Says the save replaces everything before the press. Learning it
            afterwards leaves no way back to a deleted row. */}
        <p className="mt-1 text-sm text-neutral-500">
          저장하면 이 표가 그대로 반영됩니다. 표에서 지운 줄은 존에서도 지워집니다.
        </p>
      </div>

      {save.isError && <Alert variant="danger">{save.error.message}</Alert>}
      {ttlInvalid && <Alert variant="danger">TTL은 숫자로 적어 주세요.</Alert>}
      {empty && <Alert variant="danger">값이 비어 있는 줄이 있습니다.</Alert>}

      {rows.length === 0 && (
        <p className="text-sm text-neutral-500">아직 레코드가 없습니다. 줄을 더해 주세요.</p>
      )}

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.key} className="space-y-1">
            <div className="grid items-start gap-2 sm:grid-cols-[1fr_7rem_2fr_6rem_auto]">
              <Input
                aria-label={`${index + 1}번째 줄 이름`}
                value={row.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="비우면 도메인 이름 자신"
              />
              <Select
                aria-label={`${index + 1}번째 줄 종류`}
                value={row.type}
                onChange={(event) => update(index, { type: event.target.value as DnsRecordType })}
              >
                {RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
              {/* A textarea and not an input: a set can hold several values and
                  they are separated by newlines, which a text input strips on
                  the way in. With one, a two-value set rendered as the two
                  values run together and saving wrote that back as one. */}
              <Textarea
                aria-label={`${index + 1}번째 줄 값`}
                rows={2}
                value={row.values}
                onChange={(event) => update(index, { values: event.target.value })}
                placeholder="값이 여럿이면 줄바꿈으로 나눠 주세요"
              />
              <Input
                aria-label={`${index + 1}번째 줄 TTL`}
                value={row.ttl}
                onChange={(event) => update(index, { ttl: event.target.value })}
              />
              <Button
                variant="secondary"
                onClick={() => setDraft(rows.filter((_, i) => i !== index))}
                aria-label={`${index + 1}번째 줄 지우기`}
              >
                지우기
              </Button>
            </div>
            <RecordStateNote set={applied.get(`${row.name.trim()}\u0000${row.type}`)} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => setDraft([...rows, newDraftRow()])}
        >
          줄 추가
        </Button>
        <div className="flex gap-2">
          {draft && (
            <Button variant="secondary" onClick={() => setDraft(null)}>
              되돌리기
            </Button>
          )}
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!draft || ttlInvalid || empty}
          >
            저장
          </Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * What the zone did with one set, when that is not "it is there".
 *
 * <p>The editor holds the state the reader wants; this is the only thing on the
 * screen that says whether the platform managed to write it. Without it a set
 * the provider refused looks exactly like one it accepted, and the reader is
 * left with an address that does not resolve and nothing saying why.</p>
 */
function RecordStateNote({ set }: { set?: DnsRecordSet }) {
  if (!set || set.status === 'APPLIED') return null
  if (set.status === 'FAILED') {
    return (
      <p className="text-xs text-danger-700">
        반영하지 못했습니다{set.lastError ? ` — ${set.lastError}` : ''}
      </p>
    )
  }
  return <p className="text-xs text-neutral-500">반영을 기다리는 중입니다.</p>
}

let draftRowSeq = 0

/** A key that stays with the row: an index one moves the focus to the next
 *  row's data when a row above it is deleted. */
function newDraftRow(): DraftRow {
  draftRowSeq += 1
  return { key: `new-${draftRowSeq}`, name: '', type: 'A', values: '', ttl: '300' }
}

function toDraft(set: DnsRecordSet): DraftRow {
  return {
    key: `${set.name}\u0000${set.type}`,
    name: set.name,
    type: set.type,
    values: set.values.join('\n'),
    ttl: String(set.ttl),
  }
}

function toValues(values: string): string[] {
  return values
    .split('\n')
    .map((value) => value.trim())
    .filter((value) => value !== '')
}

function toDesired(rows: DraftRow[]): DesiredRecordSet[] {
  return rows.map((row) => ({
    name: row.name.trim(),
    type: row.type,
    values: toValues(row.values),
    ttl: Number(row.ttl.trim()),
  }))
}
