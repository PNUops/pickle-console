import type { AdminLlmKeyDetail } from '../api/queries'

/**
 * Feature grants on an LLM API key: names, hierarchy and the words for them.
 *
 * The vocabulary is the contract's closed set, taken from the generated
 * types; the Korean names and descriptions are the console's. Every screen
 * that shows or edits a grant reads this module, so the request form, the
 * approval form, the key editor and the bulk editor say the same thing.
 *
 * An empty grant opens nothing. The two paid-model lists next to it read the
 * other way (empty lifts the restriction), which is why the empty value has
 * its own word here.
 */

/** A name the contract allows. */
export type PassthroughEndpoint = AdminLlmKeyDetail['passthroughEndpoints'][number]

interface Capability {
  label: string
  description: string
  /** Granting this needs one of these. Indented under the first on screen. */
  parents?: readonly PassthroughEndpoint[]
}

/**
 * Display name and one-line description per name, in display order.
 * Keyed by the contract type so a new name fails to compile until it has
 * words, and a removed one fails as a stray key.
 */
const CAPABILITIES: Record<PassthroughEndpoint, Capability> = {
  chat: {
    label: 'Chat',
    description:
      '텍스트를 생성합니다. Chat, Messages, Responses, completions 경로와 Claude Code, Codex 같은 에이전트 연결이 포함됩니다',
  },
  web_search: {
    label: '웹 검색',
    description: '모델이 응답 전에 웹을 검색해서 결과를 참고합니다',
    parents: ['chat'],
  },
  pdf_ocr: {
    label: 'PDF OCR',
    description: 'PDF를 직접 읽지 못하는 모델에 보낼 때 PDF를 유료 OCR로 변환합니다',
    parents: ['chat'],
  },
  containers: {
    label: '코드 실행',
    description: '모델이 샌드박스 컨테이너에서 코드를 실행하고 결과 파일을 돌려줍니다',
    parents: ['chat'],
  },
  images: {
    label: '이미지 생성',
    description: '텍스트 프롬프트로 이미지를 생성합니다',
  },
  embeddings: {
    label: '임베딩',
    description: '텍스트를 벡터로 변환합니다. 유사도 검색, RAG에 씁니다',
  },
  rerank: {
    label: '리랭크',
    description: '검색된 문서를 질의와의 관련도 순으로 재정렬합니다. RAG 정확도를 높일 때 씁니다',
  },
  speech: {
    label: 'TTS',
    description: '텍스트를 음성 파일로 변환합니다',
  },
  transcriptions: {
    label: 'STT',
    description: '음성 파일을 텍스트로 변환합니다',
  },
  videos: {
    label: '동영상 생성',
    description: '텍스트나 이미지로 짧은 영상을 생성합니다. 요청당 비용이 큽니다',
  },
  batches: {
    label: '배치',
    description: '여러 요청을 한 번에 제출하고 결과를 나중에 받습니다. 응답은 늦지만 비용이 낮습니다',
  },
  files: {
    label: '파일 업로드',
    description: '배치나 코드 실행에 쓸 파일을 미리 업로드합니다',
    parents: ['batches', 'containers'],
  },
}

const ORDER = Object.keys(CAPABILITIES) as PassthroughEndpoint[]

/**
 * Names that can be granted today. The contract carries all twelve so stored
 * grants reach the gateway, but a name only becomes grantable when its route
 * opens; the api refuses the rest with 422. A name joins this list in the
 * release that opens its route.
 */
const GRANTABLE: ReadonlySet<PassthroughEndpoint> = new Set([
  'chat',
  'web_search',
  'pdf_ocr',
  'images',
  'embeddings',
])

/**
 * Granted alongside a parent, never chosen. `files` follows `batches` and
 * `containers`: present while either is, gone when both are.
 */
const IMPLIED: ReadonlySet<PassthroughEndpoint> = new Set(['files'])

/** The checkbox rows, in display order. */
export const PASSTHROUGH_ENDPOINTS: readonly PassthroughEndpoint[] = ORDER.filter(
  (name) => GRANTABLE.has(name) && !IMPLIED.has(name),
)

