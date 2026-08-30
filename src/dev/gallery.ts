export const COMPONENT_GALLERY_ROUTE = '__dev/components'

/** Vite production build에서는 gallery route와 dynamic chunk를 함께 제거한다. */
export function isComponentGalleryEnabled(env: Pick<ImportMetaEnv, 'DEV'>): boolean {
  return env.DEV
}
