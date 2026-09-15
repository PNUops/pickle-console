import { gettingStartedArticles } from './articles/getting-started'
import { accountArticles } from './articles/account'
import { vmArticles } from './articles/vm'
import { networkArticles } from './articles/network'
import { llmArticles } from './articles/llm'

export const guideArticles = [
  ...gettingStartedArticles,
  ...vmArticles,
  ...networkArticles,
  ...llmArticles,
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
