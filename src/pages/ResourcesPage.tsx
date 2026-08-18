import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchResources } from '../api/queries'
import { resourceTypeEntry } from '../components/resource/registry'
import {
  Alert,
  Card,
  LinkButton,
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

/**
 * Everything this person has, whatever kind it is.
 *
 * The per-type lists stay — a VM list can show specifications, which this one
 * cannot — but this is the answer to "what do I have", and it is what the
 * dashboard and a workspace's inventory read.
 */
export function ResourcesPage() {
  const scope = useScope()
  const [page, setPage] = useState(0)
  const resources = useQuery({
    queryKey: ['resources', { page, workspaceId: scope }],
    queryFn: () => fetchResources({ page, workspaceId: scope ?? undefined }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">전체 리소스</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {scope == null
              ? '내가 속한 모든 워크스페이스의 리소스입니다.'
              : '이 워크스페이스의 리소스입니다.'}
          </p>
        </div>
        <LinkButton to={consolePaths.newRequest(scope)}>리소스 신청</LinkButton>
      </div>

      {resources.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="리소스 목록 불러오는 중" />
        </div>
      )}
      {resources.isError && <Alert variant="danger">{resources.error.message}</Alert>}
      {resources.isSuccess && resources.data.content.length === 0 && (
        <Card className="space-y-4 p-8 text-center text-sm text-neutral-500">
          <p>아직 리소스가 없습니다. 신청이 승인되면 이곳에 표시됩니다.</p>
          <LinkButton to={consolePaths.newRequest(scope)}>리소스 신청</LinkButton>
        </Card>
      )}
      {resources.isSuccess && resources.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>이름</TH>
                  <TH>종류</TH>
                  <TH>상태</TH>
                  <TH>워크스페이스</TH>
                  <TH>생성일</TH>
                </TR>
              </THead>
              <TBody>
                {resources.data.content.map((resource) => {
                  const entry = resourceTypeEntry(resource.type)
                  return (
                    <TR key={`${resource.type}-${resource.id}`}>
                      <TD>
                        {/* 접근 권한이 없거나, 이 빌드가 모르는 종류라 상세 화면이
                            없으면 링크 없이 이름만 보여 준다. */}
                        {resource.accessLimited || !entry.detailPath ? (
                          <span className="font-medium text-neutral-500">
                            {resource.displayName || resource.name}
                          </span>
                        ) : (
                          <Link
                            to={entry.detailPath(resource.id)}
                            className="font-medium text-primary-700 hover:underline"
                          >
                            {resource.displayName || resource.name}
                          </Link>
                        )}
                        {resource.displayName && (
                          <span className="ml-1 text-xs text-neutral-400">{resource.name}</span>
                        )}
                        {resource.accessLimited && (
                          <p className="mt-0.5 text-xs text-neutral-500">
                            접근 권한이 없습니다
                            {resource.ownerNames.length > 0 &&
                              ` — ${resource.ownerNames.join(', ')} 님에게 요청하세요`}
                            {resource.accessManageAllowed && entry.accessPath && (
                              <>
                                {' '}
                                <Link
                                  to={entry.accessPath(resource.id)}
                                  className="font-medium text-primary-700 hover:underline"
                                >
                                  접근 권한 관리
                                </Link>
                              </>
                            )}
                          </p>
                        )}
                      </TD>
                      <TD>{entry.label}</TD>
                      <TD>{entry.statusBadge(resource)}</TD>
                      <TD>{resource.workspaceName}</TD>
                      <TD className="whitespace-nowrap">{formatDateTime(resource.createdAt)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={resources.data.page}
            totalPages={resources.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
