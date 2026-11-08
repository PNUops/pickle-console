import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { expect, test } from 'vitest'
import { guideArticles } from './catalog'
import { GuideFigure, type GuideFigureProps } from './GuideFigure'

const scenes = [
  ['introduction', 'resources', 'user-dashboard', 1104, 184],
  ['requests/status', 'result', 'request-statuses', 1102, 227],
  ['requests/bulk', 'roster', 'request-roster', 726, 540],
  ['requests/bulk', 'status', 'request-recipients', 1104, 307],
  ['workspaces/manage', 'members', 'workspace-members', 2208, 460],
  ['workspaces/access', 'grant', 'resource-access', 448, 556],
  ['vm/request', 'configure', 'vm-request', 768, 735],
  ['vm/connect', 'ssh', 'vm-connection', 1104, 292],
  ['vm/manage', 'monitoring', 'vm-monitoring', 1104, 615],
  ['network/publish', 'choose', 'vm-publish', 1104, 697],
  ['network/domains', 'records', 'dns-records', 1104, 318],
  ['network/ports', 'campus-ip', 'campus-ip', 1104, 421],
  ['llm/start', 'choose-models', 'llm-request', 742, 612],
  ['llm/connect', 'prepare', 'llm-connection', 1104, 364],
  ['llm/features', 'models', 'llm-permissions', 1104, 348],
  ['llm/limits', 'usage', 'llm-usage', 1104, 438],
] as const

function figuresIn(node: ReactNode): ReactElement<GuideFigureProps>[] {
  const figures: ReactElement<GuideFigureProps>[] = []
  Children.forEach(node, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return
    if (child.type === GuideFigure) figures.push(child as ReactElement<GuideFigureProps>)
    else figures.push(...figuresIn(child.props.children))
  })
  return figures
}

test.each(scenes)('places the %s reference in its %s section', (slug, sectionId, imageName, width, height) => {
  const section = guideArticles.find((article) => article.slug === slug)?.sections.find((entry) => entry.id === sectionId)
  expect(section).toBeDefined()
  const figures = figuresIn(section!.body)
  expect(figures).toHaveLength(1)
  const extension = ['request-statuses', 'workspace-members', 'vm-monitoring'].includes(imageName) ? 'png' : 'jpg'
  expect(figures[0].props.src.split('?')[0]).toMatch(new RegExp(`/${imageName}\\.${extension}$`))
  expect(figures[0].props.alt.trim()).not.toBe('')
  expect(figures[0].props.caption.trim()).not.toBe('')
  expect(figures[0].props.width).toBe(width)
  expect(figures[0].props.height).toBe(height)
})

test('uses each planned screenshot once across the guide', () => {
  const figures = guideArticles.flatMap((article) => article.sections.flatMap((section) => figuresIn(section.body)))
  expect(figures).toHaveLength(scenes.length)
  expect(new Set(figures.map((figure) => figure.props.src)).size).toBe(scenes.length)
})
