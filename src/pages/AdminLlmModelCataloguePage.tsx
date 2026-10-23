import { TokenValue } from '../components/TokenValue'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchOpenRouterCatalogue } from '../api/queries'
import { requestReaderKey } from '../api/request-review'
import { useAuth } from '../auth/auth-context'
import { hasWork, SYS_READERS } from '../auth/institution-authority'
import { Alert, Card, FormField, Input, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '../components/ui'
import { formatDateTime } from '../lib/format'
import { ModelPriceDetail } from '../components/ModelPriceDetail'

export function AdminLlmModelCataloguePage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const catalogue = useQuery({ queryKey: ['admin', 'model-catalogue', requestReaderKey(user)], queryFn: fetchOpenRouterCatalogue,
    enabled: hasWork(user, 'llm.model-catalogue.read', {}, SYS_READERS), staleTime: 5 * 60_000 })
  const rows = catalogue.data?.models.filter((model) => `${model.id} ${model.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <div className="space-y-5"><PageHeader title="LLM 모델 목록과 가격" description="현재 저장된 공급자 모델 목록을 참고합니다. 개별 키 사용액이나 사업 계정 재무를 조회하지 않습니다." />
    <FormField label="모델 검색"><Input value={search} onChange={(event) => setSearch(event.target.value)} /></FormField>
    {catalogue.isPending && <Spinner label="모델 목록 불러오는 중" />}
    {catalogue.isError && <Alert variant="danger">{catalogue.error.message}</Alert>}
    {catalogue.data && <><p className="text-sm text-neutral-500">마지막 성공 {formatDateTime(catalogue.data.lastSuccessAt)} · 조회되는 모델 {rows?.length}개</p>
      {catalogue.data.freshness !== 'FRESH' && <Alert>이 목록은 최신 공급자 정보와 다를 수 있습니다. 가격을 확인한 뒤 정책을 선택해 주세요.</Alert>}
      <Card><Table><THead><TR><TH>모델</TH><TH>컨텍스트</TH><TH>가격</TH></TR></THead><TBody>{rows?.map((model) => <TR key={model.id}>
        <TD><strong>{model.name}</strong><span className="block break-all text-xs text-neutral-500">{model.id}</span></TD>
        <TD>{model.contextLength == null ? '정보 없음' : <TokenValue value={model.contextLength} />}</TD>
        <TD><p className="text-xs">백만 토큰당 입력 {model.promptPricePerMillion == null ? '미상' : `$${model.promptPricePerMillion}`} · 출력 {model.completionPricePerMillion == null ? '미상' : `$${model.completionPricePerMillion}`}</p>
          {model.pricing != null && <ModelPriceDetail modelId={model.id} pricing={model.pricing} />}</TD>
      </TR>)}</TBody></Table></Card></>}
  </div>
}
