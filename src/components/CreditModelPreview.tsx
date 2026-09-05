import { useMemo, useState } from 'react'
import type { OpenRouterCatalogue, OpenRouterCatalogueModel } from '../api/queries'
import { isCreditModelUsable, matchesAnyCreditModel } from '../lib/credit-model-match'

/** 접었을 때 보여 주는 개수. 비싼 쪽부터 보여 주므로 앞의 몇 개가 판단에 쓰인다. */
const HEAD = 5

/**
 * 지금 적어 둔 두 목록으로 실제로 쓸 수 있는 모델이 무엇인지 보여 준다.
 *
 * 승인자가 목록을 적을 때 아는 것은 자기가 친 문자열뿐이고, 그 문자열이 카탈로그
 * 400개 중 무엇을 여는지는 저장하고 나서도 알 수 없었다. 특히 **최고가**가 예산이
 * 얼마나 빨리 녹을 수 있는지를 한 숫자로 말해 준다. 판정은 게이트웨이와 공유하는
 * 함수가 하므로 여기 숫자와 실제로 통과하는 요청이 같다.
 *
 * 카탈로그는 캐시라서 낡을 수 있다. 그래서 모든 문장이 "지금 목록 기준"이고, 목록에
 * 없는 이름을 적었다고 해서 틀렸다고 말하지 않는다.
 */
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
        matchesAnyCreditModel(denied, model.id) &&
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

  if (failed || !catalogue) return null

  if (invalid) {
    return (
      <p className="text-sm text-neutral-500">
        목록에 고칠 것이 있어 미리보기를 멈췄습니다. 틀린 항목을 빼고 세면 허용은 넓게,
        차단은 좁게 잘못 나옵니다.
      </p>
    )
  }

  const total = catalogue.models.length
  const unrestricted = allowed.length === 0 && denied.length === 0
  const shown = open ? usable : usable.slice(0, HEAD)

  return (
    <div className="space-y-1 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <p className="font-medium text-neutral-800">
        {unrestricted
          ? `허용 목록과 차단 목록이 모두 비어 있어 제한이 없습니다. 지금 카탈로그 ${total}개 전부를 쓸 수 있습니다.`
          : `이 설정으로 쓸 수 있는 유료 모델 ${usable.length}개. 지금 카탈로그 ${total}개 기준입니다.`}
      </p>
      <p className="text-neutral-600">
        {dearest
          ? `최고가는 ${dearest.id}, 백만 토큰당 출력 $${dearest.completionPricePerMillion?.toLocaleString('ko-KR')}입니다.`
          : usable.length > 0
            ? '가격을 아는 모델이 없어 최고가를 말할 수 없습니다.'
            : '지금 카탈로그에는 이 설정으로 쓸 수 있는 모델이 없습니다. 목록에 적은 이름이 카탈로그에 아직 없을 수도 있습니다.'}
      </p>
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
            aria-label="쓸 수 있는 유료 모델"
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
