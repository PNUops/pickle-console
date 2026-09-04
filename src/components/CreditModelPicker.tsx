import { useMemo, useState } from 'react'
import type { OpenRouterCatalogue, OpenRouterCatalogueModel } from '../api/queries'

/**
 * 카탈로그에서 유료 모델을 골라 허용 목록에 넣는다.
 *
 * 이 컴포넌트가 있는 이유는 이름을 대신 타이핑해 주는 것이 아니라 **가격을 판단하는
 * 자리에 갖다 놓는 것**이다. 벤더 목록의 출력 가격은 백만 토큰당 $0.03 에서 $600 까지
 * 벌어져 있어서, 이름만 나열한 선택기는 자유 입력과 다를 것이 없다.
 *
 * 목록이 비어 있거나 낡아도 **승인이 막히지 않는다.** 입력란은 그대로 살아 있고 이
 * 선택기는 그 위에 얹힌다.
 */

const FRESHNESS_NOTE: Record<string, string> = {
  STALE: '목록이 오래됐습니다. 최근에 나온 모델이 빠져 있을 수 있으니 이름을 직접 적어도 됩니다.',
  UNKNOWN: '아직 목록을 가져온 적이 없습니다. 모델 이름을 직접 적어 주세요.',
}

function priceText(value: number | null | undefined): string {
  if (value == null) return '가격 미상'
  if (value === 0) return '무료'
  if (value < 1) return `$${value.toFixed(3)}`
  if (value < 100) return `$${value.toFixed(2)}`
  return `$${Math.round(value)}`
}

/**
 * 벤더가 부동 별칭에 붙이는 표시. 이 이름들은 벤더 프리픽스에 안 덮이므로 목록에서
 * 골랐을 때와 `openai/*` 로 열었을 때가 다르다는 것을 여기서 보여 준다.
 */
function isAlias(id: string): boolean {
  return id.startsWith('~')
}

export function CreditModelPicker({
  catalogue,
  failed,
  selected,
  onAdd,
}: {
  catalogue: OpenRouterCatalogue | undefined
  failed: boolean
  selected: readonly string[]
  onAdd: (modelId: string) => void
}) {
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const models: OpenRouterCatalogueModel[] = catalogue?.models ?? []
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? models.filter(
          (model) =>
            model.id.includes(needle) || model.name.toLowerCase().includes(needle),
        )
      : models
    return pool.slice(0, 40)
  }, [catalogue, query])

  if (failed) {
    return (
      <p className="text-sm text-neutral-500">
        모델 목록을 불러오지 못했습니다. 모델 이름을 직접 적으면 승인은 그대로 진행됩니다.
      </p>
    )
  }

  const note = catalogue ? FRESHNESS_NOTE[catalogue.freshness] : undefined
  const total = catalogue?.models.length ?? 0

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="모델 이름으로 검색"
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        aria-label="유료 모델 검색"
      />
      {note ? <p className="text-sm text-amber-700">{note}</p> : null}
      {total > 0 ? (
        <ul className="max-h-56 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-200">
          {matches.map((model) => {
            const already = selected.includes(model.id)
            return (
              <li key={model.id} className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{model.id}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    출력 {priceText(model.completionPricePerMillion)} / 1M
                    {' · 입력 '}
                    {priceText(model.promptPricePerMillion)} / 1M
                    {isAlias(model.id) ? ' · 최신 모델을 따라가는 별칭' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => onAdd(model.id)}
                  className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-50"
                >
                  {already ? '추가됨' : '추가'}
                </button>
              </li>
            )
          })}
          {matches.length === 0 ? (
            <li className="px-2 py-1 text-sm text-neutral-500">검색 결과가 없습니다.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
