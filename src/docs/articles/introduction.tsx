import { GuideFigure } from '../GuideFigure'
import userDashboardImage from '../../assets/docs/user-dashboard.jpg'
import { GuideAction, GuideLink } from '../links'
import type { GuideArticle } from '../types'

export const introductionArticles: GuideArticle[] = [
  {
    slug: 'introduction',
    title: '서비스 소개',
    group: '시작하기',
    summary: 'Pickle이 제공하는 리소스와 이용 방법을 소개해요.',
    keywords: ['소개', 'Pickle', '부산대학교', '클라우드', '목적', '배경', '기능'],
    sections: [
      {
        id: 'about',
        title: 'Pickle은 어떤 서비스인가요',
        body: (
          <>
            <p>
              Pickle은 부산대학교 구성원이 수업과 프로젝트, 연구에 컴퓨팅 리소스를
              사용할 수 있는 클라우드 플랫폼이에요.
            </p>
            <p>
              가상머신과 LLM API 키, 도메인을 신청하고 콘솔에서 사용량과 공유 권한,
              사용 종료를 관리해요.
            </p>
            <p>
              처음 이용한다면 <GuideLink slug="start">처음 시작하기</GuideLink>에서
              계정과 워크스페이스를 준비한 뒤 필요한 리소스를 선택하세요.
            </p>
          </>
        ),
      },
      {
        id: 'background',
        title: '왜 만들었나요',
        body: (
          <>
            <p>
              수업이나 팀에서 필요한 서버를 신청하고, 접속과 공유, 사용 종료까지
              한곳에서 관리할 수 있도록 만들었어요.
            </p>
          </>
        ),
      },
      {
        id: 'resources',
        title: '지금 사용할 수 있는 리소스',
        body: (
          <>
            <h3>가상머신</h3>
            <p>
              운영체제와 CPU, 메모리, 디스크 사양을 정해 서버를 신청해요. 승인 후 생성이
              끝나면 VM 전용 SSH 개인키나 브라우저 웹 터미널로 접속할 수 있어요.
              콘솔에서 전원을 제어하고 CPU, 메모리, 네트워크와 디스크 I/O를 확인해요.
              운영체제와 사양은 신청 화면에서 골라요.{' '}
              <GuideLink slug="vm/request">가상머신 신청하기</GuideLink>
            </p>
            <h3>LLM API 키</h3>
            <p>
              학교가 직접 서빙하는 모델과 외부 유료 모델을 프로그램에서 호출해요.
              Chat Completions API를 사용하고, 유료 모델은 Anthropic Messages API로도 연결해요.
              자체 서빙 모델에는 승인된 일일 토큰 한도가, 유료 모델에는 별도의 금액 한도와
              모델 권한이 적용되고, Chat과 이미지 생성처럼 쓸 수 있는 기능은 키마다 부여돼요.
              필요한 모델과 한도, 기능을 신청하고 승인된 키를 발급받아 사용해요.
              사용량은 콘솔에서 확인해요.
              <GuideLink slug="llm/start">LLM API 시작하기</GuideLink>
            </p>
            <h3>도메인</h3>
            <p>
              VM 없이도 이름을 발급받아 외부 서버나 호스팅 서비스에 연결할 수 있어요.
              다른 리소스와 같이 신청하며, 고른 루트 도메인에 따라 바로 발급되거나 검토를
              거쳐요. 발급 뒤에는 A, AAAA, CNAME, TXT 레코드를 직접 편집해요.
              계속 사용할 이름은 기한 전에 연장해요.
              외부 서버의 웹 서비스와 HTTPS 인증서는 사용자가 준비해요.
              <GuideLink slug="network/domains">외부 서버용 도메인 신청과 관리</GuideLink>
            </p>
            <GuideFigure
              src={userDashboardImage}
              alt="사용자 대시보드의 리소스, 신청, 알림 요약과 리소스 신청 버튼"
              caption="대시보드의 리소스와 신청 상태"
              width={1104}
              height={184}
            />
          </>
        ),
      },
      {
        id: 'workflow',
        title: '신청부터 사용까지',
        body: (
          <>
            <ol>
              <li>
                <strong>계정과 워크스페이스를 준비해요.</strong> 가입하면 개인 워크스페이스가
                만들어져요. 함께 사용할 때는 새 워크스페이스를 만들거나
                기존 공간에 참여해요.
              </li>
              <li>
                <strong>필요한 리소스를 신청해요.</strong> 종류를 고르고 사용 목적과
                필요한 사양이나 한도를 적어요.
              </li>
              <li>
                <strong>검토 결과를 확인해요.</strong> 담당 기관의 관리자가 승인하거나
                반려해요. 요청한 내용과 실제 승인된 사양, 한도, 기간이 다를 수 있으므로
                검토 의견과 결과를 확인하세요.
              </li>
              <li>
                <strong>승인된 리소스를 사용해요.</strong> 가상머신은 생성 완료 후 접속하고,
                LLM API 키는 소유자가 키 값을 발급받은 뒤 코드에서 호출해요.
              </li>
            </ol>
            <p>
              외부 서버용 도메인도 같은 신청으로 받아요.{' '}
              <GuideAction action="dnsDomains">도메인 목록</GuideAction>의 도메인 신청에서
              시작해요. 이름을 받은
              뒤 레코드와 대상 서버를 설정해야 주소가 열려요.
            </p>
            <p>
              <GuideAction action="newRequest">리소스 신청</GuideAction>을 시작하거나,
              <GuideLink slug="requests/submit">신청서 작성 방법</GuideLink>과
              <GuideLink slug="requests/status">신청 상태와 결과</GuideLink>를 확인하세요.
            </p>
          </>
        ),
      },
      {
        id: 'connections',
        title: '만든 서비스에 접속하고 공개하기',
        body: (
          <>
            <p>
              VM의 셸은 SSH 또는 웹 터미널로 열어요. SSH 키는 사용자와 VM별로 발급하므로
              팀이 함께 쓰는 서버도 각자 자신의 키로 접속해요. 같은 연결로 파일을
              주고받을 수 있어요. <GuideLink slug="vm/connect">접속과 파일 전송</GuideLink>
            </p>
            <p>
              VM에서 실행한 웹 서비스에는 플랫폼 서브도메인이나 본인이 소유한 도메인을
              연결할 수 있어요. 플랫폼 서브도메인은 바로 연결하고, 본인 도메인은 DNS로
              소유권을 확인한 뒤 HTTPS 인증서 발급과 연결이 진행돼요.
              <GuideLink slug="network/publish">VM의 웹 서비스 공개하기</GuideLink>
            </p>
            <p>
              일반 TCP/UDP 서비스는 포트포워딩으로 공개해요. 본인만 접속하면 되는
              개발 서버나 데이터베이스는 SSH 로컬 포워딩을 사용할 수 있어요. 교내망에서
              직접 연결해야 한다면 VM 상세에서 캠퍼스 IP를 신청해 관리자 승인을 받아요.
              <GuideLink slug="network/ports">포트포워딩과 캠퍼스 IP</GuideLink>
            </p>
          </>
        ),
      },
      {
        id: 'sharing',
        title: '워크스페이스의 리소스 공유',
        body: (
          <>
            <p>
              워크스페이스는 함께 쓰는 리소스를 모아 두는 공간이에요. 구성원 관리와
              리소스 접근 권한은 따로 정해요. 같은 공간에 속해 있어도 모든 VM이나 키를
              자동으로 사용할 수 있는 것은 아니에요.
            </p>
            <p>
              리소스에는 소유자, 편집자, 참여자, 열람자 등급을 부여해요. 예를 들어 VM을
              조회할 사람, 접속해서 사용할 사람, 설정을 바꿀 사람을 구분할 수 있어요.
              본인용 신청은 신청자에게, 대상자를 지정한 신청은 각 대상자에게 먼저 권한이
              생겨요. 함께 사용할 사람에게 필요한 접근 권한을 추가해요.
            </p>
            <p>
              구성원을 제거하면 플랫폼의 접근 권한도 회수되지만, 이미 전달한 비밀번호나
              LLM API 키 값까지 없어지는 것은 아니에요. 공유를 끝낼 때는 필요한 자격증명
              교체도 함께 확인하세요.
              <GuideLink slug="workspaces/manage">워크스페이스 관리</GuideLink>와
              <GuideLink slug="workspaces/access">리소스 접근 권한</GuideLink>에서
              설정 방법과 회수 시 주의점을 설명해요.
            </p>
          </>
        ),
      },
      {
        id: 'operation',
        title: '데이터와 사용 기간 관리',
        body: (
          <>
            <p>
              데이터 정리와 점검 일정은
              <GuideAction action="notices">공지사항</GuideAction>에서 확인해요.
            </p>
            <p>
              가상머신의 사용 기간이 만료되면 자동으로 종료되며, 계속 사용하려면 관리자에게
              연장을 문의해요. 기간 만료와 삭제는 다른 동작이에요. 직접 삭제를 접수한 뒤에는
              사용자가 취소할 수 없고, 실수했다면 유예 기간 중 관리자에게 바로 문의해야 해요.
              유예 기간이 데이터 복구를 보장하지는 않아요.
            </p>
            <p>
              플랫폼은 사용자 VM 데이터를 백업하지 않아요. 파일과 데이터베이스의
              백업은 사용자가 준비해야 하며 영구 파기된 데이터는 복구할 수 없어요.
              실제 사용 기한과 삭제 예정 시각은 각 리소스 화면에서 확인하세요.
              <GuideLink slug="vm/manage">가상머신 관리와 사용 종료</GuideLink>
            </p>
            <p>
              리소스 화면의 상태와 활동, 알림에서 처리 내역을 확인할 수 있어요. 문제가
              생기면 <GuideLink slug="troubleshooting">문제 해결과 문의</GuideLink>를 참고하세요.
            </p>
          </>
        ),
      },
      {
        id: 'plans',
        title: '리소스 제공 여부',
        body: (
          <>
            <p>
              현재 신청할 수 있는 리소스는 콘솔의 리소스 메뉴와 신청 화면에서 확인해요.
            </p>
          </>
        ),
      },
    ],
  },
]
