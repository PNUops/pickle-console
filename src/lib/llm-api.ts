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
 * The paid model the Codex and Responses examples name. `/v1/responses`
 * serves paid models only, like `/v1/messages`. Name only a model a live call
 * through this route has answered.
 */
export const LLM_RESPONSES_EXAMPLE_MODEL = 'openai/gpt-6-luna'

/**
 * The rerank model the guide example names. A live call answered it with an
 * amount, and rerank models are absent from the key's model list, so the
 * example has to name a real one.
 */
export const LLM_RERANK_EXAMPLE_MODEL = 'cohere/rerank-v3.5'

/**
 * The speech and transcription models the guide examples name. A live call
 * answered each; the speech one needs an explicit voice.
 */
export const LLM_SPEECH_EXAMPLE_MODEL = 'hexgrad/kokoro-82m'
export const LLM_TRANSCRIPTION_EXAMPLE_MODEL = 'openai/whisper-large-v3-turbo'

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
 *
 * `/v1/responses` is the OpenAI Responses API, also under the Chat grant and
 * paid models only. It answers in the OpenAI error shape. Nothing is stored
 * upstream, so `store: true`, `previous_response_id`, `conversation` and
 * `background: true` are refused with `unsupported_parameter`, and its
 * sub-paths (retrieve, cancel, input items) are 404.
 *
 * `/v1/completions` is the legacy text completion API, under the Chat grant
 * and paid models only. The vendor turns the prompt into a chat message, so
 * a reasoning model can end with an empty `text`.
 *
 * `/v1/rerank` reorders documents against a query. Its models are missing
 * from the key's model list, prices included.
 *
 * `/v1/audio/speech` answers with audio bytes, mp3 or raw pcm only, and pcm
 * when the request names no format. `/v1/audio/transcriptions` takes JSON or
 * the OpenAI SDK's multipart form. Speech and transcription models are also
 * missing from the key's model list.
 *
 * Batches come in two shapes: `/v1/messages/batches` is what the Anthropic
 * SDK's `messages.batches` calls, `/v1/batches` the vendor's own shape for
 * the other target endpoints. `/v1/videos` is the vendor's shape; no OpenAI or
 * Anthropic video API exists to match.
 */
