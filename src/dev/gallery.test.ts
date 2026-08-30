import { describe, expect, test } from 'vitest'
import { isComponentGalleryEnabled } from './gallery'

describe('component gallery gate', () => {
  test('개발 환경에서만 route를 연다', () => {
    expect(isComponentGalleryEnabled({ DEV: true })).toBe(true)
    expect(isComponentGalleryEnabled({ DEV: false })).toBe(false)
  })
})
