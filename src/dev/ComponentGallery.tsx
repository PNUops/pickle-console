import { Add24Regular, Delete24Regular, Settings24Regular } from '@fluentui/react-icons'
import { Logo, PickleSymbol } from '../components/Logo'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CommandBar,
  DataTable,
  DescriptionList,
  EmptyState,
  FormField,
  Input,
  LoadingBlock,
  MessageBar,
  PageHeader,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'

const swatches = [
  ['canvas', 'bg-surface-canvas'],
  ['card', 'bg-surface-card'],
  ['subtle', 'bg-surface-subtle'],
  ['brand', 'bg-brand-fill'],
  ['success', 'bg-status-success'],
  ['warning', 'bg-status-warning'],
  ['danger', 'bg-status-danger'],
] as const

export function ComponentGallery() {
  return (
    <main className="min-h-svh bg-surface-canvas px-4 py-8 text-foreground-primary sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="개발 전용"
          title="Pickle foundation gallery"
          description="semantic token, density, branding과 운영 콘솔 primitive를 한곳에서 확인합니다."
          actions={<Button>주요 동작</Button>}
        />

        <Card>
          <CardHeader>
            <CardTitle>Brand surfaces</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-8">
            <Logo variant="brand" />
            <Logo variant="endorsement" />
            <PickleSymbol className="size-4" />
            <div data-theme="auth-dark" className="rounded-panel bg-surface-canvas p-4">
              <Logo tone="inverse" variant="brand" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Semantic tokens</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {swatches.map(([label, color]) => (
              <div key={label}>
                <div className={`h-14 rounded-panel border border-stroke-subtle ${color}`} />
                <p className="type-caption mt-1 text-foreground-muted">{label}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <h2 className="type-section-title">Actions and messages</h2>
          <CommandBar
            aria-label="리소스 동작"
            primary={
              <>
                <Button size="sm">
                  <Add24Regular aria-hidden="true" className="size-4" />
                  만들기
                </Button>
                <Button size="sm" variant="secondary">
                  <Settings24Regular aria-hidden="true" className="size-4" />
                  설정
                </Button>
              </>
            }
            secondary={
              <Button size="sm" variant="danger">
                <Delete24Regular aria-hidden="true" className="size-4" />
                삭제
              </Button>
            }
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <MessageBar title="정보">목록은 30초마다 새로고침됩니다.</MessageBar>
            <MessageBar variant="success" title="완료">
              변경 사항을 저장했습니다.
            </MessageBar>
            <MessageBar variant="warning" title="확인 필요">
              한도를 변경하면 다음 요청부터 적용됩니다.
            </MessageBar>
            <MessageBar variant="danger" title="처리 실패">
              잠시 후 다시 시도하세요.
            </MessageBar>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Fields and descriptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField label="이름" description="운영자가 구분할 수 있는 이름입니다.">
                <Input defaultValue="LLM API key" />
              </FormField>
              <DescriptionList
                items={[
                  { term: '상태', description: '활성' },
                  { term: '기관', description: '부산대학교' },
                  { term: '워크스페이스', description: 'cloud-platform' },
                  { term: '마지막 사용', description: '방금 전' },
                ]}
              />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <LoadingBlock compact />
            <EmptyState title="표시할 리소스가 없습니다" description="scope나 필터를 바꿔 보세요." />
          </div>
        </section>

        <section data-density="compact" className="space-y-2">
          <h2 className="type-section-title">Compact admin data table</h2>
          <DataTable caption="LLM API key 목록">
            <THead>
              <TR>
                <TH>이름</TH>
                <TH>상태</TH>
                <TH>RPM</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD>research-assistant</TD>
                <TD>활성</TD>
                <TD>60</TD>
              </TR>
              <TR>
                <TD>capstone-demo</TD>
                <TD>중지</TD>
                <TD>20</TD>
              </TR>
            </TBody>
          </DataTable>
        </section>
      </div>
    </main>
  )
}
