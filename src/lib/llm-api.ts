import { LLM_GATEWAY_HOST } from './hosts'

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
export const LLM_API_BASE_URL = `https://${LLM_GATEWAY_HOST}/v1`

/** 자체 서빙 모델의 공개 이름. 실제 모델과 분리되어 있어 업스트림이 바뀌어도 유지된다. */
export const LLM_DEFAULT_MODEL = 'pickle-general'

/**
 * 게이트웨이가 업스트림으로 넘기는 요청 필드. 목록에 없는 최상위 필드는 무시가 아니라
 * 거부이므로, 무엇을 보낼 수 있는지가 사용자에게 보여야 한다.
 */
export const LLM_SUPPORTED_PARAMS = [
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

/** 키에 별도 한도가 부여되지 않았을 때 적용되는 값. 배포된 게이트웨이 환경 기준. */
export const LLM_DEFAULT_LIMITS = {
  requestsPerMinute: 20,
  tokensPerMinute: 30_000,
  concurrency: 2,
} as const

export interface LlmErrorEntry {
  /** 응답 본문의 `error.code`. 메시지 문구와 달리 바뀌지 않는 식별자다. */
  code: string
  status: number
  meaning: string
}

/** 사용자에게 도달하는 에러. 판정은 메시지가 아니라 `code`로 한다. */
export const LLM_ERROR_CODES: LlmErrorEntry[] = [
  { code: 'missing_api_key', status: 401, meaning: 'Authorization 헤더가 없습니다.' },
  { code: 'invalid_api_key', status: 401, meaning: '콘솔에서 발급한 키가 아닙니다.' },
  { code: 'api_key_expired', status: 401, meaning: '키의 유효기간이 지났습니다.' },
  { code: 'api_key_revoked', status: 401, meaning: '폐기된 키입니다.' },
  { code: 'account_suspended', status: 403, meaning: '계정 이용이 정지된 상태입니다.' },
  { code: 'model_not_found', status: 404, meaning: '그런 이름의 모델이 없습니다.' },
  { code: 'model_not_allowed', status: 403, meaning: '이 키로는 쓸 수 없는 모델입니다.' },
  { code: 'rate_limit_requests', status: 429, meaning: '분당 요청 횟수를 초과했습니다.' },
  { code: 'rate_limit_tokens', status: 429, meaning: '분당 토큰 사용량을 초과했습니다.' },
  { code: 'rate_limit_concurrency', status: 429, meaning: '동시 요청 수를 초과했습니다.' },
  { code: 'quota_exhausted', status: 429, meaning: '부여된 사용량을 모두 썼습니다.' },
  { code: 'credit_unavailable', status: 403, meaning: '상용 모델을 쓸 금액 한도가 없습니다.' },
  {
    code: 'credit_pending',
    status: 503,
    meaning: '승인된 금액 한도를 적용하는 중입니다. 잠시 후 다시 시도하면 됩니다.',
  },
  { code: 'credit_exhausted', status: 429, meaning: '상용 모델의 금액 한도를 모두 썼습니다.' },
  { code: 'unsupported_parameter', status: 400, meaning: '지원 목록에 없는 필드를 보냈습니다.' },
  { code: 'invalid_parameter_value', status: 400, meaning: '파라미터 값이 허용 범위 밖입니다.' },
  { code: 'missing_parameter', status: 400, meaning: '필수 파라미터가 빠졌습니다.' },
  { code: 'invalid_json', status: 400, meaning: '요청 본문이 올바른 JSON이 아닙니다.' },
  { code: 'request_too_large', status: 400, meaning: '요청 본문이 허용 크기를 넘었습니다.' },
  { code: 'input_too_long', status: 400, meaning: '입력이 모델의 최대 입력 길이를 넘었습니다.' },
  { code: 'output_limit_exceeded', status: 400, meaning: '요청한 최대 출력 길이가 허용치를 넘었습니다.' },
  {
    code: 'unknown_endpoint',
    status: 404,
    meaning:
      '지원하지 않는 경로입니다. 메시지에 적힌 경로는 지원 범위이지 보낸 경로가 아니므로, base URL에 /v1이 붙어 있는지 먼저 확인합니다.',
  },
  { code: 'method_not_allowed', status: 405, meaning: '지원하지 않는 HTTP 메서드입니다.' },
  { code: 'service_disabled', status: 503, meaning: '서비스가 점검 중입니다.' },
  { code: 'server_busy', status: 503, meaning: '요청이 몰려 처리하지 못했습니다. 한도는 차감되지 않습니다.' },
  { code: 'upstream_rejected', status: 400, meaning: '모델 서버가 요청을 거부했습니다.' },
  { code: 'upstream_error', status: 502, meaning: '모델 서버 호출에 실패했습니다.' },
  { code: 'upstream_timeout', status: 504, meaning: '모델 서버 응답이 제한 시간을 넘었습니다.' },
]
