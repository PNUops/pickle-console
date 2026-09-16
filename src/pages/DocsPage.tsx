import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { guideArticles, guideGroups } from '../docs/catalog'
import { GuideLink } from '../docs/links'
import { parseGuidePath } from '../lib/docs-paths'
import '../docs/guide.css'

export function DocsPage() {
  const location = useLocation()
  const route = parseGuidePath(location.pathname)
  const slug = route?.slug ?? ''
  const article = guideArticles.find((entry) => entry.slug === slug)
  const contentRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const index = guideArticles.findIndex((entry) => entry.slug === slug)
  const previous = guideArticles[index - 1]
  const next = guideArticles[index + 1]
  const title = article?.title ?? (slug ? '문서를 찾을 수 없습니다' : '사용 가이드')

  useEffect(() => {
    document.title = slug ? `${title} | 사용 가이드 | Pickle` : '사용 가이드 | Pickle'
  }, [slug, title])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let anchor = ''
      try { anchor = decodeURIComponent(location.hash.slice(1)) } catch { /* Invalid fragments open the article heading. */ }
      const section = anchor ? document.getElementById(anchor) : null
      const target = section && contentRef.current?.contains(section) ? section : headingRef.current
      const scrollTarget = target === headingRef.current ? contentRef.current : target
      scrollTarget?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [slug, location.hash])


  return (
    <div className="min-w-0">
      <a href="#guide-content" onClick={(event) => {
        event.preventDefault()
        contentRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
        contentRef.current?.focus({ preventScroll: true })
      }} className="sr-only focus:not-sr-only focus:mb-4 focus:block">문서 본문으로 건너뛰기</a>
        <div ref={contentRef} id="guide-content" tabIndex={-1} className="min-w-0 flex-1 scroll-mt-20 outline-none">
          <div className="mx-auto max-w-3xl">
            <header className="mb-8 border-b border-neutral-200 pb-6">
              {article && <p className="mb-2 text-sm text-neutral-500">{article.group}</p>}
              <h1 ref={headingRef} tabIndex={-1} className="scroll-mt-20 text-2xl font-semibold text-neutral-900 outline-none">{title}</h1>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                {article?.summary ?? (slug ? '주소를 확인하거나 문서 목차에서 필요한 안내를 선택해 주세요.' : '처음 신청할 리소스를 고르고, 승인 후 연결부터 공유와 이용 종료까지 확인하세요.')}
              </p>
            </header>
            {article ? (
              <>
                <nav aria-label="이 문서의 목차" className="mb-8 rounded-panel border border-neutral-200 bg-white p-4">
                  <h2 className="mb-2 text-sm font-semibold text-neutral-800">이 문서의 목차</h2>
                  <ol className="list-decimal space-y-2 pl-5 text-sm marker:text-neutral-500">
                    {article.sections.map((section) => <li key={section.id}><GuideLink slug={slug} anchor={section.id}>{section.title}</GuideLink></li>)}
                  </ol>
                </nav>
                <article aria-label={article.title} className="space-y-10">
                  {article.sections.map((section) => (
                    <section key={section.id} aria-labelledby={section.id}>
                      <h2 id={section.id} tabIndex={-1} className="mb-4 scroll-mt-20 text-lg font-semibold text-neutral-900 outline-none">{section.title}</h2>
                      <div className="guide-prose">{section.body}</div>
                    </section>
                  ))}
                </article>
                <nav aria-label="이전 다음 문서" className="mt-10 grid grid-cols-1 gap-4 border-t border-neutral-200 pt-6 sm:grid-cols-2">
                  <div>{previous && <><p className="mb-1 text-xs text-neutral-500">이전 문서</p><GuideLink slug={previous.slug}>{previous.title}</GuideLink></>}</div>
                  <div className="sm:text-right">{next && <><p className="mb-1 text-xs text-neutral-500">다음 문서</p><GuideLink slug={next.slug}>{next.title}</GuideLink></>}</div>
                </nav>
              </>
            ) : slug ? <GuideLink slug="">사용 가이드 홈으로 이동</GuideLink> : (
              <div className="space-y-8">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <GuideLink slug="introduction">서비스 소개 →</GuideLink>
                  <GuideLink slug="start">처음 이용하기부터 시작 →</GuideLink>
                </div>
                {guideGroups.map((group) => (
                  <section key={group}>
                    <h2 className="mb-3 text-lg font-semibold text-neutral-900">{group}</h2>
                    <ul className="divide-y divide-neutral-200">
                      {guideArticles.filter((entry) => entry.group === group).map((entry) => (
                        <li key={entry.slug} className="py-3">
                          <GuideLink slug={entry.slug}>{entry.title}</GuideLink>
                          <p className="mt-1 text-sm leading-6 text-neutral-600">{entry.summary}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
    </div>
  )
}
