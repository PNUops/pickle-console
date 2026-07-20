import type { ReactNode } from 'react'
import { Reveal } from './Reveal'

/** 라이트 본문 섹션 공통 헤딩 — 모노 이브로우 + 대형 타이틀 + 선택 설명. */
export function SectionHeading({
  eyebrow,
  title,
  titleId,
  description,
}: {
  eyebrow: string
  title: string
  titleId: string
  description?: ReactNode
}) {
  return (
    <Reveal className="max-w-2xl">
      <p className="font-mono text-sm font-semibold text-primary-600">{eyebrow}</p>
      <h2
        id={titleId}
        className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-lg leading-relaxed text-neutral-600">{description}</p>
      ) : null}
    </Reveal>
  )
}
