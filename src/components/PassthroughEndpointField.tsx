import { Checkbox } from './ui'
import {
  PASSTHROUGH_ENDPOINTS,
  passthroughLabel,
  togglePassthrough,
  unknownPassthrough,
} from '../lib/passthrough-endpoints'

/**
 * 부여할 확장 기능을 고르는 체크박스.
 *
 * 값이 닫힌 집합이라 자유 입력이 아니라 체크로 받는다. 유료 모델 목록 둘은 벤더가
 * 계속 늘리는 이름이라 적어 넣을 수밖에 없지만, 이쪽은 고를 것이 정해져 있어서
 * 텍스트 칸으로 두면 오타 하나가 아무것도 열지 않는 승인이 된다.
 *
 * 승인 폼과 관리자 한도 창이 같은 결정을 내리는 자리라 부여 문구를 여기 한 곳에 둔다.
 * 두 화면이 갈리면 같은 값을 다른 뜻으로 설명하게 된다. 사업 계정 화면은 부여가 아니라
 * 프리필이라 자기 문구를 넘긴다.
 *
 * `FormField` 대신 `fieldset` 을 쓴다. 그 컴포넌트의 라벨은 컨트롤 하나를 가리키는데
 * 여기에는 체크가 여럿이라 가리킬 자리가 없다.
 */
const GRANT_DESCRIPTION =
  '체크한 기능만 열립니다. 비워 두면 하나도 열리지 않습니다. 비우면 제한이 풀리는 위 두 모델 목록과 읽는 방향이 반대입니다. 채팅과 모델 조회는 이 항목과 무관합니다.'

export function PassthroughEndpointField({
  label,
  value,
  onChange,
  description = GRANT_DESCRIPTION,
  error,
}: {
  label: string
  value: readonly string[]
  onChange: (next: string[]) => void
  description?: string
  error?: string
}) {
  const unknown = unknownPassthrough(value)
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground-secondary">{label}</legend>
      <p className="text-xs text-foreground-muted">{description}</p>
      <div className="space-y-2">
        {PASSTHROUGH_ENDPOINTS.map((endpoint) => (
          <Checkbox
            key={endpoint}
            checked={value.includes(endpoint)}
            onChange={(event) =>
              onChange(togglePassthrough(value, endpoint, event.target.checked))
            }
            label={passthroughLabel(endpoint)}
          />
        ))}
      </div>
      {unknown.length > 0 ? (
        <p className="text-sm text-foreground-muted">
          이 화면에 없는 기능 {unknown.join(', ')}이(가) 함께 부여되어 있고, 저장해도 그대로
          남습니다.
        </p>
      ) : null}
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
    </fieldset>
  )
}
