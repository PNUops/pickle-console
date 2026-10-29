import { TokenValue } from '../TokenValue'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  fetchAdminLlmKeyModels,
  fetchLlmKeyModels,
  type LlmKeyModels,
  type PaidModel,
  type SelfServedModel,
} from '../../api/queries'
import { hasPriceDetail, priceDetailSummary } from '../../lib/model-pricing'
import { ModelPriceDetail } from '../ModelPriceDetail'
import { ObservationMoment } from '../OpenRouterCredits'
import { CopyButton } from '../CopyButton'
import { Alert, Input, LoadingBlock, Modal } from '../ui'
import { useAuth } from '../../auth/auth-context'
import { requestReaderKey } from '../../api/request-review'

type ModelsRead = Omit<LlmKeyModels, 'paid'> & { paid?: LlmKeyModels['paid'] | null }

/** Show pattern candidates, keeping grants and runtime call conditions separate. */
export function LlmKeyModelsModal({
  keyId,
  open,
  onClose,
  variant = 'owner',
}: {
  keyId: string
  open: boolean
  onClose: () => void
  /** `admin`이면 기관 스코프 경로로 묻는다. 소유자 경로의 부여 규칙과 다르다. */
  variant?: 'owner' | 'admin'
}) {
  const [term, setTerm] = useState('')
  const { user } = useAuth()
  const models = useQuery<ModelsRead>({
    queryKey: variant === 'admin' ? ['admin', 'llm-key-models', keyId, requestReaderKey(user)] : ['llm-key-models', variant, keyId],
    queryFn: () => (variant === 'admin' ? fetchAdminLlmKeyModels(keyId) : fetchLlmKeyModels(keyId)),
    // 모달이 닫혀 있는 동안은 물을 이유가 없다. 카탈로그가 수백 행이다.
    enabled: open,
  })

  return (
    <Modal open={open} onClose={onClose} title="모델 이름과 패턴 후보" className="max-w-3xl">
      {models.isPending && <LoadingBlock label="모델 목록을 불러오는 중" />}
      {models.isError && (
        <Alert variant="danger">{(models.error as Error).message}</Alert>
      )}
      {models.data && (
        <ModelsBody data={models.data} term={term} onTermChange={setTerm} />
      )}
    </Modal>
  )
}

function ModelsBody({
  data,
  term,
  onTermChange,
}: {
  data: ModelsRead
  term: string
  onTermChange: (value: string) => void
}) {
  const needle = term.trim().toLowerCase()
  const selfServed = useMemo(
    () => data.selfServed.filter((m) => !needle || m.name.toLowerCase().includes(needle)),
    [data.selfServed, needle],
  )
  const paid = useMemo(
    () =>
      data.paid?.models.filter(
        (m) =>
          !needle ||
          m.id.toLowerCase().includes(needle) ||
          (m.name ?? '').toLowerCase().includes(needle),
      ) ?? [],
    [data.paid, needle],
  )

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600">
        요청 본문의 <code className="font-mono">model</code> 필드에 아래 이름을 그대로 넣습니다.
      </p>
      <p className="text-xs text-neutral-500">이 목록은 저장된 모델 정책의 후보입니다. 부여된 기능 권한과 키 상태·기한·한도, 자격증명 및 공급자 지원은 별도 호출 조건이며, 이름이 있어도 호출 성공을 보장하지 않습니다.</p>

      <Input
        value={term}
        onChange={(e) => onTermChange(e.target.value)}
        placeholder="모델 이름으로 찾기"
        aria-label="모델 이름으로 찾기"
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-900">자체 서빙 모델</h3>
        {data.selfServed.length === 0 ? (
          <p className="text-sm text-neutral-600">지금 제공되는 자체 서빙 모델이 없습니다.</p>
        ) : selfServed.length === 0 ? (
          <p className="text-sm text-neutral-600">찾는 이름이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
            {selfServed.map((model) => (
              <SelfServedRow key={model.name} model={model} />
            ))}
          </ul>
        )}
      </section>

      <PaidSection data={data} rows={paid} filtered={needle.length > 0} />
    </div>
  )
}

function SelfServedRow({ model }: { model: SelfServedModel }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="font-mono text-sm">{model.name}</span>
      <span className="flex items-center gap-3">
        <span className="text-xs text-neutral-500">
          {model.maxInputTokens != null && <span className="block">입력 <TokenValue value={model.maxInputTokens} decision /></span>}
          {model.maxOutputTokens != null && <span className="block">출력 <TokenValue value={model.maxOutputTokens} decision /></span>}
        </span>
        <CopyButton value={model.name} label="복사" />
      </span>
    </li>
  )
}

/**
 * 유료 구역.
 *
 * 비어 있는 이유가 여럿이고 서로 다른 판단을 부른다. 「아직 신청 안 함」과
 * 「목록을 못 가져옴」과 「좁혀서 남은 것이 없음」이 화면에서 같아 보이면
 * 사용자는 다음에 무엇을 할지 정할 수 없다.
 */