/** Names that work on the paid-model axis only. Chat works on both. */
export function isCreditOnly(value: PassthroughEndpoint): boolean {
  return value !== 'chat'
}

/** The parent a row is indented under, if any. */
export function passthroughParent(value: PassthroughEndpoint): PassthroughEndpoint | undefined {
  return CAPABILITIES[value].parents?.[0]
}

export function passthroughDescription(value: PassthroughEndpoint): string {
  return CAPABILITIES[value].description
}

/** One name's label. An unknown name shows as itself: hiding it would hide a grant. */
export function passthroughLabel(value: string): string {
  return isKnown(value) ? CAPABILITIES[value].label : value
}

/**
 * The granted features as one string. An empty grant means nothing can be
 * used, not "no restriction", and the word 부여 안 됨 carries that difference
 * on its own; a value cell says the value and nothing else.
 */
export function passthroughText(endpoints: readonly string[]): string {
  if (endpoints.length === 0) return '부여 안 됨'
  return endpoints.map(passthroughLabel).join(', ')
}

/**
 * The features a request asked for. Empty is a requester who ticked nothing,
 * which is not the same as an approver granting nothing.
 */
export function requestedFeaturesText(endpoints: readonly string[]): string {
  return endpoints.length === 0 ? '선택 안 함' : passthroughText(endpoints)
}

function isKnown(value: string): value is PassthroughEndpoint {
  return Object.hasOwn(CAPABILITIES, value)
}

/** Does the grant hold one of this name's parents (or need none)? */
export function parentGranted(
  endpoints: readonly string[],
  value: PassthroughEndpoint,
): boolean {
  const parents = CAPABILITIES[value].parents
  return parents == null || parents.some((parent) => endpoints.includes(parent))
}

/**
 * Turns one name on or off and returns the grant in display order.
 *
 * Turning a parent off drops the children it was carrying, since the api
 * refuses a child without its parent. `flat` skips that: a bulk add or
 * remove lists names to apply to each key, not a grant, and the api checks
 * the hierarchy on every key's result.
 *
 * `files` never comes out. The api derives it from its parents and refuses
 * it when sent.
 *
 * A name this build does not know is kept, after the known ones. The types
 * describe the contract this build was generated from, not the server it is
 * talking to, and saving a key replaces the whole list: dropping a name with
 * no checkbox would revoke a grant nobody touched.
 */
export function togglePassthrough(
  endpoints: readonly PassthroughEndpoint[],
  value: PassthroughEndpoint,
  checked: boolean,
  { flat = false }: { flat?: boolean } = {},
): PassthroughEndpoint[] {
  const next = new Set<string>(endpoints)
  if (checked) {
    next.add(value)
  } else {
    next.delete(value)
  }
  const ordered = [
    ...ORDER.filter((name) => next.has(name) && !IMPLIED.has(name)),
    ...endpoints.filter((entry) => next.has(entry) && !isKnown(entry)),
  ]
  return flat ? ordered : withHierarchy(ordered)
}

/** The grant without the children whose parent it lacks, which the api refuses. */
export function withHierarchy(endpoints: readonly PassthroughEndpoint[]): PassthroughEndpoint[] {
  return endpoints.filter((entry) => !isKnown(entry) || parentGranted(endpoints, entry))
}

/** A stored grant as a write sends it: without the names the api derives. */
export function grantPayload(endpoints: readonly PassthroughEndpoint[]): PassthroughEndpoint[] {
  return endpoints.filter((entry) => !IMPLIED.has(entry))
}

/** Does the grant hold a feature that lives under Chat? */
export function holdsChatChildren(endpoints: readonly string[]): boolean {
  return endpoints.some((entry) => isKnown(entry) && passthroughParent(entry) === 'chat')
}

/** The grant a request carries to an axis without a credit limit: Chat at most. */
export function withoutCreditOnly(endpoints: readonly PassthroughEndpoint[]): PassthroughEndpoint[] {
  return endpoints.filter((entry) => isKnown(entry) && !isCreditOnly(entry))
}
