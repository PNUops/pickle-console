import { useQuery } from '@tanstack/react-query'

import { fetchLlmKeyBody, type LlmKeyBodySummary } from '../../api/queries'
import { Alert, Badge, Drawer, Spinner } from '../ui'
import { CopyButton } from '../CopyButton'
import { formatDateTimeSeconds } from '../../lib/format'
import { readPrompt, type PromptView } from './prompt-view'

/**
 * 기록 한 건의 전문.
 *
 * 드로어인 이유는 목록 맥락(페이지, 스크롤 위치)을 지키면서 보조 상세를 읽는
 * 자리이기 때문이다. 별도 주소로 빼지 않는 이유는 따로 있다 — 본문은 남에게
 * 링크로 던질 것이 아니라 개인의 프롬프트다.
 *
 * 전문 조회에는 본인 확인이 붙는다. 열 때 물어보고, 토큰이 살아 있는 동안
 * 연달아 열면 다시 묻지 않는다.
 */
export function CapturedBodyDrawer({
  keyId,
  record,
  onClose,
}: {
  keyId: string
  record: LlmKeyBodySummary | null
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['llm-keys', keyId, 'bodies', record?.id],
    queryFn: () => fetchLlmKeyBody(keyId, record?.id ?? ''),
    enabled: Boolean(record),
  })

  return (
    <Drawer
      open={Boolean(record)}
      onClose={onClose}
      className="sm:max-w-3xl"
      title={record ? `${formatDateTimeSeconds(record.requestedAt)} 기록` : '기록'}
    >
      {detail.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="전문 불러오는 중" />
        </div>
      )}
      {detail.isError && (
        <Alert variant="danger" title="전문을 불러오지 못했습니다">
          {detail.error instanceof Error ? detail.error.message : '잠시 후 다시 시도해 주세요.'}
        </Alert>
      )}
      {detail.data && (
        <div className="space-y-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-500">시각</dt>
            <dd className="font-mono text-xs">{formatDateTimeSeconds(detail.data.requestedAt)}</dd>
            <dt className="text-neutral-500">이벤트</dt>
            <dd className="flex items-center gap-2 font-mono text-xs">
              {detail.data.eventUuid}
              <CopyButton value={detail.data.eventUuid} label="이벤트 식별자" />
            </dd>
          </dl>

          {!detail.data.readable && (
            <Alert variant="warning" title="본문을 읽을 수 없습니다">
              이 기록을 푸는 암호화 키가 서버에 없습니다. 기록이 있었다는 사실만 남아 있습니다.
            </Alert>
          )}

          <PromptSection view={readPrompt(detail.data.request)} truncated={detail.data.requestTruncated} />
          <AnswerSection text={detail.data.response} truncated={detail.data.responseTruncated} />
        </div>
      )}
    </Drawer>
  )
}

function Block({ children }: { children: React.ReactNode }) {
  return (
    <pre
      // 스크롤되는 영역이라 키보드로 닿아야 한다. 줄바꿈을 주는 이유는 개행
      // 없는 긴 응답 하나가 끝없는 가로 스크롤이 되기 때문이다.
      tabIndex={0}
      className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words rounded-panel border border-stroke-subtle bg-surface-subtle p-3 text-sm"
    >
      {children}
    </pre>
  )
}

function PromptSection({ view, truncated }: { view: PromptView | null; truncated: boolean }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">프롬프트</h3>
      {view === null && <p className="text-sm text-neutral-500">기록되지 않았습니다.</p>}
      {view?.kind === 'messages' &&
        view.messages.map((message, index) => (
          <div key={index} className="space-y-1">
            <Badge variant="neutral">
              <span className="font-mono">{message.role}</span>
            </Badge>
            <Block>{message.text}</Block>
            {message.nonText > 0 && (
              <p className="text-xs text-neutral-500">
                텍스트가 아닌 항목 {message.nonText}개는 기록되지 않았습니다.
              </p>
            )}
          </div>
        ))}
      {view?.kind === 'text' && (
        <>
          <Block>{view.text}</Block>
          {/* 두 모양이 한 화면에 공존하는 이유를 그 자리에서 말한다. 없으면
              「어떤 기록은 왜 역할별로 나뉘고 어떤 것은 왜 뭉쳐 있나」를 영원히
              모른다. */}
          <p className="text-xs text-neutral-500">
            길이 제한에 걸려 앞부분만 글자 그대로 기록됐습니다. 역할별로 나눌 수 없어 한 덩어리로
            보입니다.
          </p>
        </>
      )}
      {view?.kind === 'raw' && (
        <>
          <Block>{view.text}</Block>
          <p className="text-xs text-neutral-500">
            기록된 모양이 예상과 달라 원문 그대로 보입니다.
          </p>
        </>
      )}
      {truncated && (
        <Alert variant="warning" title="프롬프트가 잘렸습니다">
          프롬프트가 64 KiB를 넘어 앞부분만 기록됐습니다.
        </Alert>
      )}
    </section>
  )
}

function AnswerSection({ text, truncated }: { text?: string | null; truncated: boolean }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">응답</h3>
      {text ? <Block>{text}</Block> : <p className="text-sm text-neutral-500">기록되지 않았습니다.</p>}
      {truncated && (
        <Alert variant="warning" title="응답이 잘렸습니다">
          응답이 256 KiB를 넘어 앞부분만 기록됐습니다.
        </Alert>
      )}
    </section>
  )
}
