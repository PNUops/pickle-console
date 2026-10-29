import { useMemo, useState } from 'react'
import type { OpenRouterCatalogue, OpenRouterCatalogueModel } from '../api/queries'
import {
  isCreditModelUsable,
  isRouterModelName,
  matchesAnyCreditModel,
  matchesDeniedCreditModel,
} from '../lib/credit-model-match'

/** 접었을 때 보여 주는 개수. 비싼 쪽부터 보여 주므로 앞의 몇 개가 판단에 쓰인다. */
const HEAD = 5

/** Draft pattern matches against a cached catalogue, never a callability decision. */
export function CreditModelPreview({
  catalogue,
  failed,
  allowed,
  denied,
  invalid,
}: {
  catalogue: OpenRouterCatalogue | undefined
  failed: boolean
  allowed: readonly string[]
  denied: readonly string[]
  /** 두 목록 중 하나라도 문법이 틀렸는지. 틀린 채로 세면 두 방향으로 거짓말한다. */
  invalid: boolean
}) {
  const [open, setOpen] = useState(false)

  const { usable, blocked, dearest } = useMemo(() => {
    const models: OpenRouterCatalogueModel[] = catalogue?.models ?? []
    const usableModels = models.filter((model) => isCreditModelUsable(model.id, allowed, denied))
    // 차단이 실제로 걷어낸 것 — 허용은 통과하는데 차단에 걸린 모델이다. 허용
    // 목록이 애초에 안 잡는 모델까지 세면 차단이 한 일이 부풀려진다.
    const blockedModels = models.filter(
      (model) =>
        !isRouterModelName(model.id) &&
        denied.some((pattern) => matchesDeniedCreditModel(pattern, model.id)) &&
        (allowed.length === 0 || matchesAnyCreditModel(allowed, model.id)),
    )
    const priced = usableModels.filter((model) => model.completionPricePerMillion != null)
    const top = priced.length
      ? priced.reduce((a, b) =>
          (b.completionPricePerMillion ?? 0) > (a.completionPricePerMillion ?? 0) ? b : a,
        )
      : null
    return {
      usable: [...usableModels].sort(
        (a, b) => (b.completionPricePerMillion ?? -1) - (a.completionPricePerMillion ?? -1),
      ),
      blocked: blockedModels,
      dearest: top,
    }
  }, [catalogue, allowed, denied])

  if (!catalogue) return null

  if (invalid) {
    return (
      <p className="text-sm text-neutral-500">
        목록에 고칠 것이 있어 미리보기를 멈췄습니다. 틀린 항목을 빼고 세면 허용은 넓게,
        차단은 좁게 잘못 나옵니다.
      </p>
    )
  }

  if (catalogue.models.length === 0 && catalogue.lastSuccessAt == null) {
    return <p className="text-sm text-foreground-muted">공급자 목록의 성공 기록이 없어 패턴 후보를 확인할 수 없습니다. 올바른 모델 패턴은 직접 입력할 수 있습니다.</p>
  }

  const total = catalogue.models.length
  const unrestricted = allowed.length === 0 && denied.length === 0
  const shown = open ? usable : usable.slice(0, HEAD)

  return (
    <div className="space-y-1 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <p className="font-medium text-neutral-800">
        패턴 조건을 통과하는 후보 {usable.length}개. 저장된 카탈로그 {total}개 기준입니다.
      </p>
      {unrestricted && <p>허용 목록과 차단 목록이 모두 비어 있어 모델 패턴으로 제한하지 않습니다.</p>}
      {failed && <p className="text-amber-700">새 조회가 실패해 마지막으로 조회한 목록으로 비교합니다.</p>}
      <p className="text-neutral-600">
        {dearest
          ? `기본 출력 단가가 알려진 후보 중 최대는 ${dearest.id}, 백만 토큰당 출력 $${dearest.completionPricePerMillion?.toLocaleString('ko-KR')}입니다.`
          : usable.length > 0
            ? '기본 출력 단가를 아는 후보가 없어 단가 최댓값을 확인할 수 없습니다.'
            : '현재 카탈로그에는 패턴 조건을 통과하는 후보가 없습니다. 직접 입력한 모델이 목록에 아직 없을 수도 있습니다.'}
      </p>
      <p className="text-xs text-foreground-muted">기능 권한, 예산과 자격증명 연결, 키 상태와 공급자 지원 등은 별도 호출 조건입니다. 이 후보 수는 호출 허가나 성공을 보장하지 않습니다. 다른 가격 축과 조건별 단가는 가격 상세에서 확인해 주세요.</p>
      {denied.length > 0 ? (
        <p className="text-neutral-600">
          {blocked.length > 0
            ? `차단 목록이 걷어낸 모델 ${blocked.length}개: ${blocked
                .slice(0, HEAD)
                .map((model) => model.id)
                .join(', ')}${blocked.length > HEAD ? ' 외' : ''}`
            : '차단 목록이 지금 카탈로그에서 걷어낸 모델은 없습니다.'}
        </p>
      ) : null}
      {usable.length > 0 ? (
        <>
          <ul
            aria-label="패턴 조건을 통과하는 유료 모델 후보"
            className={`space-y-0.5 pt-1 text-neutral-700${
              open ? ' max-h-56 overflow-y-auto' : ''
            }`}
          >
            {shown.map((model) => (
              <li key={model.id} className="flex justify-between gap-2">
                <span className="truncate font-mono text-xs">{model.id}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {model.completionPricePerMillion == null
                    ? '가격 미상'
                    : `출력 $${model.completionPricePerMillion.toLocaleString('ko-KR')} / 1M`}
                </span>
              </li>
            ))}
          </ul>
          {usable.length > HEAD ? (
            <button
              type="button"
              className="text-xs underline"
              onClick={() => setOpen(!open)}
            >
              {open ? '접기' : `전체 ${usable.length}개 보기`}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
