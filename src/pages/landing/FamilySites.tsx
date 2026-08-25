import pnuEmblem from '../../assets/pnu-emblem.png'

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

/**
 * 패밀리 사이트 — 최종 CTA 아래, 푸터 위의 배너 띠. 교내 시스템들이 쓰는 배너
 * 형식(엠블럼 + 기관명 카드)을 따르되 한 칸을 그보다 작게 잡는다.
 */
export function FamilySites() {
  return (
    <section aria-label="패밀리 사이트" className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-xs font-semibold text-neutral-500">패밀리 사이트</p>
        <nav aria-label="패밀리 사이트 목록" className="mt-3 flex flex-wrap gap-2">
          {familySites.map((site) => (
            <a
              key={site.href}
              href={site.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              <img src={pnuEmblem} alt="" aria-hidden="true" className="size-5 shrink-0 rounded-full" />
              {site.label}
            </a>
          ))}
        </nav>
      </div>
    </section>
  )
}
