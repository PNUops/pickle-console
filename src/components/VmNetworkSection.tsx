import type { VmDetail } from '../api/queries'
import { VmCampusIpSection } from './VmCampusIpSection'

/**
 * VM 네트워크 탭 — 이 VM이 어느 망에 어떻게 놓이는지를 다룬다. 지금은 캠퍼스 IP
 * 연결 하나뿐이고, 방화벽·주소 관련 설정이 생기면 이 탭에 함께 선다.
 * 바깥으로 여는 수단(HTTP 공개·포트 포워딩)은 '도메인·포트' 탭이 담당한다.
 */
export function VmNetworkSection({ vm }: { vm: VmDetail }) {
  return <VmCampusIpSection vm={vm} canMutate={vm.settingsEditAllowed} />
}