function PaidSection({
  data,
  rows,
  filtered,
}: {
  data: ModelsRead
  rows: PaidModel[]
  filtered: boolean
}) {
  const paid = data.paid
  if (paid == null) return <Alert>이 키의 유료 모델 정책은 현재 업무로 제공되지 않습니다.</Alert>
  const narrowed = paid.allowedPatterns.length > 0 || paid.deniedPatterns.length > 0

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900">유료 모델</h3>

      {paid.access === 'NONE' && (
        <Alert variant="info">
          이 키에는 아직 금액 한도가 없습니다. 아래는 한도를 신청하면 넣을 수 있는 이름입니다.
        </Alert>
      )}
      {paid.access === 'PENDING' && (
        <Alert variant="info">
          금액 한도의 적용이 아직 확인되지 않았습니다. 적용과 다른 호출 조건을 확인해 주세요.
        </Alert>
      )}
      {paid.catalogFreshness === 'STALE' && (
        <Alert variant="warning">
          공급자 목록을 마지막으로 가져온 지 오래됐습니다. 그 뒤에 생기거나 사라진 모델은
          반영되지 않았을 수 있습니다.
        </Alert>
      )}

      {narrowed && <NarrowingSummary paid={paid} />}

      {paid.catalogFreshness === 'UNKNOWN' ? (
        <p className="text-sm text-neutral-600">
          공급자 목록을 아직 한 번도 가져오지 못했습니다. 목록이 비어 있는 것과는 다르며,
          이름을 알고 있다면 모델 정책과 별도 호출 조건을 확인해 주세요.
        </p>
      ) : paid.models.length === 0 ? (
        <p className="text-sm text-neutral-600">
          {narrowed
            ? '저장된 목록에서 이 키의 패턴 조건을 통과하는 후보가 없습니다.'
            : '공급자 목록이 비어 있습니다.'}
        </p>
      ) : rows.length === 0 && filtered ? (
        <p className="text-sm text-neutral-600">찾는 이름이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
          {rows.map((model) => (
            <PaidRow key={model.id} model={model} />
          ))}
        </ul>
      )}

      {paid.catalogObservedAt && (
        // 「지금 목록인가」를 묻는 관측이므로 상대 시간이다 (Time display 규칙).
        <p className="text-xs text-neutral-500">
          <ObservationMoment value={paid.catalogObservedAt} /> 가져온 목록
        </p>
      )}
    </section>
  )
}

/**
 * 무엇이 목록을 좁혔는지.
 *
 * `access`만으로는 「좁혀졌다」까지만 알 수 있고 어느 목록이 좁혔는지는 모른다.
 * 승인자가 방금 넣은 규칙이 반영됐는지 확인하는 자리라 둘을 갈라 보여 준다.
 */
function NarrowingSummary({ paid }: { paid: LlmKeyModels['paid'] }) {
  return (
    <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3">
      {paid.allowedPatterns.length > 0 && (
        <PatternLine label="이것들만" patterns={paid.allowedPatterns} />
      )}
      {paid.deniedPatterns.length > 0 && (
        <PatternLine label="이것들 빼고" patterns={paid.deniedPatterns} />
      )}
      {paid.unmatchedAllowedPatterns.length > 0 && (
        <p className="text-xs text-amber-700">
          지금 목록에서 찾을 수 없는 이름: {paid.unmatchedAllowedPatterns.join(', ')}
        </p>
      )}
      {paid.unmatchedDeniedPatterns.length > 0 && (
        // 오타일 수도, 아직 없는 모델을 미리 막아 둔 것일 수도 있다. 사실만
        // 말하고 판단은 적은 사람에게 남긴다 — 경고로 부르면 일부러 걸어 둔
        // 규칙을 지우게 되고, 그 모델이 나오는 날 뚫린다.
        <p className="text-xs text-neutral-600">
          지금은 아무것도 막지 않는 차단 규칙: {paid.unmatchedDeniedPatterns.join(', ')}
        </p>
      )}
    </div>
  )
}

function PatternLine({ label, patterns }: { label: string; patterns: string[] }) {
  return (
    <p className="text-xs text-neutral-700">
      <span className="font-medium">{label}</span>{' '}
      <span className="font-mono">{patterns.join(', ')}</span>
    </p>
  )
}

function PaidRow({ model }: { model: PaidModel }) {
  const [pricesOpen, setPricesOpen] = useState(false)
  const detail = priceDetailSummary(model.pricing)
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3 px-3">
        <span className="min-w-0">
          <span className="block truncate font-mono text-sm">{model.id}</span>
          {model.name && model.name !== model.id && (
            <span className="block truncate text-xs text-neutral-500">{model.name}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right">
            <Price prompt={model.promptPricePerMillion} completion={model.completionPricePerMillion} />
            {detail && <span className="block text-xs text-neutral-500">{detail}</span>}
          </span>
          {hasPriceDetail(model.pricing) && (
            <button
              type="button"
              aria-expanded={pricesOpen}
              aria-label={`${model.id} 가격 상세`}
              onClick={() => setPricesOpen((open) => !open)}
              className="rounded border border-neutral-300 px-2 py-0.5 text-xs"
            >
              가격
            </button>
          )}
          <CopyButton value={model.id} label="복사" />
        </span>
      </div>
      {pricesOpen && model.pricing && (
        <div className="px-1 pt-1">
          <ModelPriceDetail modelId={model.id} pricing={model.pricing} />
        </div>
      )}
    </li>
  )
}

/** 모르는 값과 0은 다르다. 모르면 아무것도 적지 않는다. */
function Price({
  prompt,
  completion,
}: {
  prompt: number | null | undefined
  completion: number | null | undefined
}) {
  if (prompt == null && completion == null) return null
  const fmt = (v: number | null | undefined) => (v == null ? '?' : `$${v}`)
  return (
    <span className="block whitespace-nowrap text-xs text-neutral-500">
      100만 토큰당 입력 {fmt(prompt)} · 출력 {fmt(completion)}
    </span>
  )
}
