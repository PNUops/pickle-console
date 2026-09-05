import { useMemo, useState } from 'react'
import type { OpenRouterCatalogue, OpenRouterCatalogueModel } from '../api/queries'
import type { CreditModelListKind } from '../lib/credit-model-allowlist'
import { matchesCreditModel, suggestCreditModelPatterns } from '../lib/credit-model-match'

/** 한 번에 그리는 최대 개수. 벤더 목록이 400을 넘으므로 전부 그리지는 않는다. */
const LIMIT = 40

/**
 * 카탈로그에서 유료 모델을 골라 허용 목록이나 차단 목록에 넣는다.
 *
 * 이 컴포넌트가 있는 이유는 이름을 대신 타이핑해 주는 것이 아니라 **가격을 판단하는
 * 자리에 갖다 놓는 것**이다. 벤더 목록의 출력 가격은 백만 토큰당 $0.03 에서 $600 까지
 * 벌어져 있어서, 이름만 나열한 선택기는 자유 입력과 다를 것이 없다. 같은 이유로 계열
 * 와일드카드를 고르기 전에 그 패턴이 지금 몇 개를 잡는지 함께 보여 준다.
 *
 * 목록이 비어 있거나 낡아도 **승인이 막히지 않는다.** 입력란은 그대로 살아 있고 이
 * 선택기는 그 위에 얹힌다.
 */

const FRESHNESS_NOTE: Partial<Record<OpenRouterCatalogue['freshness'], string>> = {
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

/** 목록에 넣는 버튼 두 갈래. 어느 목록인지는 이름표로만 갈린다. */
function AddButtons({
  value,
  label,
  allowed,
  denied,
  onAdd,
}: {
  value: string
  label: string
  allowed: readonly string[]
  denied: readonly string[]
  onAdd: (pattern: string, list: CreditModelListKind) => void
}) {
  const inAllow = allowed.includes(value)
  const inDeny = denied.includes(value)
  return (
    <span className="flex shrink-0 gap-1">
      <button
        type="button"
        disabled={inAllow}
        aria-label={`${label} 허용 목록에 추가`}
        onClick={() => onAdd(value, 'ALLOW')}
        className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-50"
      >
        {inAllow ? '허용됨' : '허용'}
      </button>
      <button
        type="button"
        disabled={inDeny}
        aria-label={`${label} 차단 목록에 추가`}
        onClick={() => onAdd(value, 'DENY')}
        className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-50"
      >
        {inDeny ? '차단됨' : '차단'}
      </button>
    </span>
  )
}

/**
 * 고른 모델의 계열 와일드카드와 그 패턴이 지금 잡는 개수.
 *
 * 개수는 판정 함수로 센다. 눈으로 접두만 비교하면 `openai/*-pro` 가
 * `openai/gpt-5-pro:batch` 를 빠뜨려서, 반값 변형이 빠진 수를 보여 주게 된다.
 */
function PatternSuggestions({
  model,
  models,
  allowed,
  denied,
  onAdd,
}: {
  model: OpenRouterCatalogueModel
  models: readonly OpenRouterCatalogueModel[]
  allowed: readonly string[]
  denied: readonly string[]
  onAdd: (pattern: string, list: CreditModelListKind) => void
}) {
  const suggestions = useMemo(
    () =>
      suggestCreditModelPatterns(model.id).map((suggestion) => ({
        ...suggestion,
        count: models.filter((row) => matchesCreditModel(suggestion.pattern, row.id)).length,
      })),
    [model.id, models],
  )
  if (suggestions.length === 0) {
    return (
      <p className="px-2 pb-1 text-xs text-neutral-500">
        이 이름에서 뽑을 계열 패턴이 없습니다.
      </p>
    )
  }
  return (
    <ul className="space-y-1 px-2 pb-2">
      {suggestions.map((suggestion) => (
        <li key={suggestion.pattern} className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <code className="block truncate font-mono text-xs">{suggestion.pattern}</code>
            <span className="block text-xs text-neutral-500">
              {suggestion.kind}. 이 패턴은 지금 {suggestion.count}개를 잡습니다
            </span>
          </span>
          <AddButtons
            value={suggestion.pattern}
            label={suggestion.pattern}
            allowed={allowed}
            denied={denied}
            onAdd={onAdd}
          />
        </li>
      ))}
    </ul>
  )
}

export function CreditModelPicker({
  catalogue,
  failed,
  allowed,
  denied,
  onAdd,
}: {
  catalogue: OpenRouterCatalogue | undefined
  failed: boolean
  allowed: readonly string[]
  denied: readonly string[]
  onAdd: (pattern: string, list: CreditModelListKind) => void
}) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { shown, matched } = useMemo(() => {
    const models: OpenRouterCatalogueModel[] = catalogue?.models ?? []
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? models.filter(
          (model) =>
            model.id.toLowerCase().includes(needle) ||
            model.name.toLowerCase().includes(needle),
        )
      : models
    return { shown: pool.slice(0, LIMIT), matched: pool.length }
  }, [catalogue, query])

  if (failed) {
    return (
      <p className="text-sm text-neutral-500">
        모델 목록을 불러오지 못했습니다. 모델 이름을 직접 적으면 승인은 그대로 진행됩니다.
      </p>
    )
  }

  const note = catalogue ? FRESHNESS_NOTE[catalogue.freshness] : undefined
  const models = catalogue?.models ?? []
  const total = models.length
  // 서버가 싼 순으로 준다. 그러니 잘라낸 뒤에 남는 것은 싼 쪽이고, 승인자가
  // 예산을 정하기 전에 꼭 봐야 할 비싼 모델이 정확히 잘려 나간다. 몇 개 중 몇
  // 개를 보고 있는지 말해 주지 않으면 나머지가 있다는 것조차 모른다.
  const truncated = matched > shown.length

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
        <ul
          aria-label="카탈로그 유료 모델"
          className="max-h-56 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-200"
        >
          {shown.map((model) => (
            <li key={model.id}>
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{model.id}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    출력 {priceText(model.completionPricePerMillion)} / 1M
                    {', 입력 '}
                    {priceText(model.promptPricePerMillion)} / 1M
                    {isAlias(model.id) ? ', 최신 모델을 따라가는 별칭' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <AddButtons
                    value={model.id}
                    label={model.id}
                    allowed={allowed}
                    denied={denied}
                    onAdd={onAdd}
                  />
                  <button
                    type="button"
                    aria-expanded={expanded === model.id}
                    aria-label={`${model.id} 패턴 제안`}
                    onClick={() => setExpanded(expanded === model.id ? null : model.id)}
                    className="rounded border border-neutral-300 px-2 py-0.5 text-xs"
                  >
                    패턴
                  </button>
                </span>
              </div>
              {expanded === model.id ? (
                <PatternSuggestions
                  model={model}
                  models={models}
                  allowed={allowed}
                  denied={denied}
                  onAdd={onAdd}
                />
              ) : null}
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-2 py-1 text-sm text-neutral-500">검색 결과가 없습니다.</li>
          ) : null}
        </ul>
      ) : null}
      {truncated ? (
        <p className="text-sm text-neutral-500">
          {total}개 중 {shown.length}개를 보고 있습니다. 목록은 싼 순이라 비싼 모델은 뒤에
          있으니, 찾는 모델이 있으면 이름으로 검색해 주세요.
        </p>
      ) : null}
    </div>
  )
}
