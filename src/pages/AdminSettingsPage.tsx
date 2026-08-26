import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSettings, updateSetting, type SettingView } from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly } from '../auth/permissions'
import {
  SettingValueEditor,
} from '../components/SettingValueEditor'
import { draftOf, parseSettingValue, type SettingDraft } from '../lib/settings-value'
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  Modal,
  PermissionNotice,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'

/** 설정 현재값 표시 — valueType별 표현. */
function SettingValue({ setting }: { setting: SettingView }) {
  if (setting.valueType === 'BOOLEAN') {
    return setting.value === true ? (
      <Badge variant="success">활성</Badge>
    ) : (
      <Badge variant="neutral">비활성</Badge>
    )
  }
  if (setting.valueType === 'JSON') {
    // 예약어 목록처럼 수백 항목짜리 배열이 셀을 무한정 늘리지 않도록 두 줄로
    // 잘라 보여 준다 — 전체 값은 수정 모달에서 확인한다.
    const itemCount = Array.isArray(setting.value) ? setting.value.length : null
    return (
      <div className="max-w-md">
        {itemCount !== null && (
          <span className="mb-0.5 block text-xs text-neutral-500">{itemCount}개 항목</span>
        )}
        <code className="line-clamp-2 block break-all font-mono text-xs text-neutral-700">
          {JSON.stringify(setting.value)}
        </code>
      </div>
    )
  }
  return <span className="font-mono text-sm">{String(setting.value)}</span>
}

/** 플랫폼 설정 — SYS_ADMIN이 운영 설정 값을 조회·수정한다. */
export function AdminSettingsPage() {
  const { user } = useAuth()
  // 설정 수정은 SYS_ADMIN 전용(§4) — 시스템 운영자와 열람자는 조회만.
  const canEdit = !!user && isSysAdminOnly(user.role)
  const [editTarget, setEditTarget] = useState<SettingView | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchSettings,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">플랫폼 설정</h1>
        <p className="mt-1 text-sm text-neutral-500">
          플랫폼 운영 설정입니다. 모든 변경은 감사 로그에 기록됩니다.
        </p>
        {!canEdit && (
          <PermissionNotice>
            설정 수정은 시스템 관리자만 수행할 수 있습니다.
          </PermissionNotice>
        )}
      </div>

      {message && <Alert variant="info">{message}</Alert>}

      {settings.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="설정 불러오는 중" />
        </div>
      )}
      {settings.isError && <Alert variant="danger">{settings.error.message}</Alert>}
      {settings.isSuccess && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>키</TH>
                <TH>설명</TH>
                <TH>현재값</TH>
                <TH>수정 시각</TH>
                <TH>
                  <span className="sr-only">수정</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {settings.data.map((setting) => (
                <TR key={setting.key}>
                  <TD className="font-mono text-xs">{setting.key}</TD>
                  <TD className="max-w-sm text-sm text-neutral-600">
                    {setting.description}
                  </TD>
                  <TD>
                    <SettingValue setting={setting} />
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-neutral-500">
                    {formatDateTime(setting.updatedAt)}
                  </TD>
                  <TD className="text-right">
                    {/* editable=false는 조회 전용 (수정 시도 시 404) — 버튼 자체를 숨긴다 */}
                    {setting.editable && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => setEditTarget(setting)}
                      >
                        수정
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {editTarget && (
        <EditSettingModal
          setting={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={(text) => {
            setEditTarget(null)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

function EditSettingModal({
  setting,
  onClose,
  onDone,
}: {
  setting: SettingView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<SettingDraft>(() =>
    draftOf(setting.valueType, setting.value),
  )
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirmKillSwitch, setConfirmKillSwitch] = useState(false)

  const save = useMutation({
    mutationFn: (value: unknown) => updateSetting(setting.key, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      onDone(`'${setting.key}' 설정이 저장되었습니다.`)
    },
    onError: (err) => {
      setConfirmKillSwitch(false)
      const apiError = toApiError(err, '설정을 수정하지 못했습니다.')
      const fields = fieldErrorsOf(apiError.problem)
      setFieldError(fields.value ?? null)
      setError(fields.value ? null : apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldError(null)
    const parsed = parseSettingValue(setting.valueType, draft)
    if (!parsed.ok) {
      setFieldError(parsed.message)
      return
    }
    // SSH 킬 스위치를 끄는 방향은 사용자 전원 차단이라 별도 위험 확인을 거친다.
    if (setting.key === 'ssh_gateway_enabled' && parsed.value === false) {
      setConfirmKillSwitch(true)
      return
    }
    save.mutate(parsed.value)
  }

  return (
    <>
      <Modal open onClose={onClose} title={`설정 수정 — ${setting.key}`}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-neutral-600">{setting.description}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          <FormField label="값" required error={fieldError ?? undefined}>
            <SettingValueEditor
              valueType={setting.valueType}
              draft={draft}
              onChange={setDraft}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" loading={save.isPending}>
              저장
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmKillSwitch}
        onClose={() => setConfirmKillSwitch(false)}
        title="SSH 게이트웨이 비활성화"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmKillSwitch(false)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={save.isPending}
              onClick={() => save.mutate(false)}
            >
              비활성화
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-700">
          모든 사용자 SSH 접속이 차단됩니다. 계속할까요?
        </p>
      </Modal>
    </>
  )
}
