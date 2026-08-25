// 교내 유관 사이트(기관 요청으로 랜딩에만 노출). 라벨은 각 사이트의 공식 명칭이고,
// 순서는 상위 기관 → 학부 → 교육원 → 시스템.
const familySites = [
  { href: 'https://www.pusan.ac.kr', label: '부산대학교' },
  { href: 'https://cse.pusan.ac.kr', label: '정보컴퓨터공학부' },
  { href: 'https://bce.pusan.ac.kr', label: '의생명융합공학부' },
  { href: 'https://swedu.pusan.ac.kr', label: 'AI융합교육원' },
  { href: 'https://plato.pusan.ac.kr', label: 'PLATO' },
  { href: 'https://code.pusan.ac.kr', label: '코드플레이스' },
  { href: 'https://swcss.pusan.ac.kr', label: 'AI역량지원시스템' },
  { href: 'https://aipms.pusan.ac.kr', label: 'PNU AIPMS' },
  { href: 'https://opus.pusan.ac.kr', label: 'SW프로젝트관리시스템' },
]

/** 패밀리 사이트 — 최종 CTA 아래, 푸터 위의 독립 밴드. */
export function FamilySites() {
  return (
    <section aria-label="패밀리 사이트" className="border-t border-neutral-200 bg-neutral-50">
      <nav
        aria-label="패밀리 사이트 목록"
        className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-xs sm:px-6"
      >
        <span className="font-semibold text-neutral-600">패밀리 사이트</span>
        {familySites.map((site) => (
          <a
            key={site.href}
            href={site.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 transition-colors hover:text-neutral-800"
          >
            {site.label}
          </a>
        ))}
      </nav>
    </section>
  )
}
