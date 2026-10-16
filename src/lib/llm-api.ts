/**
 * 사용 안내 화면이 보여 주는 LLM API 사실들.
 *
 * 정본은 게이트웨이의 배포 환경 설정이고 여기 있는 값은 화면 표시용 사본이다. 콘솔은
 * 게이트웨이 설정을 읽는 경로가 없어서 사본을 둘 수밖에 없는데, 사용 가이드와 키 상세
 * 화면이 각자 문자열을 들고 있으면 한쪽만 고쳐진 채 남으므로 한 곳에 모은다.
 *
 * 한도는 게이트웨이 바이너리의 컴파일 기본값이 아니라 **배포된 환경 변수 값**을 적는다.
 * 둘은 다를 수 있고, 학생에게 적용되는 것은 배포된 쪽이다.
 */

/** OpenAI 호환 API의 base URL. */
export const LLM_API_BASE_URL = PICKLE_LLM_API_BASE_URL

/**
 * Base URL for Anthropic clients (Claude Code, the Anthropic SDKs). They
 * append `/v1/messages` themselves, so this is the OpenAI base without `/v1`;
 * giving them the OpenAI one sends `/v1/v1/messages` and gets 404.
 */
export const LLM_ANTHROPIC_BASE_URL = LLM_API_BASE_URL.replace(/\/v1$/, '')

/** 자체 서빙 모델의 공개 이름. 실제 모델과 분리되어 있어 업스트림이 바뀌어도 유지된다. */
export const LLM_DEFAULT_MODEL = 'pickle-general'

/**
 * The paid model the Anthropic examples name. `/v1/messages` serves paid
 * models only, so the self-hosted name cannot stand in here.
 */
export const LLM_MESSAGES_EXAMPLE_MODEL = 'anthropic/claude-haiku-5.5'

/**
 * The routes a key reaches only with the matching feature granted, Chat
 * included. A key without it gets 403 `endpoint_not_allowed`, never 404:
 * a route that does not exist and a route this key may not use are different
 * states. `GET /v1/models` costs nothing and needs no feature.
 *
 * Web search and PDF OCR are Chat's children and have no route of their own;
 * the gateway reads them from the Chat request body.
 *
 * `/v1/images/generations` is the OpenAI SDK's path for the same handler as
 * `/v1/images`. Request and response pass through unchanged, so the SDK gets
 * `b64_json` only. On that path alone the gateway refuses what the vendor
 * cannot give back (`response_format` other than `b64_json`, `style`,
 * top-level `moderation`); `/v1/images` forwards those fields unchanged.
 * The SDK's edit and variation paths stay 404.
 *
 * `/v1/messages` is the Anthropic Messages API, under the same Chat grant. It
 * serves paid models only, answers errors in Anthropic's shape
 * (`{"type":"error","error":{"type","message","code"},"request_id"}`, where
 * `error.code` is the same code as in the table below), and accepts the key
 * in `x-api-key` as well as `Authorization`. Its `count_tokens` and other
 * sub-paths are 404.
 */
export const LLM_PASSTHROUGH_ROUTES = [
  { capability: 'chat', method: 'POST', path: '/v1/chat/completions', summary: 'Chat' },
  { capability: 'chat', method: 'POST', path: '/v1/messages', summary: 'Anthropic Messages' },
  { capability: 'images', method: 'POST', path: '/v1/images', summary: '이미지 생성' },
  {
    capability: 'images',
    method: 'POST',
    path: '/v1/images/generations',
    summary: '이미지 생성(OpenAI SDK 경로)',
  },
  { capability: 'images', method: 'GET', path: '/v1/images/models', summary: '이미지 모델 목록' },
  { capability: 'embeddings', method: 'POST', path: '/v1/embeddings', summary: '임베딩' },
] as const

/**
 * 자체 서빙 모델에 보낼 수 있는 최상위 필드. 목록에 없는 필드는 무시가 아니라 거부이므로,
 * 무엇을 보낼 수 있는지가 사용자에게 보여야 한다.
 */
export const LLM_SELF_SERVED_PARAMS = [
  'model',
  'messages',
  'stream',
  'stream_options',
  'max_tokens',
  'max_completion_tokens',
  'temperature',
  'top_p',
  'stop',
  'presence_penalty',
  'frequency_penalty',
  'seed',
  'user',
  'response_format',
  'tools',
  'tool_choice',
  'parallel_tool_calls',
] as const

