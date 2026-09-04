import type { ReactNode } from 'react'
import { Button, DescriptionList } from '../ui'
import { STEP_TITLES, type WizardStepId } from './wizard-steps'

export interface ReviewSection {
  step: WizardStepId
  rows: [string, string][]
}

/**
 * 확인 단계.
 *
 * 종전에는 열두 행짜리 평면 표 하나였고, 오타 하나를 고치려면 「이전」을 세 번 눌러야
 * 했다. 이제 값을 입력한 단계별로 나누고 각 구획이 그 단계로 가는 「수정」을 든다.
 * 구획의 제목은 단계 제목 그대로다. 두 곳이 다른 말을 쓰면 「수정」이 어디로 가는지가
 * 흐려진다.
 */
export function ReviewStep({
  sections,
  onEdit,
  notice,
}: {
  sections: ReviewSection[]
  onEdit: (step: WizardStepId) => void
  notice?: ReactNode
}) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.step} aria-labelledby={`review-${section.step}`}>
          <div className="mb-2 flex items-center justify-between">
            <h2
              id={`review-${section.step}`}
              className="text-sm font-semibold text-foreground-primary"
            >
              {STEP_TITLES[section.step]}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onEdit(section.step)}>
              수정
            </Button>
          </div>
          <DescriptionList
            items={section.rows.map(([term, description]) => ({ term, description }))}
          />
        </section>
      ))}
      {notice}
    </div>
  )
}
