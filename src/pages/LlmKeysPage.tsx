import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchLlmKeys } from '../api/queries'
import {
  Alert,
  Card,
  LlmKeyStatusBadge,
  Pagination,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { consolePaths } from '../lib/paths'
import { useScope } from '../lib/use-scope'

export function LlmKeysPage() {
  const scope = useScope()
  const [page, setPage] = useState(0)
  const keys = useQuery({
    queryKey: ['llm-keys', { page, workspaceId: scope }],
    queryFn: () => fetchLlmKeys({ page, workspaceId: scope ?? undefined }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">내 LLM API 키</h1>
        <p className="mt-1 text-sm text-neutral-500">
          내가 속한 워크스페이스의 LLM API 키 목록입니다. 승인된 신청의 키는 소유자가 직접
          발급해야 쓸 수 있습니다.
        </p>
      </div>

      {keys.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="LLM API 키 목록 불러오는 중" />
        </div>
      )}
      {keys.isError && <Alert variant="danger">{keys.error.message}</Alert>}
      {keys.isSuccess && keys.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          아직 LLM API 키가 없습니다. 신청이 승인되면 이곳에 표시됩니다.
        </Card>
      )}
      {keys.isSuccess && keys.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>이름</TH>
                  <TH>상태</TH>
                  <TH>키 앞부분</TH>
                  <TH>마지막 사용</TH>
                  <TH>워크스페이스</TH>
                  <TH>생성일</TH>
                </TR>
              </THead>
              <TBody>
                {keys.data.content.map((key) => (
                  <TR key={key.id}>
                    <TD>
                      {key.accessLimited ? (
                        <span className="font-medium text-neutral-500">{key.name}</span>
                      ) : (
                        <Link
                          to={consolePaths.llmKeyDetail(key.id)}
                          className="font-medium text-primary-700 hover:underline"
                        >
                          {key.name}
                        </Link>
                      )}
                      {key.purpose && (
                        <p className="mt-0.5 truncate text-xs text-neutral-500">{key.purpose}</p>
                      )}
                      {key.accessLimited && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          접근 권한이 없습니다
                          {key.ownerNames.length > 0 &&
                            ` — ${key.ownerNames.join(', ')} 님에게 요청하세요`}
                          {/* 워크스페이스 소유자는 이 키 안을 볼 수 없어도 누가 접근할지는
                              정할 수 있다. 상세로 못 들어가므로 목록이 그 유일한
                              진입점이고, 소유자가 떠난 키를 되살리는 길이기도 하다. */}
                          {key.accessManageAllowed && (
                            <>
                              {' '}
                              <Link
                                to={consolePaths.llmKeyAccess(key.id)}
                                className="font-medium text-primary-700 hover:underline"
                              >
                                접근 권한 관리
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <LlmKeyStatusBadge status={key.status} />
                    </TD>
                    {/* 아직 발급 전이거나(값이 없다) 접근 권한이 없어 서버가 필드를
                        빼고 내려준 경우다. 어느 쪽인지는 상태 배지와 이름 칸이 이미
                        말하므로 여기서 되풀이하지 않는다. */}
                    <TD className="font-mono text-xs whitespace-nowrap">
                      {key.tokenPrefix ?? '—'}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {key.lastUsedAt
                        ? formatDateTime(key.lastUsedAt)
                        : key.accessLimited
                          ? '—'
                          : '사용 기록 없음'}
                    </TD>
                    <TD>{key.workspaceName}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(key.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination page={keys.data.page} totalPages={keys.data.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