/**
 * 유료 모델에서만 보낼 수 있는 필드.
 *
 * 유료 모델을 서빙하는 공급자가 정의하는 필드이고 에이전트 도구가 모델 정보를 보고 스스로 붙인다. 자체
 * 서빙 모델에 보내면 400으로 거부되는데, 그것은 누락이 아니라 사고 모드를 요청 단위로
 * 열지 않는다는 결정의 집행 지점이다.
 */
export const LLM_PAID_ONLY_PARAMS = ['reasoning_effort', 'verbosity'] as const

/**
 * 유료 모델을 부를 때 안내에 싣는 필드. **허용 목록이 아니다.**
 *
 * 유료 모델은 공급자가 받는 요청을 그대로 전달하므로 이 목록 밖의 필드도 거부되지
 * 않는다. 목록을 두는 것은 무엇을 보낼 수 있는지 묻는 사람에게 답하기 위해서이지
 * 나머지를 막기 때문이 아니다. 실제 울타리는 자체 서빙 목록 하나뿐이다.
 */
export const LLM_PAID_PARAMS = [
  ...LLM_SELF_SERVED_PARAMS,
  ...LLM_PAID_ONLY_PARAMS,
] as const

/**
 * 키에 별도 한도가 부여되지 않았을 때 적용되는 값. 배포된 게이트웨이 환경 기준이고
 * 코드 기본값이 아니다. 셋 다 배포 env가 덮고 있으므로 코드 기본값을 옮겨 적으면
 * 아무 키도 받지 않는 숫자가 된다.
 *
 * 2026-09-03에 상향됐다. 종전 값(20 / 30,000 / 2)은 코딩 에이전트처럼 긴 문맥을
 * 연달아 보내는 사용에서 실제로 걸렸다. 분당 둘은 되돌이 루프만 걸리게 두는 수준이고,
 * 호스트 용량을 지키는 것은 그 둘이 아니라 게이트웨이 전체 동시 요청 상한과 서빙
 * 쪽 큐다.
 *
 * 동시 요청만 근거가 다르다. 서빙이 동시 4에서 8 사이에 포화하므로 그보다 큰 값은
 * 거절을 만들지 않아도 한 키가 큐를 채워 남을 기다리게 한다. 2026-09-03에 32로
 * 올렸다가 그 실측을 받고 8로 내렸다.
 *
 * 셋 다 이 파일이 아니라 배포된 환경 파일이 정한다. 2026-09-03과 09-04 사이에 두 번
 * 움직였으므로, 고칠 때는 반드시 라이브 값을 읽고 고친다.
 */
export const LLM_DEFAULT_LIMITS = {
  requestsPerMinute: 600,
  tokensPerMinute: 1_000_000,
  concurrency: 8,
} as const

/**
 * Chat request body bounds, in MiB. Both are the gateway's built-in values,
 * which the deployed env does not override. A body above the large threshold
 * needs one of a few shared slots and is refused with `large_request_busy`
 * while they are all taken; above the maximum it is `request_too_large`.
 * The image and embedding paths share the maximum but not the slots.
 */
export const LLM_REQUEST_BODY_MIB = {
  max: 25,
  largeAbove: 2,
} as const

/**
 * Client request headers the gateway forwards to the vendor, on a paid-model
 * chat or messages request only. The messages route also forwards
 * `anthropic-version` and `anthropic-beta`. Self-hosted, image and embedding requests forward none.
 * Of repeated lines only the first is forwarded, and a value longer than
 * `LLM_FORWARDED_HEADER_MAX_BYTES` is dropped rather than cut. App attribution
 * headers (`HTTP-Referer`, `X-Title`, ...) and response-cache headers are not
 * forwarded.
 */
