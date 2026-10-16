import { expect, test } from 'vitest'
import { guideArticles } from './catalog'

test('development LLM guides contain no callable endpoint before commissioning', () => {
  if (PICKLE_DEPLOY_TARGET !== 'development' || PICKLE_LLM_API_BASE_URL) return
  const articles = guideArticles.filter((article) => article.slug.startsWith('llm/'))
  expect(articles.length).toBeGreaterThan(0)
  for (const article of articles) {
    expect(article.sections).toHaveLength(1)
    expect(article.sections[0].body).toBe('개발 환경에서 LLM API 연결이 비활성화되어 있습니다.')
  }
})
