import { Link } from 'react-router'
import { CONTACT_URL, FEEDBACK_URL } from '../../lib/brand'
import { GuideAction, GuideLink } from '../links'
import type { GuideArticle } from '../types'

export const accountArticles: GuideArticle[] = [
  {
    slug: 'account',
    title: '계정과 로그인 관리',
    group: '계정과 문제 해결',
    summary: '프로필, 로그인 수단, 비밀번호 복구와 2단계 인증을 관리합니다.',
    keywords: ['계정', '로그인', '비밀번호', '재설정', '프로필', '학번', 'Google', '2단계 인증', '탈퇴'],
    sections: [
      {
        id: 'profile',
        title: '프로필 확인과 입력',
        body: (
          <>
            <p>
              상단 계정 메뉴의 <GuideAction action="account">계정 설정</GuideAction>에서
              프로필과 로그인 수단을 확인합니다. 이름은 변경할 수 있고 직책과 학번, 소속은
              아직 비어 있는 항목의 입력 버튼으로 등록할 수 있습니다.
            </p>
            <p>
              직책에 따라 입력 항목이 달라집니다. 학생은 학번과 학과를 입력하고, 그 밖의 직책은
              해당 소속을 입력합니다. 직책과 학번, 소속은 한 번 등록하면 직접 바꾸거나 지울 수
              없으므로 저장 전에 확인하세요. 이미 입력한 값의 정정은 문의 창구로 요청합니다.
            </p>
            <p>프로필 입력은 선택 사항입니다. 비어 있는 프로필 때문에 리소스 신청이 막히지는 않습니다.</p>
          </>
        ),
      },
      {
        id: 'sign-in',
        title: '로그인 수단과 비밀번호 설정',
        body: (
          <>
            <ul>
              <li>
                <strong>Google 로그인:</strong> 가입하거나 연동한 부산대학교 Google 계정을 선택합니다.
                개인 Gmail 계정이 선택되어 있으면 계정을 바꿔 다시 진행합니다.
              </li>
              <li>
                <strong>비밀번호 로그인:</strong> 로그인 화면에 가입 이메일을 입력해 다음으로
                진행한 뒤 비밀번호를 입력합니다.
              </li>
            </ul>
            <p>
              Google로 가입한 계정은 처음에 Pickle 비밀번호가 없습니다. 비밀번호 로그인을 함께
              쓰려면 계정 설정의 비밀번호 행에서 <strong>메일 받기</strong>를 누르고, 가입 이메일로
              온 링크에서 비밀번호를 설정합니다.
            </p>
            <p>
              로그인 수단의 연동된 계정에서 Google 연동 상태를 확인할 수 있습니다.
              Google 연동을 해제하려면 먼저 사용할 비밀번호가 설정되어 있어야 합니다.
            </p>
          </>
        ),
      },
      {
        id: 'password-reset',
        title: '비밀번호를 잊었을 때',
        body: (
          <ol>
            <li>
              <Link to="/forgot-password">비밀번호 재설정</Link>에서 가입한 이메일을 입력하고
              재설정 메일 받기를 누릅니다.
            </li>
            <li>메일함과 스팸함을 확인하고 재설정 링크를 엽니다. 링크는 30분 동안 유효합니다.</li>
            <li>새 비밀번호와 확인 값을 입력하고 변경한 뒤 새 비밀번호로 다시 로그인합니다.</li>
            <li>링크가 만료됐거나 이미 사용했다면 재설정 메일을 다시 요청합니다.</li>
          </ol>
        ),
      },
      {
        id: 'two-factor',
        title: '2단계 인증과 복구 코드',
        body: (
          <>
            <ol>
              <li>계정 설정의 로그인 수단에서 2단계 인증을 엽니다. 비밀번호가 없다면 먼저 설정합니다.</li>
              <li>비밀번호로 확인한 뒤 인증 앱으로 QR 코드를 스캔하거나 화면의 키를 직접 등록합니다.</li>
              <li>인증 앱에 표시된 6자리 코드를 입력해 등록을 완료합니다.</li>
              <li>한 번만 표시되는 복구 코드를 복사하거나 다운로드해 별도로 보관합니다.</li>
            </ol>
            <p>
              2단계 인증을 켜면 Google로 로그인할 때도 인증 코드가 필요합니다.
              인증 앱을 사용할 수 없으면 로그인 인증 단계에서 <strong>복구 코드로 입력</strong>을
              선택해 보관한 코드를 사용합니다. 사용한 복구 코드는 다시 사용할 수 없습니다.
            </p>
            <p>
              복구 코드를 재발급하면 기존 코드는 모두 무효가 됩니다. 인증 앱과 복구 코드를 모두
              사용할 수 없으면 <GuideLink slug="troubleshooting" anchor="contact">문의 창구</GuideLink>로
              계정 복구를 요청하세요.
            </p>
          </>
        ),
      },
      {
        id: 'withdraw',
        title: '계정 탈퇴',
        body: (
          <>
            <p>
              계정 설정의 회원 탈퇴에서 진행합니다. 함께 사용하는 워크스페이스의 소유자 역할과
              남아 있는 리소스를 먼저 확인하고, 화면에서 정리를 요구하는 항목을 처리하세요.
              탈퇴에는 이메일 확인 입력과 비밀번호가 필요하며 2단계 인증을 켰다면 인증 코드도 입력합니다.
            </p>
            <p>
              탈퇴하면 로그인과 SSH 접속이 차단되고 계정을 복구하거나 같은 이메일로 다시 가입할
              수 없습니다. 단순히 리소스 사용을 마치는 경우에는 해당 리소스를 정리하거나{' '}
              <GuideLink slug="workspaces/manage" anchor="leave-and-delete">워크스페이스에서 나가기</GuideLink>를
              이용합니다.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: 'troubleshooting',
    title: '문제 해결과 문의',
    group: '계정과 문제 해결',
    summary: '신청, 목록, 접속에서 막혔을 때 확인할 순서와 문의에 필요한 정보를 정리합니다.',
    keywords: ['문제 해결', '문의', '오류', '안 보임', '권한 없음', '점검', '메일', '연결 실패'],
    sections: [
      {
        id: 'sign-in',
        title: '가입과 로그인 문제',
        body: (
          <ul>
            <li>
              <strong>인증 메일이 오지 않음:</strong> 입력한 부산대학교 이메일과 스팸함을 확인합니다.
              계속 도착하지 않으면 가입 이메일과 요청 시각을 적어 문의하세요.
            </li>
            <li>
              <strong>Google 로그인 실패:</strong> 개인 계정이 아니라 가입한 부산대학교 계정을
              선택했는지 확인합니다. 비밀번호를 따로 설정했다면 비밀번호 로그인도 사용할 수 있습니다.
            </li>
            <li>
              <strong>비밀번호를 잊음:</strong> <GuideLink slug="account" anchor="password-reset">비밀번호 재설정</GuideLink>을
              진행합니다. 로그인 시도 제한이 표시되면 반복 입력을 멈추고 화면 안내에 따라 다시 시도하세요.
            </li>
            <li>
              <strong>인증 앱을 사용할 수 없음:</strong> 보관한 복구 코드를 사용합니다.
              복구 코드도 없으면 문의 창구로 연락합니다.
            </li>
          </ul>
        ),
      },
      {
        id: 'request',
        title: '신청을 진행할 수 없는 경우',
        body: (
          <ol>
            <li>기관과 워크스페이스를 모두 선택했는지 확인합니다. 목록에 없으면 해당 기관 또는 워크스페이스 소유자에게 문의합니다.</li>
            <li>빨간색으로 표시된 입력 항목과 상단 오류 안내를 읽습니다. 필요한 사양 사유와 사용 종료일이 빠지지 않았는지 확인합니다.</li>
            <li>검토 단계의 신청 제출을 누른 뒤 접수 화면이 표시되는지 확인합니다.</li>
            <li>
              제출 응답을 받지 못했다면 <GuideAction action="requests">신청 내역</GuideAction>을
              먼저 확인합니다. 이미 접수돼 있다면 같은 내용으로 다시 신청하지 않아도 됩니다.
            </li>
          </ol>
        ),
      },
      {
        id: 'visibility',
        title: '리소스가 보이지 않거나 상세를 열 수 없는 경우',
        body: (
          <ol>
            <li>
              사이드바에서 그 리소스가 있는 워크스페이스를 고릅니다. 「내 리소스」에서는
              접근 권한을 가진 것만 보이고, 워크스페이스를 고르면 권한이 없는 리소스도
              이름과 상태까지는 보입니다.
            </li>
            <li>새로 신청한 리소스라면 신청 내역에서 승인됐는지 확인합니다.</li>
            <li>이름과 상태만 보이면 리소스 소유자에게 필요한 접근 권한을 요청합니다.</li>
            <li>
              공유받은 주소가 열리지 않으면 해당 워크스페이스의 구성원인지 확인합니다.
              권한을 잃었거나 리소스가 삭제된 경우에는 예전에 사용한 주소도 열리지 않을 수 있습니다.
            </li>
          </ol>
        ),
      },
      {
        id: 'connection',
        title: '접속과 호출 문제',
        body: (
          <>
            <ul>
              <li>
                <strong>가상머신 접속:</strong> VM의 전원 상태와 본인의 참여자 이상 권한을 확인한 뒤
                해당 VM 상세의 접속 정보로 다시 시도합니다. <GuideLink slug="vm/connect">SSH와 웹 터미널 안내</GuideLink>
              </li>
              <li>
                <strong>웹 서비스 접속:</strong> VM 안에서 프로그램이 실행 중인지, 서비스의 포트와
                공개 설정이 일치하는지 확인합니다. <GuideLink slug="network/publish">웹 서비스 공개</GuideLink>
              </li>
              <li>
                <strong>외부 도메인 연결:</strong> 도메인 상태와 등록한 DNS 레코드를 확인합니다.
                <GuideLink slug="network/domains">도메인 안내</GuideLink>
              </li>
              <li>
                <strong>LLM API 호출:</strong> 키의 발급 여부와 상태, 만료일, 호출 주소, 모델 이름,
                한도를 확인합니다. 응답의 오류 코드에 맞춰 <GuideLink slug="llm/errors">LLM 오류 안내</GuideLink>를
                확인하세요.
              </li>
            </ul>
            <p>
              여러 기능이 함께 동작하지 않으면 <GuideAction action="notices">공지사항</GuideAction>과
              로그인 화면의 점검 안내를 먼저 확인합니다. 점검 중에도 공개 사용 가이드는 읽을 수 있습니다.
            </p>
          </>
        ),
      },
      {
        id: 'contact',
        title: '문의할 때 함께 보낼 내용',
        body: (
          <>
            <p>
              해결되지 않은 문제는{' '}
              <a href={CONTACT_URL} target="_blank" rel="noreferrer">1:1 문의하기<span className="sr-only"> (새 탭)</span></a>로
              연락하세요. 기능 제안은{' '}
              <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">개선 의견 남기기<span className="sr-only"> (새 탭)</span></a>를
              이용할 수 있습니다.
            </p>
            <ul>
              <li>문제가 발생한 시각과 사용 중인 계정의 가입 이메일</li>
              <li>워크스페이스 이름과 신청 또는 리소스 이름</li>
              <li>어느 화면에서 어떤 동작을 했는지, 기대한 결과와 실제 결과</li>
              <li>화면에 표시된 오류 문구와 재현 순서, 필요한 경우 화면 캡처</li>
              <li>LLM 호출 문제라면 응답에 있는 오류 코드와 X-Request-Id 값</li>
            </ul>
            <p>
              비밀번호와 API 키 평문, SSH 개인키, 2단계 인증 복구 코드는 보내지 마세요.
              화면 캡처나 코드를 첨부할 때도 이 값은 가립니다.
            </p>
          </>
        ),
      },
    ],
  },
]
