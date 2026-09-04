import { describe, expect, test } from 'vitest'
import {
  LLM_API_BASE_URL,
  LLM_DEFAULT_LIMITS,
  LLM_DEFAULT_MODEL,
  LLM_ERROR_CODES,
  LLM_SUPPORTED_PARAMS,
} from './llm-api'

/**
 * 이 파일의 값은 게이트웨이 설정의 사본이고, 사본은 조용히 틀어진다. 화면에 그 값이
 * 나타나는지만 보는 시험은 사본이 바뀌어도 통과하므로, 여기서는 사본 자체를 얼려 둔다.
 * 게이트웨이가 바뀌어 이 시험이 깨지면 그것이 정상이고, 깨진 값을 확인한 뒤 고친다.
 */
describe('LLM API 사실 사본', () => {
  test('지원 파라미터는 게이트웨이 허용 목록과 같은 17개다', () => {
    expect([...LLM_SUPPORTED_PARAMS]).toEqual([
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
    ])
  })

  test('기본 한도는 배포된 게이트웨이 환경 값이다', () => {
    // 셋 다 배포 env가 덮는다. 코드 기본값(20 / 20,000 / 2)을 적으면 아무 키도 받지
    // 않는 숫자가 되므로, 이 값을 고칠 때는 라이브 env를 읽고 고친다. 이 시험은
    // 사본이 정본과 같은지 보지 못한다. 동시 요청은 2026-09-03과 09-04 사이에 32를
    // 거쳐 8이 됐고, 그 사이 이 시험은 옛 값을 초록으로 지키고 있었다.
    expect(LLM_DEFAULT_LIMITS).toEqual({
      requestsPerMinute: 600,
      tokensPerMinute: 1_000_000,
      concurrency: 8,
    })
  })

  test('에러 표는 사용자에게 도달하는 30개이고 상태 코드가 함께 고정된다', () => {
    expect(LLM_ERROR_CODES).toHaveLength(30)
    const byCode = Object.fromEntries(LLM_ERROR_CODES.map((e) => [e.code, e.status]))
    expect(byCode).toEqual({
      missing_api_key: 401,
      invalid_api_key: 401,
      api_key_expired: 401,
      api_key_revoked: 401,
      account_suspended: 403,
      model_not_found: 404,
      model_not_allowed: 403,
      rate_limit_requests: 429,
      rate_limit_tokens: 429,
      rate_limit_concurrency: 429,
      quota_exhausted: 429,
      credit_unavailable: 403,
      credit_pending: 503,
      credit_exhausted: 429,
      unsupported_parameter: 400,
      invalid_parameter_value: 400,
      missing_parameter: 400,
      invalid_json: 400,
      request_too_large: 400,
      input_too_long: 400,
      output_limit_exceeded: 400,
      unknown_endpoint: 404,
      method_not_allowed: 405,
      service_disabled: 503,
      server_busy: 503,
      upstream_rejected: 400,
      upstream_error: 502,
      upstream_timeout: 504,
      request_deadline_exceeded: 200,
      upstream_stream_interrupted: 200,
    })
  })

  test('내부에서만 쓰는 sentinel은 표에 실리지 않는다', () => {
    // 게이트웨이가 클라이언트에 절대 내보내지 않는 것들이다.
    const internal = [
      'unconfigured_upstream',
      'no_key_credential',
      'upstream_auth',
      'upstream_status',
      'upstream_throttled',
    ]
    const codes = LLM_ERROR_CODES.map((e) => e.code)
    for (const code of internal) expect(codes).not.toContain(code)
  })

  test('base URL은 /v1까지 포함한다', () => {
    expect(LLM_API_BASE_URL).toBe('https://llm.pcl.kr/v1')
    expect(LLM_DEFAULT_MODEL).toBe('pickle-general')
  })
})
