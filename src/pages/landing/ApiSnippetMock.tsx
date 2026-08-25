import { LLM_GATEWAY_HOST } from '../../lib/hosts'

/**
 * LLM API 호출을 그대로 보여 주는 코드 목업 — TerminalMock과 같은 타이틀 바 문법.
 * 타이핑 연출 없이 완성된 요청을 보여 준다(핵심은 base URL과 키 헤더뿐이라는 것).
 */
export function ApiSnippetMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-overlay">
      {/* 타이틀 바 */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span aria-hidden="true" className="size-3 rounded-full bg-danger-400/80" />
        <span aria-hidden="true" className="size-3 rounded-full bg-warning-400/80" />
        <span aria-hidden="true" className="size-3 rounded-full bg-success-400/80" />
        <span className="ml-2 font-mono text-xs text-neutral-400">curl — LLM API</span>
      </div>
      {/* 요청 */}
      <div className="min-h-44 overflow-x-auto p-5 font-mono text-[13px] leading-7 text-neutral-300">
        <p>
          <span className="text-primary-400">$</span> curl https://
          <span className="text-primary-300">{LLM_GATEWAY_HOST}</span>/v1/chat/completions \
        </p>
        <p className="pl-6">
          -H <span className="text-success-400">&quot;Authorization: Bearer sk-...&quot;</span> \
        </p>
        <p className="pl-6">
          -d{' '}
          <span className="text-success-400">
            {'\'{"model": "pickle-general", "messages": [...]}\''}
          </span>
        </p>
        <p className="mt-2 text-neutral-500">{'{"choices": [{"message": ...}]}'}</p>
      </div>
    </div>
  )
}
