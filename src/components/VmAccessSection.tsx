import { ResourceAccessSection } from './resource/ResourceAccessSection'

/**
 * 이 VM에 누가 접근할 수 있는지를 정하는 탭.
 *
 * 목록의 규칙은 종류를 가리지 않으므로 화면도 공용이다
 * ({@link ResourceAccessSection}) — 여기 남는 것은 VM이라는 종류를 넘기는 한
 * 줄뿐이고, VM만의 문장은 그 공용 화면의 종류표에 있다.
 */
export function VmAccessSection({ vmId }: { vmId: string }) {
  return <ResourceAccessSection type="VM" resourceId={vmId} />
}