export const LLM_FORWARDED_REQUEST_HEADERS = [
  {
    name: 'x-session-id',
    use: '같은 값을 보낸 요청이 같은 공급자로 가도록 요청합니다. 한 대화에 같은 값을 쓰면 프롬프트 캐시가 맞을 가능성이 높아집니다.',
  },
  {
    name: 'x-anthropic-beta',
    use: 'Anthropic 모델의 베타 기능을 켭니다. 값은 Anthropic 문서의 기능 이름이고, 여러 개는 쉼표로 이어 한 줄에 적습니다.',
  },
  {
    name: 'X-OpenRouter-Metadata',
    use: '이 요청을 처리한 공급자와 시도 순서를 응답 본문에 함께 받습니다.',
  },
] as const

export const LLM_FORWARDED_HEADER_MAX_BYTES = 1024

/**
 * Vendor response headers the gateway relays when the vendor sends them.
 * `X-Generation-Id` comes on a successful paid-model answer, image and
 * embedding answers included.
 * `Retry-After` comes when the vendor answered 429 or 503 with a wait; after a
 * fallback, it is the longest wait any upstream asked for.
 */
export const LLM_RELAYED_RESPONSE_HEADERS = [
  {
    name: 'X-Generation-Id',
    use: '요청 하나에 대한 공급자의 생성 id입니다. 채팅, 이미지, 임베딩의 정상 응답에서 돌려줍니다. 결과나 금액을 문의할 때 함께 알려 주세요.',
  },
  {
    name: 'Retry-After',
    use: '유료 모델 공급자가 429나 503으로 답하며 대기 시간을 준 경우 붙습니다. 대체 경로까지 시도했다면 그중 가장 긴 시간입니다. 이 시간이 지난 뒤 재시도합니다.',
  },
] as const

export interface LlmErrorEntry {
  /** 응답 본문의 `error.code`. 메시지 문구와 달리 바뀌지 않는 식별자다. */
  code: string
  status: number
  /** A second HTTP status the same code arrives with (200 means inside a stream). */
  alsoStatus?: number
  meaning: string
}

