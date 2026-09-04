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
