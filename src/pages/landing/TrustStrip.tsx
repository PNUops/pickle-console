import { trustItems } from './landing-data'

/** 히어로 하단의 신뢰 지표 밴드(다크 블록의 마무리). */
export function TrustStrip() {
  return (
    <div className="border-t border-white/10 bg-neutral-950">
      <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-x-6 gap-y-4 px-4 py-8 sm:px-6 lg:grid-cols-4">
        {trustItems.map((item) => (
          <li key={item} className="flex items-center gap-2.5 text-sm text-neutral-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0 text-primary-400"
              aria-hidden="true"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
