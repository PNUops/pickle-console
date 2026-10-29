import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { canQueryWork, SYS_READERS } from '../auth/institution-authority'
import { useAdminScope } from '../lib/use-admin-scope'
import { adminPath } from '../lib/paths'
import { TokenValue } from '../components/TokenValue'
import { Card, FormField, Input, PageHeader, Table, TBody, TD, TH, THead, TR } from '../components/ui'
import { ModelPriceDetail } from '../components/ModelPriceDetail'
import { ModelCatalogueStatus } from '../components/ModelCatalogueStatus'
import { useModelCatalogue } from '../lib/use-model-catalogue'
import { useListUrl } from '../lib/use-list-url'

export function AdminLlmModelCataloguePage() {
  const state = useModelCatalogue()
  const { user } = useAuth()
  const { activeOrgId } = useAdminScope()
  const [params, change] = useListUrl()
  const search = params.get('q') ?? ''
  const catalogue = state.canRead ? state.query.data : undefined
  const rows = catalogue?.models.filter((model) => `${model.id} ${model.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return <div className="space-y-5"><PageHeader title="LLM 모델 목록과 가격" description="현재 저장된 공급자 모델 목록을 참고합니다. 개별 키 사용액이나 사업 계정 재무를 조회하지 않습니다." />
    {canQueryWork(user, ['llm.observe'], { orgId: activeOrgId }, SYS_READERS) && <Link className="text-sm underline" to={adminPath('/admin/llm/status', activeOrgId)}>자체 서빙 모델의 주·대체 공급원 연결 확인</Link>}
    <ModelCatalogueStatus state={state} />
    <FormField label="모델 검색"><Input value={search} onChange={(event) => change({ q: event.target.value || undefined }, false, true)} /></FormField>
    {catalogue && <><p className="text-sm text-neutral-500">검색 결과 {rows?.length}개 / 저장된 모델 {catalogue.models.length}개</p>
      <Card><Table><THead><TR><TH>모델</TH><TH>컨텍스트</TH><TH>가격</TH></TR></THead><TBody>{rows?.map((model) => <TR key={model.id}>
        <TD><strong>{model.name}</strong><span className="block break-all text-xs text-neutral-500">{model.id}</span></TD>
        <TD>{model.contextLength == null ? '정보 없음' : <TokenValue value={model.contextLength} />}</TD>
        <TD><p className="text-xs">백만 토큰당 입력 {model.promptPricePerMillion == null ? '미상' : `$${model.promptPricePerMillion}`} · 출력 {model.completionPricePerMillion == null ? '미상' : `$${model.completionPricePerMillion}`}</p>
          {model.pricing != null && <ModelPriceDetail modelId={model.id} pricing={model.pricing} />}</TD>
      </TR>)}</TBody></Table></Card>
      {rows?.length === 0 && <p className="text-sm text-foreground-muted">{catalogue.models.length === 0 ? '현재 응답에 모델이 없습니다. 위의 공급자 갱신 상태를 확인해 주세요.' : '검색 조건에 맞는 모델이 없습니다.'}</p>}
      <p className="text-xs text-foreground-muted">이 목록과 모델 패턴은 후보를 찾는 자료입니다. 실제 호출은 키의 기능 권한, 예산과 연결 상태, 공급자 지원 등 추가 조건에 따릅니다.</p>
    </>}
  </div>
}
