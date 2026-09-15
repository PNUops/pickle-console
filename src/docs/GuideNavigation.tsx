import { useId, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { guideGroups, searchGuideArticles } from './catalog'
import { cn } from '../lib/cn'
import { guidePathFor, guideNavigationState } from '../lib/docs-paths'
import { SIDEBAR_LINK_CLASS, SIDEBAR_GROUP_CLASS, SIDEBAR_ACTIVE_CLASS, SIDEBAR_IDLE_CLASS } from '../lib/sidebar-style'

export function GuideNavigation({ slug, onNavigate, className }: { slug: string; onNavigate?: () => void; className?: string }) {
  const [query, setQuery] = useState('')
  const searchId = useId()
  const location = useLocation()
  const results = searchGuideArticles(query)
  const state = guideNavigationState(location)
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 border-b border-neutral-100 p-3">
        <input id={searchId} type="search" aria-label="문서 검색" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="제목 또는 키워드 검색" className="w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-800 focus-visible:outline-2 focus-visible:outline-primary-600" />
      </div>
      <nav aria-label="문서 목차" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <h2 className="px-3 pt-2 text-sm font-semibold text-neutral-900">
        <Link to={guidePathFor(location)} state={state} onClick={onNavigate}
          className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">사용 가이드</Link>
      </h2>
      {query.trim() && <p role="status" className="px-3 text-xs text-neutral-500">{results.length ? `${results.length}개 문서` : '검색 결과가 없습니다. 다른 검색어를 입력해 주세요.'}</p>}
      {guideGroups.map((group) => {
        const articles = results.filter((article) => article.group === group)
        if (!articles.length) return null
        return (
          <div key={group}>
            <h2 className={SIDEBAR_GROUP_CLASS}>{group}</h2>
            <ul className="space-y-1">
              {articles.map((article) => (
                <li key={article.slug}>
                  <Link to={guidePathFor(location, article.slug)} state={state} onClick={onNavigate}
                    aria-current={article.slug === slug ? 'page' : undefined}
                    className={cn(SIDEBAR_LINK_CLASS, article.slug === slug ? SIDEBAR_ACTIVE_CLASS : SIDEBAR_IDLE_CLASS)}>
                    <span className="min-w-0 flex-1 leading-5">{article.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      </nav>
    </div>
  )
}
