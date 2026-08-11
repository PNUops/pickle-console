import type { ReactNode } from 'react'

/** 신청 상세 카드(dl) 안의 라벨-값 한 쌍 — 공통 골격과 종류 모듈이 함께 쓴다. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}
