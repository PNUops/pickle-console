import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  fetchLlmKeyBodies,
  type LlmApiKeyStatus,
  type LlmKeyBodySummary,
} from '../../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Pagination,
  PermissionNotice,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui'
import { formatDateTimeSeconds } from '../../lib/format'
import { CapturedBodyDrawer } from './CapturedBodyDrawer'

const PAGE_SIZE = 20

/**
 * 이 키로 오간 프롬프트와 응답의 목록.
 *
 * **`recordBodies`로 탭을 숨기지 않는다.** 켰다 끈 사람의 기록은 보관 기간이
 * 끝날 때까지 남아 있고, 탭을 숨기면 그 사람이 자기가 남긴 것을 볼 수 없다.
 * 끄기는 앞으로 무엇을 남길지를 정하는 스위치이지 삭제가 아니다.
 *
 * 목록은 앞부분만 담는다. 전문은 드로어가 따로 받아 오고, 그 호출에만 본인
 * 확인이 붙는다.
 */
export function LlmKeyBodiesSection({
  keyId,
  status,
  recordBodies,
  canEdit,
  onGoToOverview,
}: {
  keyId: string
  status: LlmApiKeyStatus
  recordBodies: boolean
  canEdit: boolean
  onGoToOverview: () => void
}) {
  const [page, setPage] = useState(0)
  const [opened, setOpened] = useState<LlmKeyBodySummary | null>(null)
  // 발급 전 키로는 어떤 요청도 인증되지 않았으므로 물어볼 것이 없다.
  const unissued = status === 'PENDING'
  const bodies = useQuery({
    queryKey: ['llm-keys', keyId, 'bodies', { page }],
    queryFn: () => fetchLlmKeyBodies(keyId, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
    enabled: !unissued,
  })

  if (unissued) {
    return (
      <Alert variant="info" title="아직 발급되지 않은 키입니다">
        발급 전에는 이 키로 인증되는 요청이 없으므로 기록된 본문도 없습니다. 개요 탭에서 키를
        발급하면 그때부터 쌓입니다.
      </Alert>
    )
  }
  if (bodies.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="기록된 본문 불러오는 중" />
      </div>
    )
  }
  if (bodies.isError) {
    return (
      <Alert variant="danger" title="기록된 본문을 불러오지 못했습니다">
        {bodies.error instanceof Error ? bodies.error.message : '잠시 후 다시 시도해 주세요.'}
      </Alert>
    )
  }

  const rows = bodies.data.content
  if (rows.length === 0) {
    return recordBodies ? (
      <EmptyState
        title="아직 기록된 본문이 없습니다"
        description="본문 기록은 켜져 있습니다. 이 키로 요청을 보내면 잠시 뒤에 여기에 나타납니다. 게이트웨이가 모아서 보내므로 방금 보낸 요청은 아직 보이지 않을 수 있습니다."
      />
    ) : (
      <div className="space-y-4">
        <EmptyState
          title="기록된 본문이 없습니다"
          description="이 키는 본문 기록이 꺼져 있어 프롬프트와 응답을 보관하지 않습니다."
          action={
            canEdit ? (
              <Button variant="secondary" onClick={onGoToOverview}>
                개요 탭에서 켜기
              </Button>
            ) : undefined
          }
        />
        {!canEdit && (
          <PermissionNotice>
            본문 기록은 편집자 이상 등급을 받은 사람만 켤 수 있습니다.
          </PermissionNotice>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!recordBodies && (
        <Alert variant="info" title="본문 기록은 지금 꺼져 있습니다">
          아래는 켜져 있던 동안 기록된 것입니다.
        </Alert>
      )}
      {status === 'REVOKED' && (
        <Alert variant="info" title="폐기된 키입니다">
          아래는 폐기되기 전까지 기록된 것입니다.
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>기록된 본문</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <THead>
              <TR>
                <TH>시각</TH>
                <TH>프롬프트</TH>
                <TH>응답</TH>
                <TH>기록 상태</TH>
                <TH>
                  <span className="sr-only">전문</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">
                    {formatDateTimeSeconds(row.requestedAt)}
                  </TD>
                  <TD className="max-w-xs truncate">{row.requestPreview ?? '기록 없음'}</TD>
                  <TD className="max-w-xs truncate">{row.responsePreview ?? '기록 없음'}</TD>
                  <TD className="space-x-1 whitespace-nowrap">
                    {row.requestTruncated && <Badge variant="warning">프롬프트 잘림</Badge>}
                    {row.responseTruncated && <Badge variant="warning">응답 잘림</Badge>}
                    {!row.readable && <Badge variant="neutral">읽을 수 없음</Badge>}
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      // 행마다 다른 이름을 준다. 없으면 스크린리더가 「전문 보기」
                      // 스무 개를 구분 없이 읽는다.
                      aria-label={`${formatDateTimeSeconds(row.requestedAt)} 기록 전문 보기`}
                      onClick={() => setOpened(row)}
                    >
                      전문 보기
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={bodies.data.page}
            totalPages={bodies.data.totalPages}
            onPageChange={setPage}
          />
          {/* 목록이 있는 한 언제나 나오므로, 보관 기간을 말하는 자리는 여기
              하나다. 위의 「꺼져 있습니다」 안내가 같은 말을 하고 있었다. */}
          <p className="text-xs text-neutral-500">
            기록된 본문은 이 키에 접근 권한이 있는 사람이면 누구나 읽을 수 있습니다. 보관 기간은
            30일이고, 지난 것부터 삭제됩니다.
          </p>
        </CardContent>
      </Card>
      <CapturedBodyDrawer keyId={keyId} record={opened} onClose={() => setOpened(null)} />
    </div>
  )
}
