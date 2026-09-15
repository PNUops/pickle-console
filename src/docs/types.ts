import type { ReactNode } from 'react'

export interface GuideArticle {
  slug: string
  title: string
  group: string
  summary: string
  keywords: string[]
  sections: { id: string; title: string; body: ReactNode }[]
}
