import { gettingStartedArticles } from './articles/getting-started'
import { bulkRequestArticles } from './articles/bulk'
import { accountArticles } from './articles/account'
import { vmArticles } from './articles/vm'
import { networkArticles } from './articles/network'
import { llmArticles } from './articles/llm'
import { introductionArticles } from './articles/introduction'
import { LLM_API_BASE_URL } from '../lib/llm-api'

const displayedLlmArticles = LLM_API_BASE_URL ? llmArticles : llmArticles.map((article) => ({
  ...article,
  summary: '개발 환경에서 LLM API 연결이 비활성화되어 있습니다.',
  sections: [{
    id: 'unavailable',
    title: '개발 환경',
    body: '개발 환경에서 LLM API 연결이 비활성화되어 있습니다.',
  }],
}))

export const guideArticles = [
  ...introductionArticles,
  ...gettingStartedArticles.flatMap((article) => article.slug === 'requests/status' ? [article, ...bulkRequestArticles] : [article]),
  ...vmArticles,
  ...networkArticles,
  ...displayedLlmArticles,
  ...accountArticles,
]

export const guideGroups = [...new Set(guideArticles.map((article) => article.group))]

export function searchGuideArticles(query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return guideArticles.filter((article) => {
    const haystack = [article.title, article.group, article.summary, ...article.keywords].join(' ').toLocaleLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
