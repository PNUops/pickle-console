import { useNavigate } from 'react-router'
import { Card, CardContent, PageHeader } from '../ui'
import { CardRadioGroup } from '../ui/CardRadioGroup'
import { REQUEST_KINDS, KIND_PICKER_FOOTNOTE } from './index'
import { useScope } from '../../lib/use-scope'
import { consolePaths } from '../../lib/paths'

/**
 * 무엇을 신청할지 고르는 화면.
 *
 * **위저드의 첫 단계가 아니라 위저드 앞의 화면이다.** 종류를 아는 자리에서
 * 들어오면 이 화면을 지나지 않으므로, 단계로 두면 위저드의 길이가 진입 경로마다
 * 달라진다. 그러면 스텝퍼의 「1」이 사람마다 다른 화면을 가리키고, 첫 단계의
 * 「이전」은 언제나 눌리지 않는 버튼으로 남는다.
 *
 * 화면 밖으로 나가는 것은 주소 하나뿐이다. 고르면 `?kind=`를 실은 같은 경로로
 * 이동하고, 그 뒤로는 어느 진입이든 똑같은 3단계 위저드다.
 */
export function KindPicker() {
  const navigate = useNavigate()
  const scope = useScope()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="리소스 신청"
        description="무엇이 필요한지 고르면 다음 화면에서 자세히 묻습니다."
      />

      <Card>
        <CardContent className="py-6">
          <div className="space-y-4">
            <CardRadioGroup
              legend="무엇을 신청할까요"
              value=""
              onChange={(type) => navigate(consolePaths.newRequest(scope, type))}
              options={REQUEST_KINDS.map((entry) => ({
                value: entry.type,
                title: entry.picker.title,
                description: entry.picker.description,
              }))}
            />
            <p className="text-xs text-foreground-muted">{KIND_PICKER_FOOTNOTE}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