/** 사용자에게 도달하는 에러. 판정은 메시지가 아니라 `code`로 한다. */
export const LLM_ERROR_CODES: LlmErrorEntry[] = [
  {
    code: 'missing_api_key',
    status: 401,
    meaning: 'Authorization 헤더가 없습니다. /v1/messages는 x-api-key 헤더도 받습니다.',
  },
  { code: 'invalid_api_key', status: 401, meaning: '콘솔에서 발급한 키가 아닙니다.' },
  { code: 'api_key_expired', status: 401, meaning: '키의 유효기간이 지났습니다.' },
  { code: 'api_key_revoked', status: 401, meaning: '폐기된 키입니다.' },
  { code: 'account_suspended', status: 403, meaning: '이 API 키가 정지된 상태입니다. 키 상세에서 상태를 확인하고 관리자에게 문의합니다.' },
  { code: 'model_not_found', status: 404, meaning: '그런 이름의 모델이 없습니다.' },
  {
    code: 'model_not_available_on_route',
    status: 400,
    meaning:
      '자체 서빙 모델은 아직 /v1/messages에서 쓸 수 없습니다. 유료 모델 이름을 지정하거나 /v1/chat/completions를 사용합니다.',
  },
  { code: 'model_not_allowed', status: 403, meaning: '이 키로는 쓸 수 없는 모델입니다.' },
  {
    code: 'endpoint_not_allowed',
    status: 403,
    meaning: '이 키에 필요한 기능이 없습니다. 키 정보의 기능 권한을 확인합니다. 아직 신청할 수 없는 서버 코드 실행 도구(shell, bash)는 요청에서 뺍니다.',
  },
  { code: 'rate_limit_requests', status: 429, meaning: '분당 요청 횟수를 초과했습니다.' },
  { code: 'rate_limit_tokens', status: 429, meaning: '분당 토큰 사용량을 초과했습니다.' },
  { code: 'rate_limit_concurrency', status: 429, meaning: '동시 요청 수를 초과했습니다.' },
  { code: 'quota_exhausted', status: 429, meaning: '부여된 사용량을 모두 썼습니다.' },
  { code: 'credit_unavailable', status: 403, meaning: '유료 모델을 쓸 금액 한도가 없습니다.' },
  {
    code: 'credit_pending',
    status: 503,
    meaning: '승인된 금액 한도를 적용하는 중입니다. 잠시 후 다시 시도하면 됩니다.',
  },
  { code: 'credit_exhausted', status: 429, meaning: '유료 모델의 금액 한도를 모두 썼습니다.' },
  { code: 'unsupported_parameter', status: 400, meaning: '지원 목록에 없는 필드를 보냈습니다.' },
  { code: 'invalid_parameter_value', status: 400, meaning: '파라미터 값이 허용 범위 밖입니다.' },
  { code: 'missing_parameter', status: 400, meaning: '필수 파라미터가 빠졌습니다.' },
  { code: 'invalid_json', status: 400, meaning: '요청 본문이 올바른 JSON이 아닙니다.' },
  {
    code: 'preset_not_supported',
    status: 400,
    meaning: 'preset은 지원하지 않습니다. 모델 이름을 직접 지정합니다.',
  },
  {
    code: 'request_too_large',
    status: 400,
    meaning: `요청 본문이 ${LLM_REQUEST_BODY_MIB.max} MiB를 넘었습니다.`,
  },
  {
    code: 'request_body_incomplete',
    status: 400,
    meaning: '채팅 요청 본문을 끝까지 받지 못했습니다. 같은 요청을 다시 보냅니다.',
  },
  {
    code: 'large_request_busy',
    status: 429,
    meaning: `${LLM_REQUEST_BODY_MIB.largeAbove} MiB를 넘는 요청을 처리할 자리가 지금은 없습니다. Retry-After 뒤에 다시 보내거나, 파일과 이미지를 URL로 보내 요청을 줄입니다.`,
  },
  { code: 'input_too_long', status: 400, meaning: '입력이 모델의 최대 입력 길이를 넘었습니다.' },
  { code: 'output_limit_exceeded', status: 400, meaning: '요청한 최대 출력 길이가 허용치를 넘었습니다.' },
  {
    code: 'unknown_endpoint',
    status: 404,
    meaning:
      '지원하지 않는 경로입니다. 메시지에 적힌 경로는 지원 범위이지 보낸 경로가 아니므로, base URL을 먼저 확인합니다. OpenAI 호환 클라이언트는 /v1까지, Anthropic 클라이언트는 /v1 없이 적습니다.',
  },
  { code: 'method_not_allowed', status: 405, meaning: '지원하지 않는 HTTP 메서드입니다.' },
  {
    code: 'streaming_not_supported',
    status: 400,
    meaning: '이미지와 임베딩 경로는 스트리밍을 지원하지 않습니다. stream을 빼고 보냅니다.',
  },
  {
    code: 'upstream_response_too_large',
    status: 502,
    alsoStatus: 200,
    meaning:
      '응답이 중계 가능한 크기를 넘었거나 큰 응답을 처리할 자리가 없습니다. 출력 크기를 줄이고, 처리 자리 부족이면 간격을 늘려 재시도합니다. 유료 재시도는 추가 비용이 들 수 있습니다. 긴 텍스트는 stream으로 받고, 이미지 출력은 경로와 관계없이 개수나 해상도를 줄입니다. 큰 이미지 이벤트는 스트리밍으로도 해결되지 않을 수 있습니다.',
  },
  { code: 'service_disabled', status: 503, meaning: '서비스가 점검 중입니다.' },
  { code: 'server_busy', status: 503, meaning: '요청이 몰려 처리하지 못했습니다. 한도는 차감되지 않습니다.' },
  {
    code: 'upstream_rejected',
    status: 400,
    alsoStatus: 422,
    meaning:
      '모델 서버가 요청을 거부했습니다. 모델 서버가 이유를 보냈으면 메시지의 「모델 서버 메시지:」 뒤에 나옵니다.',
  },
  { code: 'upstream_error', status: 502, meaning: '모델 서버 호출에 실패했습니다.' },
  { code: 'upstream_timeout', status: 504, meaning: '모델 서버 응답이 제한 시간을 넘었습니다.' },
  {
    code: 'request_deadline_exceeded',
    status: 200,
    meaning: '요청 시간 상한을 넘겨 스트림이 끊겼습니다. 스트림 도중에만 나옵니다.',
  },
  {
    code: 'upstream_stream_interrupted',
    status: 200,
    meaning: '모델 서버가 스트림을 도중에 끊었습니다. 스트림 도중에만 나옵니다.',
  },
]
