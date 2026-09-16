import { GuideFigure } from '../GuideFigure'
import vmPublishImage from '../../assets/docs/vm-publish.png'
import dnsRecordsImage from '../../assets/docs/dns-records.png'
import campusIpImage from '../../assets/docs/campus-ip.png'
import { CodeBlock } from '../../components/CodeBlock'
import { GuideAction, GuideLink } from '../links'
import type { GuideArticle } from '../types'

export const networkArticles: GuideArticle[] = [
  {
    slug: 'network/publish',
    title: 'VM의 웹 서비스 공개하기',
    group: '도메인과 네트워크',
    summary: 'VM에서 실행한 HTTP 서비스에 플랫폼 서브도메인이나 내 도메인을 연결합니다.',
    keywords: ['웹', 'HTTP', 'HTTPS', '도메인', '서브도메인', '웹사이트', '공개', '인증서', 'DNS'],
    sections: [
      {
        id: 'choose',
        title: '어떤 연결이 필요한가요',
        body: (
          <>
            <ul>
              <li>
                <strong>Pickle VM에서 웹 서비스를 실행한다면:</strong> 이 문서대로 VM 상세에서
                도메인을 연결합니다. 플랫폼 주소를 받거나 본인이 가진 도메인을 붙일 수 있습니다.
              </li>
              <li>
                <strong>플랫폼 밖 서버에 이름을 붙인다면:</strong>{' '}
                <GuideLink slug="network/domains">외부 서버용 도메인 발급</GuideLink>을 사용합니다.
                VM 상세의 도메인 연결과 진입 메뉴가 다릅니다.
              </li>
              <li>
                <strong>웹이 아닌 TCP/UDP 서비스라면:</strong>{' '}
                <GuideLink slug="network/ports">포트포워딩</GuideLink>을 사용합니다.
                혼자 접속하는 서비스라면 같은 문서의 SSH 로컬 포워딩을 먼저 확인하세요.
              </li>
            </ul>
            <GuideFigure
              src={vmPublishImage}
              alt="가상머신 도메인·포트 탭의 도메인 연결과 포트포워딩 카드"
              caption="도메인·포트 탭에서 웹 서비스에는 도메인을 연결하고, 일반 TCP/UDP 서비스에는 포트포워딩을 설정합니다."
              width={992}
              height={757}
            />
          </>
        ),
      },
      {
        id: 'prepare',
        title: 'VM에서 HTTP 서비스 준비하기',
        body: (
          <>
            <p>
              먼저 VM에 <GuideLink slug="vm/connect">접속</GuideLink>해 웹 서버나
              애플리케이션을 실행하고, HTTP 요청을 받는 포트 번호를 확인합니다.
              예를 들어 앱이 8080번에서 실행된다면 연결할 공개 포트도 8080입니다.
            </p>
            <p>
              서비스는 VM의 네트워크 주소에서 접근할 수 있도록 실행해야 합니다.
              <code>127.0.0.1</code> 또는 <code>localhost</code>에서만 받으면 외부의
              연결이 앱까지 닿지 않습니다. 앱의 수신 주소와 VM 안의 방화벽 설정을 확인하세요.
              다음 명령은 VM 안에서 실행하며, 포트 번호는 앱에 맞게 바꿉니다.
            </p>
            <CodeBlock label="VM 내부에서 HTTP 응답 확인" code="curl -I http://localhost:8080" />
            <p>
              여기서 응답이 오면 앱이 동작한다는 뜻입니다. 도메인 연결까지 성공했는지는
              마지막에 외부 브라우저로 따로 확인해야 합니다.
            </p>
          </>
        ),
      },
      {
        id: 'platform-domain',
        title: '플랫폼 서브도메인 연결하기',
        body: (
          <>
            <ol>
              <li><GuideAction action="vms">가상머신 목록</GuideAction>에서 VM을 열고 <strong>도메인·포트</strong> 탭을 선택합니다.</li>
              <li><strong>플랫폼 서브도메인 추가</strong>를 누릅니다.</li>
              <li>사용할 서브도메인과 화면에 제시된 루트 도메인, VM 내부의 <strong>공개 포트</strong>를 입력합니다.</li>
              <li>연결을 접수한 뒤 해당 도메인의 진행 상태를 확인합니다.</li>
              <li>연결이 완료되면 표시된 <strong>https://</strong> 주소를 외부 브라우저에서 열어 실제 앱 화면을 확인합니다.</li>
            </ol>
            <p>
              별도 관리자 승인이나 본인 DNS 설정은 필요하지 않습니다. 실행 중 또는
              중지됨 상태의 VM에 연결할 수 있지만 실제 사이트를 열려면 VM과 앱이 실행
              중이어야 합니다. 도메인 연결과 해제는 해당 VM의 편집자 이상이 할 수 있습니다.
            </p>
            <p>
              이미 사용 중이거나 예약된 이름은 다른 이름으로 바꿔야 합니다. 플랫폼
              서브도메인은 VM별 개수 제한이 있으므로 제한 안내가 나오면 기존 연결을 확인하세요.
              이름에 개인정보를 넣지 마세요.
            </p>
          </>
        ),
      },
      {
        id: 'custom-domain',
        title: '내가 가진 도메인 연결하기',
        body: (
          <>
            <ol>
              <li>도메인의 DNS 레코드를 수정할 수 있는지 확인합니다.</li>
              <li>VM의 <strong>도메인·포트 → 내 도메인 연결</strong>에서 전체 도메인 이름과 앱의 HTTP 포트를 적습니다.</li>
              <li>
                접수 후 표시되는 DNS 레코드 표를 확인합니다. 도메인을 관리하는 서비스에서
                안내된 <strong>A 레코드</strong>와 소유 확인용 <strong>TXT 레코드</strong>를
                이름과 값을 그대로 등록합니다. 주소를 다른 문서에서 가져오지 말고 이 화면의 값을 사용하세요.
              </li>
              <li>DNS 확인과 인증서 발급, 연결 적용 상태가 완료될 때까지 확인합니다.</li>
              <li>표시된 HTTPS 주소를 열어 인증서 경고 없이 앱에 도달하는지 확인합니다.</li>
            </ol>
            <p>
              DNS 변경은 즉시 모든 곳에 반영되지 않을 수 있습니다. 실패 안내가 나오면
              먼저 A와 TXT 레코드의 이름과 값을 확인하고 화면의 다시 확인 동작을 사용하세요.
              소유 확인에 성공해도 인증서 발급이나 연결 적용이 끝나기 전에는 사이트가
              정상적으로 열리지 않을 수 있습니다.
            </p>
          </>
        ),
      },
      {
        id: 'change-and-troubleshoot',
        title: '포트 변경과 해제, 연결 문제 해결',
        body: (
          <>
            <p>
              도메인 목록에서 주소를 열면 연결 상태와 포트를 확인하고 수정할 수 있습니다.
              한 VM에 여러 도메인을 연결해 각각 다른 HTTP 포트를 가리킬 수 있습니다.
              이름을 바꾸려면 새 도메인을 연결하고 동작을 확인한 뒤 기존 도메인을 해제하세요.
            </p>
            <p>
              해제한 플랫폼 이름은 화면에 표시된 예약 기간 동안 같은 VM에 다시 연결할
              수 있습니다. <strong>예약 중</strong> 목록을 확인하세요. 본인 소유 도메인은
              해제하면 이름 점유와 인증서가 정리되므로 다시 쓸 때 연결 절차를 진행합니다.
            </p>
            <ul>
              <li><strong>사이트가 응답하지 않음:</strong> VM 전원, 앱 실행 상태, HTTP 포트, 수신 주소와 VM 방화벽을 확인합니다.</li>
              <li><strong>DNS 확인 대기:</strong> 지정한 DNS 제공자에 정확한 이름과 값을 넣었는지 확인합니다.</li>
              <li><strong>인증서 경고 또는 적용 실패:</strong> 도메인 상세의 실패 안내를 확인합니다. 경고를 무시하고 사용하지 마세요.</li>
            </ul>
            <p>
              해결되지 않으면 도메인 이름, VM 이름, 실패한 단계와 발생 시각을
              <GuideLink slug="troubleshooting">문의에 포함</GuideLink>하세요.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: 'network/domains',
    title: '외부 서버용 도메인 발급과 관리',
    group: '도메인과 네트워크',
    summary: 'VM 없이 이름을 발급받아 외부 서버로 연결하고, 레코드와 사용 기한을 관리합니다.',
    keywords: ['외부 도메인', 'DNS', 'A', 'AAAA', 'CNAME', 'TXT', 'TTL', '레코드', '연장', '예약'],
    sections: [
      {
        id: 'before-issue',
        title: '이름과 서버를 준비하기',
        body: (
          <>
            <p>
              외부 도메인은 VM 없이 사용할 이름을 발급받는 기능입니다. 이름을 발급받고
              직접 레코드를 넣어 외부 서버나 호스팅 서비스에 연결합니다. 이름은 선택한
              워크스페이스에 속합니다.
            </p>
            <p>
              대상 서버의 공인 IP 또는 호스팅 서비스가 안내하는 연결 주소를 준비하세요.
              Pickle VM의 웹 서비스를 공개하려는 경우에는
              <GuideLink slug="network/publish">VM의 도메인 연결</GuideLink>을 사용합니다.
            </p>
            <p>
              이 기능은 사이트의 파일을 저장하거나 웹 서버를 실행해 주지 않습니다.
              대상 서버의 설정과 HTTPS 인증서는 직접 준비해야 합니다.
            </p>
          </>
        ),
      },
      {
        id: 'issue',
        title: '도메인 신청하기',
        body: (
          <>
            <ol>
              <li><GuideAction action="dnsDomains">도메인 목록</GuideAction>에서 <strong>도메인 신청</strong>을 누릅니다.</li>
              <li>영문 소문자, 숫자, 하이픈으로 이름을 적습니다. 이 이름이 신청의 이름이 됩니다.</li>
              <li>소유할 워크스페이스와 사용 목적을 적고 제출합니다.</li>
              <li>바로 발급되면 상세 화면을 열고, 검토를 기다리는 경우에는 승인된 뒤에 열립니다.</li>
              <li><strong>레코드</strong> 탭에서 연결할 대상을 등록합니다. 발급만으로 주소가 열리지는 않습니다.</li>
            </ol>
            <p>
              고른 루트 도메인에 따라 접수와 동시에 발급되기도 하고, 관리자의 검토를 거치기도
              합니다. 기관과 사용 기간은 묻지 않습니다 — 기관은 루트 도메인이 정하고, 사용 기한은
              발급된 도메인이 따로 가집니다.
            </p>
            <p>
              사용 중이거나 예약된 이름, 다른 신청이 검토를 기다리는 이름은 신청할 수 없습니다.
              워크스페이스별 개수 제한에는 해제 후 예약 중인 이름과 검토를 기다리는 신청도
              포함됩니다. 함께 관리할 구성원에게는 상세 화면의
              <strong> 접근</strong>에서 <GuideLink slug="workspaces/access">리소스 권한</GuideLink>을 부여하세요.
            </p>
          </>
        ),
      },
      {
        id: 'records',
        title: '레코드 입력과 저장',
        body: (
          <>
            <p>
              <strong>레코드 → 줄 추가</strong>를 누르고 이름, 종류, 값, TTL을 채웁니다.
              이름은 발급받은 도메인 아래의 상대 이름입니다. <code>www</code>를 입력하면
              <code>www.&lt;발급받은 도메인&gt;</code>에 적용되고, 이름을 비우면 도메인 자체에
              적용됩니다. 값이 여러 개면 줄바꿈으로 나누세요. TTL은 DNS 응답을 보관하는
              시간이며 초 단위입니다.
            </p>
            <ul>
              <li><strong>A:</strong> 대상 서버의 공인 IPv4 주소를 입력합니다.</li>
              <li><strong>AAAA:</strong> 대상 서버의 공인 IPv6 주소를 입력합니다.</li>
              <li><strong>CNAME:</strong> 호스팅 서비스가 안내하는 대상 호스트 이름 하나를 입력합니다. 같은 이름의 A, AAAA, TXT 레코드와 함께 둘 수 없습니다.</li>
              <li><strong>TXT:</strong> 소유 확인 등 대상 서비스가 요구하는 문자열을 입력합니다.</li>
            </ul>
            <p>
              <strong>저장하면 현재 표 전체가 반영됩니다.</strong> 표에서 지운 줄은 DNS에서도
              삭제됩니다. 다른 용도로 사용하는 줄을 지우지 않았는지 확인한 뒤 저장하세요.
              저장 전 변경은 <strong>되돌리기</strong>로 취소할 수 있습니다.
            </p>
            <p>
              레코드의 적용 상태를 확인한 뒤 대상 주소로 접속합니다. DNS 반영과 브라우저
              접속 성공은 별개입니다. 주소가 맞더라도 대상 서버에 사이트와 HTTPS가
              준비돼 있어야 합니다.
            </p>
            <GuideFigure
              src={dnsRecordsImage}
              alt="외부 도메인 상세의 레코드 탭에 있는 DNS 편집 표와 저장 버튼"
              caption="도메인의 레코드 탭에서 이름과 종류, 값, TTL을 입력합니다. 저장 전 표 전체가 의도한 내용인지 확인합니다."
              width={1104}
              height={228}
            />
          </>
        ),
      },
      {
        id: 'https-and-errors',
        title: 'HTTPS와 허용되는 연결 대상',
        body: (
          <>
            <p>
              <code>.dev</code> 주소는 브라우저에서 HTTPS로만 열립니다. 외부 호스팅
              서비스에 발급받은 도메인을 등록하고 그 서비스의 HTTPS 설정을 완료하세요.
              서버를 직접 운영한다면 해당 이름을 위한 인증서와 HTTPS 서버를 직접 구성합니다.
            </p>
            <p>
              사설 주소, 캠퍼스 주소, 플랫폼으로 되돌아가는 주소 등 허용되지 않는 대상은
              저장이 거절됩니다. 거절된 값의 안내를 읽고 외부 서버의 공인 연결 정보를
              확인하세요. 제공되는 레코드 종류는 A, AAAA, CNAME, TXT입니다.
            </p>
            <p>
              인증서를 발급하면 도메인 이름이 공개 기록에 남을 수 있으므로 이름에
              개인정보를 넣지 마세요. 적용 실패가 계속되거나 HTTPS 설정 이후에도 연결되지
              않으면 도메인 이름, 레코드 종류와 오류 문구를
              <GuideLink slug="troubleshooting">문의에 포함</GuideLink>합니다.
            </p>
          </>
        ),
      },
      {
        id: 'renew-release',
        title: '사용 연장과 해제',
        body: (
          <>
            <p>
              상세의 <strong>개요 → 사용 기한</strong>에서 날짜를 확인하고,
              계속 사용할 때는 기한 전에 <strong>사용 연장</strong>을 누릅니다.
              편집자 이상이 연장할 수 있습니다. 연장 후 표시된 기한이 바뀌었는지 확인하세요.
            </p>
            <p>
              <strong>기한을 넘기면 레코드가 삭제되고 이름이 예약 상태로 바뀝니다.</strong>
              알림을 보내지만 학교 계정을 더 쓰지 않게 되면 안내를 받지 못할 수 있습니다.
              이메일만 기다리지 말고 계속 운영할 사이트의 기한을 직접 확인하세요.
            </p>
            <p>
              더 쓰지 않는 이름은 <strong>개요 → 도메인 해제</strong>에서 해제합니다.
              이 동작은 접근 권한을 관리할 수 있는 소유자가 수행하며, 이름 확인을 거치면
              모든 레코드가 지워집니다.
            </p>
            <p>
              예약 기간에는 같은 워크스페이스에서 이름을 되찾을 수 있습니다. 도메인 목록의
              해제된 행이나 상세의 <strong>개요 → 도메인 되살리기</strong>에서 되살립니다.
              되살리기는 신청이 아니라 바로 적용되며, 사용 기한은 되살린 날부터 새로 시작합니다.
              <strong>이름을 되찾아도 레코드는 돌아오지 않으므로 다시 입력해야 합니다.</strong>
              예약이 끝나면 다른 사용자가 그 이름을 받을 수 있습니다. 목록과 상세에 표시된
              예약 기한을 확인하세요.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: 'network/ports',
    title: '포트포워딩과 캠퍼스 IP',
    group: '도메인과 네트워크',
    summary: '본인 접속, TCP/UDP 공개, 교내 직접 연결 중 필요한 경로를 선택합니다.',
    keywords: ['포트', 'TCP', 'UDP', '포트포워딩', 'SSH 터널', '로컬 포워딩', '캠퍼스 IP', 'NAT', '공인 IP'],
    sections: [
      {
        id: 'choose',
        title: '필요한 접속 범위 고르기',
        body: (
          <ul>
            <li><strong>웹 서비스를 공개:</strong> <GuideLink slug="network/publish">VM 도메인 연결</GuideLink>로 HTTPS 주소를 만듭니다.</li>
            <li><strong>내 컴퓨터에서만 DB나 개발 서버 사용:</strong> 아래 SSH 로컬 포워딩으로 연결합니다.</li>
            <li><strong>일반 TCP/UDP 서비스 공개:</strong> VM의 <strong>도메인·포트</strong> 탭에서 포트포워딩을 만듭니다.</li>
            <li><strong>교내망에서 VM으로 직접 연결:</strong> VM의 <strong>네트워크</strong> 탭에서 캠퍼스 IP를 신청합니다.</li>
          </ul>
        ),
      },
      {
        id: 'local-forwarding',
        title: '본인만 접속할 때: SSH 로컬 포워딩',
        body: (
          <>
            <p>
              로컬 포워딩은 내 컴퓨터의 포트를 SSH 연결을 통해 VM의 서비스로 이어 줍니다.
              공개 포트를 발급받지 않아도 됩니다. 먼저
              <GuideLink slug="vm/connect" anchor="ssh-config">SSH 접속 설정</GuideLink>의
              <code> pickle-vm</code> 별칭으로 접속을 확인하세요.
            </p>
            <p>
              다음은 VM의 8080번 개발 서버를 내 컴퓨터의 18080번에서 여는 예입니다.
              내 컴퓨터에서 실행한 뒤 브라우저로 <code>http://127.0.0.1:18080</code>을 엽니다.
            </p>
            <CodeBlock label="내 컴퓨터에서 실행" code="ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18080:localhost:8080 pickle-vm" />
            <p>
              명령이 응답 없이 기다리는 것은 연결을 유지하는 정상 상태입니다.
              터미널을 닫거나 <code>Ctrl+C</code>를 누르면 포워딩도 끝납니다.
              <code>18080</code>은 내 컴퓨터의 빈 포트, <code>8080</code>은 VM 서비스의
              포트로 바꾸세요. DB 클라이언트도 같은 방식으로 로컬 주소와 포트에 연결할 수 있습니다.
            </p>
            <p>
              포트를 이미 사용 중이라는 오류가 나면 로컬 포트를 바꾸세요. 연결은 열렸는데
              서비스가 응답하지 않으면 VM 안의 앱 실행 상태와 대상 포트를 확인합니다.
            </p>
          </>
        ),
      },
      {
        id: 'public-forwarding',
        title: 'TCP/UDP 포트 공개하기',
        body: (
          <>
            <ol>
              <li>VM에서 서비스와 필요한 인증을 설정하고 해당 포트를 열어 둡니다.</li>
              <li><GuideAction action="vms">가상머신 목록</GuideAction>에서 VM을 열고 <strong>도메인·포트 → 포트포워딩</strong>으로 이동합니다.</li>
              <li><strong>프로토콜</strong>에서 TCP 또는 UDP를 고르고, VM 내부의 <strong>대상 포트</strong>를 입력합니다.</li>
              <li>생성 후 자동으로 할당된 공인 주소와 포트를 확인합니다. 사용자가 공인 포트 번호를 지정하지는 않습니다.</li>
              <li>적용 완료를 확인한 뒤 외부 클라이언트에서 <strong>표시된 주소:공인 포트</strong>로 접속합니다.</li>
            </ol>
            <p>
              VM이 실행 중이고 내부 IP가 할당되어 있어야 생성할 수 있습니다. 편집자 이상이
              생성하고 삭제하며 별도 승인 단계는 없습니다. 외부에 열린 서비스이므로
              앱 자체의 인증과 접근 제한을 설정하세요.
            </p>
            <p>
              생성 직후 대기는 규칙을 반영하는 단계입니다. 실패 또는 정지 상태이면
              표시된 안내를 확인하세요. 적용되어도 연결되지 않는다면 프로토콜, VM의
              앱 수신 주소, 대상 포트와 방화벽을 점검합니다. 공인 포트와 VM 내부 포트가
              같다고 가정하지 마세요.
            </p>
            <p>
              더 쓰지 않는 매핑은 목록에서 삭제합니다. VM이 파기되면 매핑도 정리됩니다.
              계속되는 실패는 VM 이름, 프로토콜, 대상 포트와 표시된 상태를
              <GuideLink slug="troubleshooting">문의에 포함</GuideLink>하세요.
            </p>
          </>
        ),
      },
      {
        id: 'campus-ip',
        title: '캠퍼스 IP 신청하기',
        body: (
          <>
            <ol>
              <li>VM 상세의 <strong>네트워크 → 캠퍼스 IP</strong>를 엽니다.</li>
              <li><strong>신청 목적</strong>에 교내에서 직접 연결해야 하는 이유를 적습니다.</li>
              <li><strong>개방 포트</strong>에 필요한 번호를 쉼표나 공백으로 나누어 적고 제출합니다.</li>
              <li>신청 상태를 확인합니다. 승인 후 연결 작업이 끝나면 <strong>연결된 교내 IP</strong>가 표시됩니다.</li>
              <li>교내망의 클라이언트에서 부여된 주소와 승인된 포트로 접속을 확인합니다.</li>
            </ol>
            <p>
              VM의 편집자 이상이 신청할 수 있으며 시스템 관리자 승인이 필요합니다.
              기본적으로 들어오는 연결은 차단되고 신청한 포트만 열립니다.
              신청 상태일 때는 <strong>신청 취소</strong>로 취소할 수 있습니다.
              반려되면 이력의 의견을 확인한 뒤 필요한 내용을 보완하세요.
            </p>
            <p>
              승인 표시만으로 연결 작업까지 끝난 것은 아닙니다. 부여 주소가 표시되는지
              확인하세요. 교내 직접 접속은 SSH 접속 경로와 다르므로 서비스의 인증도
              별도로 관리해야 합니다.
            </p>
            <GuideFigure
              src={campusIpImage}
              alt="가상머신 네트워크 탭의 캠퍼스 IP 신청 목적과 개방 포트 입력"
              caption="네트워크 탭의 캠퍼스 IP에서 신청 목적과 필요한 포트를 입력합니다."
              width={1104}
              height={421}
            />
          </>
        ),
      },
      {
        id: 'public-nat',
        title: '교내 IP에 공인 IP 연결이 필요할 때',
        body: (
          <>
            <p>
              캠퍼스 IP는 교내 주소입니다. 이 주소에 공인 IP를 연결하는 NAT 신청은
              사용자가 정보전산원에 별도로 진행합니다. Pickle의 캠퍼스 IP 승인으로
              공인 IP까지 자동 연결되지는 않습니다.
            </p>
            <p>
              <a href="https://uitc.pusan.ac.kr/uitc/12166/subview.do" target="_blank" rel="noreferrer">
                부산대학교 정보화본부 공인 IP 안내
              </a>
              에서 신청 대상과 절차를 확인하세요. 대상 VM과 부여된 교내 IP를 확인한
              뒤 진행하며, 절차가 불분명하면 해당 안내의 담당 창구에 문의합니다.
            </p>
            <p>
              일반적인 웹 공개나 TCP/UDP 공개만 필요하다면 먼저 이 문서의 도메인 연결과
              포트포워딩 경로로 해결되는지 확인하세요.
            </p>
          </>
        ),
      },
    ],
  },
]