export const LLM_PASSTHROUGH_ROUTES = [
  { capability: 'chat', method: 'POST', path: '/v1/chat/completions', summary: 'Chat' },
  { capability: 'chat', method: 'POST', path: '/v1/messages', summary: 'Anthropic Messages' },
  { capability: 'chat', method: 'POST', path: '/v1/responses', summary: 'OpenAI Responses' },
  { capability: 'chat', method: 'POST', path: '/v1/completions', summary: '레거시 Completions' },
  { capability: 'images', method: 'POST', path: '/v1/images', summary: '이미지 생성' },
  {
    capability: 'images',
    method: 'POST',
    path: '/v1/images/generations',
    summary: '이미지 생성(OpenAI SDK 경로)',
  },
  { capability: 'images', method: 'GET', path: '/v1/images/models', summary: '이미지 모델 목록' },
  { capability: 'embeddings', method: 'POST', path: '/v1/embeddings', summary: '임베딩' },
  { capability: 'rerank', method: 'POST', path: '/v1/rerank', summary: '리랭크' },
  { capability: 'speech', method: 'POST', path: '/v1/audio/speech', summary: 'TTS' },
  { capability: 'transcriptions', method: 'POST', path: '/v1/audio/transcriptions', summary: 'STT' },
  {
    capability: 'batches',
    method: 'POST',
    path: '/v1/messages/batches',
    summary: '배치(Anthropic SDK 형식)',
  },
  { capability: 'batches', method: 'POST', path: '/v1/batches', summary: '배치(OpenRouter 형식)' },
  { capability: 'videos', method: 'POST', path: '/v1/videos', summary: '동영상 생성' },
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
 * 서빙 모델에 보내면 400으로 거부된다.
 */
export const LLM_PAID_ONLY_PARAMS = ['verbosity'] as const

/**
 * Self-hosted models accept `reasoning_effort` when the gateway opens reasoning for
 * the upstream serving them; when it is absent the serving model's own default
 * applies. It is listed apart from LLM_SELF_SERVED_PARAMS because acceptance is a
 * gateway setting per serving upstream, not part of the fixed allowlist.
 */
export const LLM_REASONING_PARAM = 'reasoning_effort'

/** Values the gateway accepts for `reasoning_effort`; anything else is a 400. */
export const LLM_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

/**
 * 유료 모델을 부를 때 안내에 싣는 필드. **허용 목록이 아니다.**
 *
 * 유료 모델은 공급자가 받는 요청을 그대로 전달하므로 이 목록 밖의 필드도 거부되지
 * 않는다. 목록을 두는 것은 무엇을 보낼 수 있는지 묻는 사람에게 답하기 위해서이지
 * 나머지를 막기 때문이 아니다. 실제 울타리는 자체 서빙 목록 하나뿐이다.
 */
export const LLM_PAID_PARAMS = [
  ...LLM_SELF_SERVED_PARAMS,
  LLM_REASONING_PARAM,
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

/** Maximum request body shown in usage guidance, in MiB. */
export const LLM_REQUEST_BODY_MIB = {
  max: 25,
} as const

/**
 * Client request headers the gateway forwards to the vendor, on a paid-model
 * chat, messages or responses request only. The messages route also forwards
 * `anthropic-version` and `anthropic-beta`. Self-hosted, image, embedding,
 * rerank, speech and transcription requests forward none.
 * Codex's own headers (`session-id`, `x-codex-*`, `originator`) are not forwarded.
 * Of repeated lines only the first is forwarded, and a value longer than
 * `LLM_FORWARDED_HEADER_MAX_BYTES` is dropped rather than cut. App attribution
 * headers (`HTTP-Referer`, `X-Title`, ...) and response-cache headers are not
 * forwarded.
 */
export const LLM_FORWARDED_REQUEST_HEADERS = [
  {
    name: 'x-session-id',
    use: '같은 대화의 요청을 같은 공급자로 보내도록 요청해요. 같은 값을 쓰면 프롬프트 캐시를 재사용할 가능성이 높아져요.',
  },
  {
    name: 'x-anthropic-beta',
    use: 'Anthropic 베타 기능을 요청해요. 기능 이름은 Anthropic 문서에서 확인하고, 여러 개는 쉼표로 이어 한 줄에 적어요.',
  },
  {
    name: 'X-OpenRouter-Metadata',
    use: '요청을 처리한 공급자와 시도 순서를 응답 본문에 함께 받아요.',
  },
] as const

export const LLM_FORWARDED_HEADER_MAX_BYTES = 1024

/**
 * Vendor response headers the gateway relays when the vendor sends them.
 * `X-Generation-Id` comes on a successful paid-model answer, image,
 * embedding, speech and transcription answers included. A rerank answer
 * carries the id in its body instead.
 * `Retry-After` comes when the vendor answered 429 or 503 with a wait; after a
 * fallback, it is the longest wait any upstream asked for.
 */
export const LLM_RELAYED_RESPONSE_HEADERS = [
  {
    name: 'X-Generation-Id',
    use: '공급자의 생성 ID예요. 채팅, 이미지, 임베딩, TTS, STT의 정상 응답에서 받아요. 결과나 금액을 문의할 때 함께 알려 주세요.',
  },
  {
    name: 'Retry-After',
    use: '유료 모델 공급자가 429나 503 응답에 보낸 대기 시간이에요. 이 시간이 지난 뒤 다시 요청해 주세요.',
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
    meaning: 'Authorization 헤더가 없어요. /v1/messages는 x-api-key 헤더도 사용할 수 있어요.',
  },
  { code: 'invalid_api_key', status: 401, meaning: 'API 키가 올바르지 않아요.' },
  { code: 'api_key_expired', status: 401, meaning: '키의 유효기간이 지났어요.' },
  { code: 'api_key_revoked', status: 401, meaning: '폐기된 키예요.' },
  { code: 'account_suspended', status: 403, meaning: 'API 키가 정지되어 있어요. 관리자에게 문의해 주세요.' },
  { code: 'model_not_found', status: 404, meaning: '모델 이름을 찾을 수 없어요.' },
  {
    code: 'model_not_available_on_route',
    status: 400,
    meaning:
      '이 모델을 요청한 경로에서 사용할 수 없어요. /v1/responses, /v1/completions에는 지원되는 유료 모델을 지정하거나 /v1/chat/completions를 사용해 주세요.',
  },
  {
    code: 'model_not_allowed',
    status: 403,
    meaning:
      '이 키로는 사용할 수 없는 모델이에요. models나 fallbacks, tools, plugins에 자동 선택 모델을 넣었는지도 확인해 주세요.',
  },
  {
    code: 'endpoint_not_allowed',
    status: 403,
    meaning: '필요한 기능 권한이 없어요. 키 정보를 확인해 주세요. modalities의 audio는 TTS 권한이 필요해요. 권한이 없는 웹 검색 도구와 서버 코드 실행 도구(shell, bash, local_shell, code_interpreter)는 요청에서 빼 주세요.',
  },
  { code: 'rate_limit_requests', status: 429, meaning: '분당 요청 한도를 넘었어요.' },
  { code: 'rate_limit_tokens', status: 429, meaning: '분당 토큰 한도를 넘었어요.' },
  { code: 'rate_limit_concurrency', status: 429, meaning: '동시 요청 한도를 넘었어요.' },
  { code: 'quota_exhausted', status: 429, meaning: '부여된 사용량을 모두 썼어요.' },
  { code: 'credit_unavailable', status: 403, meaning: '유료 모델의 금액 한도가 없어요.' },
  {
    code: 'credit_pending',
    status: 503,
    meaning: '승인된 금액 한도를 적용하고 있어요. 잠시 후 다시 시도해 주세요.',
  },
  { code: 'credit_exhausted', status: 429, meaning: '유료 모델의 금액 한도를 모두 썼어요.' },
  {
    code: 'unsupported_parameter',
    status: 400,
    meaning:
      '지원하지 않는 필드나 서버 도구를 보냈어요. /v1/responses의 store: true, previous_response_id, conversation, background: true도 사용할 수 없어요.',
  },
  { code: 'invalid_parameter_value', status: 400, meaning: '파라미터 값이 허용 범위를 벗어났어요.' },
  { code: 'missing_parameter', status: 400, meaning: '필수 파라미터가 빠졌어요.' },
  { code: 'invalid_json', status: 400, meaning: '요청 본문이 올바른 JSON이 아니에요.' },
  {
    code: 'invalid_multipart_form',
    status: 400,
    meaning: 'STT multipart 본문을 읽을 수 없어요. 음성 파일은 file 파트 하나로, 나머지 값은 이름이 있는 텍스트 파트로 보내 주세요.',
  },
  {
    code: 'preset_not_supported',
    status: 400,
    meaning: 'preset은 지원하지 않아요. 모델 이름을 직접 지정해 주세요.',
  },
  {
    code: 'router_not_supported',
    status: 400,
    meaning: '자동 선택 모델은 지원하지 않아요. 모델 이름을 직접 지정해 주세요.',
  },
  {
    code: 'request_too_large',
    status: 400,
    meaning: `요청 본문이 ${LLM_REQUEST_BODY_MIB.max} MiB를 넘었어요.`,
  },
  {
    code: 'request_body_incomplete',
    status: 400,
    meaning: '채팅 요청 본문을 끝까지 받지 못했어요. 같은 요청을 다시 보내 주세요.',
  },
  {
    code: 'large_request_busy',
    status: 429,
    meaning: '요청을 처리할 여유가 없어요. Retry-After 후 다시 시도하거나 파일과 이미지를 URL로 보내 요청 크기를 줄여 주세요.',
  },
  {
    code: 'input_too_long',
    status: 400,
    meaning: '입력이 모델의 최대 입력 길이를 넘었어요. Claude Code에서는 /compact로 대화를 압축하거나 새 대화를 시작해 주세요.',
  },
  {
    code: 'agent_busy',
    status: 429,
    meaning: '자체 서빙 모델에서 긴 요청을 처리하는 자리가 모두 차 있어요. Retry-After 후 다시 시도해 주세요.',
  },
  { code: 'output_limit_exceeded', status: 400, meaning: '요청한 최대 출력 길이가 허용치를 넘었어요.' },
  {
    code: 'unknown_endpoint',
    status: 404,
    meaning:
      '지원하지 않는 경로예요. base URL을 확인해 주세요. OpenAI 호환 클라이언트는 /v1까지, Anthropic 클라이언트는 /v1 없이 적어요.',
  },
  { code: 'method_not_allowed', status: 405, meaning: '지원하지 않는 HTTP 메서드예요.' },
  {
    code: 'streaming_not_supported',
    status: 400,
    meaning: '이미지, 임베딩, 리랭크, TTS, STT 경로는 스트리밍을 지원하지 않아요. stream을 빼고 보내 주세요.',
  },
  {
    code: 'upstream_response_too_large',
    status: 502,
    alsoStatus: 200,
    meaning:
      '응답이 너무 크거나 지금 처리할 여유가 없어요. 잠시 후 다시 요청하거나 출력 크기를 줄여 주세요. 긴 텍스트는 stream으로 받고, 이미지는 개수나 해상도를 줄여요. 유료 요청을 다시 보내면 추가 비용이 들 수 있어요.',
  },
  { code: 'service_disabled', status: 503, meaning: '서비스를 점검하고 있어요.' },
  { code: 'server_busy', status: 503, meaning: '요청이 몰려 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' },
  {
    code: 'upstream_rejected',
    status: 400,
    alsoStatus: 422,
    meaning:
      '모델 서버가 요청을 거부했어요. 「모델 서버 메시지:」가 있다면 이유를 확인해 주세요.',
  },
  { code: 'upstream_error', status: 502, meaning: '모델 서버 호출에 실패했어요.' },
  { code: 'upstream_timeout', status: 504, meaning: '모델 서버 응답이 제한 시간을 넘었어요.' },
  {
    code: 'request_deadline_exceeded',
    status: 200,
    meaning: '요청 시간이 한도를 넘어 스트림이 끊겼어요.',
  },
  {
    code: 'upstream_stream_interrupted',
    status: 200,
    meaning: '모델 서버가 응답 스트림을 끊었어요.',
  },
]
