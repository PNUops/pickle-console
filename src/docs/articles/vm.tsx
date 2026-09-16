import { GuideFigure } from '../GuideFigure'
import vmRequestImage from '../../assets/docs/vm-request.png'
import vmConnectionImage from '../../assets/docs/vm-connection.png'
import vmMonitoringImage from '../../assets/docs/vm-monitoring.png'
import { CodeBlock } from '../../components/CodeBlock'
import { GuideAction, GuideLink } from '../links'
import type { GuideArticle } from '../types'

const SSH_CONFIG = `Host pickle-vm
  HostName SSH_HOST
  User VM_HOSTNAME
  IdentityFile ~/.ssh/KEY_FILE
  IdentitiesOnly yes`

export const vmArticles: GuideArticle[] = [
  {
    slug: 'vm/request',
    title: '가상머신 신청하기',
    group: '가상머신',
    summary: '운영체제와 사양을 정하고, 승인된 가상머신이 만들어질 때까지 확인합니다.',
    keywords: ['VM', '서버', '신청', 'OS', 'CPU', '메모리', '디스크', '사양', '호스트 이름'],
    sections: [
      {
        id: 'prepare',
        title: '신청 전에 정할 것',
        body: (
          <>
            <p>
              가상머신은 프로그램을 설치하고 실행할 수 있는 서버입니다. 사용할 운영체제,
              필요한 CPU, 메모리, 디스크, 사용 목적과 종료일을 준비하세요. 팀이 함께 쓸
              서버라면 먼저 팀 또는 프로젝트 워크스페이스를 만듭니다.
            </p>
            <p>
              SSH 접속과 웹 서비스 공개는 가상머신을 만든 뒤 설정합니다. 신청서에서
              웹 주소나 공개 포트를 미리 정할 필요는 없습니다.
              워크스페이스 선택은 <GuideLink slug="workspaces/manage">워크스페이스 관리</GuideLink>,
              공통 신청 절차는 <GuideLink slug="requests/submit">리소스 신청하기</GuideLink>를
              참고하세요.
            </p>
          </>
        ),
      },
      {
        id: 'configure',
        title: '운영체제와 사양 선택하기',
        body: (
          <>
            <ol>
              <li>
                <GuideAction action="vms">가상머신 목록</GuideAction>에서 신청을 시작하거나,
                <GuideAction action="newRequest">리소스 신청</GuideAction>에서 가상머신을 고릅니다.
              </li>
              <li>
                <strong>리소스 구성</strong>에서 이름을 적고 운영체제의 계열과 버전을
                선택합니다. 이 이름은 콘솔에서 서버를 구분할 때 사용합니다.
              </li>
              <li>
                준비된 <strong>사양</strong>을 고르거나 <strong>직접 입력</strong>으로
                필요한 자원을 적습니다. vCPU는 처리 자원, 메모리는 실행 중인 프로그램이
                쓰는 공간, 디스크는 운영체제와 파일을 저장하는 공간입니다.
              </li>
              <li>
                직접 입력에서는 필요한 항목의 <strong>변경</strong>을 켜고 수치와 이유를
                적습니다. 메모리는 GiB 단위로 입력합니다. 예를 들어 데이터를 메모리에
                올리는 작업이라면 데이터 크기와 필요한 메모리를 함께 설명하세요.
              </li>
              <li>
                <strong>호스트 이름</strong>은 선택 사항입니다. 비우면 자동으로 정해집니다.
                직접 적을 때는 소문자, 숫자, 하이픈으로 3~40자를 입력합니다. SSH 접속에
                쓰는 이름이므로 생성 후에는 바꿀 수 없습니다.
              </li>
            </ol>
            <GuideFigure
              src={vmRequestImage}
              alt="가상머신 신청의 리소스 구성 단계에 있는 운영체제와 사양 선택"
              caption="리소스 구성에서 운영체제와 사양을 선택하고 필요한 자원과 호스트 이름을 확인합니다."
              width={1600}
              height={1812}
            />
          </>
        ),
      },
      {
        id: 'submit',
        title: '사용 목적과 기간을 적고 제출하기',
        body: (
          <>
            <p>
              <strong>신청 정보</strong>에서 기관과 워크스페이스를 고르고 사용 목적,
              사용 기간을 적습니다. 기관은 자원을 제공하고 신청을 검토하는 곳이며,
              워크스페이스는 만들어진 가상머신을 소유할 공간입니다.
            </p>
            <p>
              운영자가 제공한 기간을 고르거나 종료일을 직접 입력하세요. 계속 운영해야
              하는 서비스는 관리자와 먼저 상의한 뒤 <strong>무기한</strong>을 선택합니다.
              마지막 <strong>검토</strong>에서 사양, 소속, 기간을 확인하고 제출합니다.
            </p>
            <p>
              요청한 사양과 기간은 검토 과정에서 달라질 수 있습니다.
              <GuideAction action="requests">신청 내역</GuideAction>의 검토 결과에 적힌
              승인 사양과 사용 기간을 확인하세요.
            </p>
          </>
        ),
      },
      {
        id: 'ready',
        title: '생성 완료 확인과 첫 접속',
        body: (
          <>
            <ol>
              <li>신청이 승인되면 가상머신 생성이 시작됩니다. 알림에서 결과를 확인합니다.</li>
              <li>
                <GuideAction action="vms">가상머신 목록</GuideAction>에서 신청한 이름을
                찾아 상세 화면을 엽니다. 다른 워크스페이스를 보고 있다면 범위를 바꿉니다.
              </li>
              <li>
                생성 중에는 진행 상태를 확인하고 기다립니다. <strong>실행 중</strong>으로
                바뀌고 접속 영역이 준비되면 <GuideLink slug="vm/connect">가상머신에 접속하기</GuideLink>를
                따라 첫 셸을 엽니다.
              </li>
            </ol>
            <p>
              반려된 신청은 검토 의견을 확인하세요. 생성 실패나 <strong>관리자 확인 중</strong>이
              계속되면 같은 신청을 반복 제출하지 말고 가상머신 이름과 표시된 오류를
              <GuideLink slug="troubleshooting">문의에 포함</GuideLink>하세요.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: 'vm/connect',
    title: '가상머신 접속과 파일 전송',
    group: '가상머신',
    summary: '웹 터미널 또는 SSH로 접속하고, 개인키를 관리하며 파일을 주고받습니다.',
    keywords: ['SSH', '터미널', '접속', '개인키', 'pem', 'scp', 'sftp', 'sudo', '비밀번호', 'Windows'],
    sections: [
      {
        id: 'web-terminal',
        title: '브라우저에서 바로 접속하기',
        body: (
          <>
            <ol>
              <li><GuideAction action="vms">가상머신 목록</GuideAction>에서 사용할 VM을 엽니다.</li>
              <li>상태가 <strong>실행 중</strong>인지 확인합니다.</li>
              <li>
                <strong>개요 → 접속 → 웹 터미널 열기</strong>를 누릅니다.
                별도 창에서 셸이 열리며 개인키 파일은 필요하지 않습니다.
              </li>
            </ol>
            <p>
              접속하려면 해당 리소스의 참여자 이상 권한이 필요합니다. 워크스페이스에
              가입한 것만으로 접속 권한이 생기지는 않습니다.
              버튼이 없거나 권한 안내가 나오면 <GuideLink slug="workspaces/access">리소스 접근 권한</GuideLink>을
              확인하세요. 새 창이 열리지 않으면 브라우저의 팝업 차단도 확인합니다.
            </p>
          </>
        ),
      },
      {
        id: 'ssh',
        title: 'SSH 개인키로 접속하기',
        body: (
          <>
            <ol>
              <li>
                VM의 <strong>개요 → 접속 → SSH 클라이언트</strong>에서
                <strong> SSH 키 발급 및 다운로드</strong>를 누릅니다. 본인 확인이
                나타나면 완료한 뒤 개인키 파일을 받습니다.
              </li>
              <li>
                개인키를 본인만 읽을 수 있는 위치에 보관합니다. 같은 영역의
                <strong> 접속 방법 보기</strong>에서 Windows, macOS, Linux별 파일 권한
                설정과 이 VM의 접속 명령을 확인할 수 있습니다.
              </li>
              <li>
                표시된 SSH 명령의 개인키 경로를 실제 파일 위치에 맞추고 실행합니다.
                성공하면 VM의 셸 프롬프트가 나타납니다.
              </li>
            </ol>
            <p>
              키는 사용자와 VM별로 발급됩니다. 다른 VM의 키나 다른 사람의 키를 쓰지
              마세요. 외부에서 연결할 때 명령의 사용자 이름은 <strong>VM 호스트 이름</strong>이며,
              VM 내부의 SSH 계정과 다를 수 있습니다. 주소와 계정은 상세 화면의 접속 명령을
              그대로 기준으로 삼으세요.
            </p>
            <p>
              macOS와 Linux에서는 다음처럼 개인키 권한을 제한합니다. <code>KEY_FILE</code>은
              받은 파일 이름으로 바꾸고, 파일이 다른 위치에 있다면 경로도 바꾸세요.
            </p>
            <CodeBlock label="macOS / Linux" code="chmod 600 ~/.ssh/KEY_FILE" />
            <GuideFigure
              src={vmConnectionImage}
              alt="가상머신 개요의 웹 터미널 버튼과 SSH 클라이언트 접속 정보"
              caption="개요에서 웹 터미널을 열거나 SSH 키 발급 및 다운로드를 시작합니다."
              width={1104}
              height={292}
            />
          </>
        ),
      },
      {
        id: 'ssh-config',
        title: '접속 설정 저장하기',
        body: (
          <>
            <p>
              반복 접속할 때는 SSH 설정 파일에 별칭을 등록하면 편합니다. macOS와 Linux는
              <code> ~/.ssh/config</code>, Windows OpenSSH는 사용자 폴더의
              <code> .ssh\config</code>를 편집합니다. 기존 내용 아래에 다음 블록을 추가하세요.
            </p>
            <p>
              <code>SSH_HOST</code>와 <code>VM_HOSTNAME</code>은 VM 상세의 SSH 명령에서
              가져오고, <code>KEY_FILE</code>은 내려받은 개인키 파일 이름으로 바꿉니다.
              <code> IdentityFile</code>에는 실제 개인키 경로를 적으세요.
            </p>
            <CodeBlock label="SSH config" code={SSH_CONFIG} />
            <p>
              <code>pickle-vm</code>은 내 컴퓨터에서만 쓰는 별칭입니다. 여러 VM을 등록하면
              별칭도 각각 다르게 정합니다. <code>IdentitiesOnly yes</code>를 넣어야
              다른 키가 함께 제출되어 인증 시도 횟수를 소모하는 일을 피할 수 있습니다.
            </p>
            <CodeBlock label="접속 확인" code="ssh pickle-vm" />
          </>
        ),
      },
      {
        id: 'files',
        title: '파일 업로드와 다운로드',
        body: (
          <>
            <p>
              위 SSH 설정으로 <code>ssh pickle-vm</code> 접속을 확인한 뒤,
              <strong>내 컴퓨터의 터미널</strong>에서 다음 명령을 실행합니다.
              파일 이름과 경로는 실제 작업 대상에 맞게 바꾸세요.
            </p>
            <CodeBlock label="내 컴퓨터 → VM 홈 디렉터리" code="scp ./app.zip pickle-vm:./" />
            <CodeBlock label="VM 홈 디렉터리 → 내 컴퓨터" code="scp pickle-vm:./result.csv ./result.csv" />
            <CodeBlock label="폴더 업로드" code="scp -r ./project pickle-vm:./" />
            <p>
              대화형 파일 전송은 <code>sftp pickle-vm</code>으로 시작합니다.
              <code> put</code>은 업로드, <code>get</code>은 다운로드,
              <code> exit</code>는 종료입니다. 같은 경로에 파일이 있으면 덮어쓸 수 있으므로
              목적지를 확인하세요. 업로드 후 SSH에서 <code>ls</code>로 파일이 도착했는지 확인합니다.
            </p>
          </>
        ),
      },
      {
        id: 'credentials',
        title: 'sudo 비밀번호와 키 관리',
        body: (
          <>
            <p>
              프로그램 설치처럼 관리자 권한이 필요한 명령은 VM 안에서 <code>sudo</code>로
              실행합니다. 요구되는 비밀번호는 Pickle 로그인 비밀번호가 아닙니다.
              <strong> 개요 → VM 비밀번호 → 비밀번호 보기</strong>에서 확인하세요.
              소유자가 열람 최소 역할을 높였다면 참여자에게는 보이지 않을 수 있습니다.
            </p>
            <ul>
              <li>
                <strong>개인키 다시 받기:</strong> 기존 키 파일을 다시 내려받습니다.
                파일 위치만 잊었다면 재발급보다 이 동작을 사용하세요.
              </li>
              <li>
                <strong>키 재발급:</strong> 새 키를 만들고 기존 키를 즉시 무효화합니다.
                다른 컴퓨터의 파일과 SSH 설정도 교체해야 합니다. 이미 열린 SSH 세션은 끊기지 않습니다.
              </li>
              <li>
                <strong>키 삭제:</strong> 해당 키로 새로 접속할 수 없게 합니다.
                내려받은 개인키 파일도 직접 지우세요.
              </li>
              <li>
                <strong>비밀번호 재생성:</strong> 실행 중인 VM에서 편집자 이상이 수행합니다.
                이전 비밀번호는 즉시 바뀌므로 함께 사용하는 사람에게 변경 사실을 알려 주세요.
              </li>
            </ul>
            <p>
              VM 안에서 비밀번호를 직접 바꾸면 콘솔에 저장된 값과 달라집니다.
              필요한 경우 콘솔에서 재생성해 다시 맞출 수 있습니다.
            </p>
          </>
        ),
      },
      {
        id: 'connection-errors',
        title: '접속이 안 될 때',
        body: (
          <>
            <ul>
              <li>
                <strong>Permission denied:</strong> 이 VM의 키인지, 파일 경로와 권한이
                맞는지, 호스트 이름과 <code>IdentitiesOnly</code> 설정이 맞는지 확인합니다.
                키를 재발급했거나 접근 권한이 회수됐다면 이전 파일로는 접속할 수 없습니다.
              </li>
              <li>
                <strong>연결 시간 초과:</strong> VM이 실행 중인지 확인하고 웹 터미널도
                시험합니다. VM 내부 IP를 내 컴퓨터의 SSH 목적지로 쓰지 말고 상세의
                접속 명령을 사용하세요.
              </li>
              <li>
                <strong>호스트 키가 바뀌었다는 경고:</strong> 저장된 기록을 바로 지우지 말고
                접속 주소와 변경 여부를 관리자에게 확인합니다.
              </li>
            </ul>
            <p>
              해결되지 않으면 키나 비밀번호를 보내지 말고 VM 이름, 발생 시각, 오류 문구를
              <GuideLink slug="troubleshooting">문의에 포함</GuideLink>하세요.
              접속을 마쳤다면 <GuideLink slug="vm/manage">VM 관리</GuideLink> 또는
              <GuideLink slug="network/publish">웹 서비스 공개</GuideLink>로 이어가세요.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: 'vm/manage',
    title: '가상머신 관리와 사용 종료',
    group: '가상머신',
    summary: '전원과 사용량을 확인하고, 권한, 보호 설정, 사용 기간과 삭제를 관리합니다.',
    keywords: ['VM', '관리', '종료', '재부팅', '모니터링', '연장', '만료', '삭제', '백업', '보호'],
    sections: [
      {
        id: 'power',
        title: '전원과 작업 상태 확인하기',
        body: (
          <>
            <p>
              <GuideAction action="vms">가상머신 목록</GuideAction>에서 VM을 열면
              현재 상태와 사용할 수 있는 전원 동작이 보입니다. 접속 중인 작업을 저장한
              뒤 전원을 변경하세요.
            </p>
            <ul>
              <li><strong>시작:</strong> 중지된 VM을 켭니다. 실행 중으로 바뀐 뒤 접속합니다.</li>
              <li><strong>종료:</strong> 운영체제에 정상 종료를 요청합니다. 중지됨 상태까지 확인합니다.</li>
              <li><strong>재부팅:</strong> VM을 다시 시작합니다. 진행 중에는 접속이 잠시 끊깁니다.</li>
              <li>
                <strong>강제 종료:</strong> 종료 메뉴에서 선택합니다. 전원 차단에 해당하며
                쓰기 중인 데이터가 손상될 수 있으므로 정상 종료가 응답하지 않을 때 사용합니다.
              </li>
            </ul>
            <p>
              버튼을 누른 직후 작업이 끝나는 것은 아닙니다. 상태와 진행 안내가 바뀌는지
              확인하세요. <strong>관리자 확인 중</strong>에서는 복구될 때까지 조작이 제한됩니다.
            </p>
          </>
        ),
      },
      {
        id: 'monitoring',
        title: '사용량과 활동 확인하기',
        body: (
          <>
            <p>
              <strong>모니터링</strong> 탭에서 CPU, 메모리, 네트워크와 디스크 I/O의 변화를
              확인합니다. 느려진 시각의 그래프를 보고 VM 내부의 실행 중인 프로그램과
              함께 점검하세요. 디스크 I/O는 읽고 쓰는 양이며 남은 디스크 공간과는 다릅니다.
            </p>
            <p>
              <strong>활동</strong> 탭에서는 상태 변경과 작업 이력을 확인합니다.
              데이터가 없거나 조회 오류가 난 상태를 사용량 0으로 해석하지 마세요.
              문제가 이어지면 발생 시각과 VM 상태를 <GuideLink slug="troubleshooting">문의에 포함</GuideLink>합니다.
            </p>
            <GuideFigure
              src={vmMonitoringImage}
              alt="가상머신 모니터링 탭의 조회 기간과 자원 사용량 그래프"
              caption="모니터링 탭에서 조회 기간을 고르고 CPU와 메모리, 네트워크와 디스크 I/O의 변화를 확인합니다."
              width={1104}
              height={615}
            />
          </>
        ),
      },
      {
        id: 'settings',
        title: '접근 권한과 보호 설정',
        body: (
          <>
            <p>
              <strong>접근</strong> 탭에서는 누가 VM을 보고 사용할지 정합니다.
              <GuideLink slug="workspaces/access">리소스 접근 권한</GuideLink>의 등급을
              확인하고 필요한 권한을 부여하세요. 설정 항목은 각 항목을 변경할 수 있는
              등급에 따라 표시되거나 제한됩니다.
            </p>
            <ul>
              <li><strong>표시명:</strong> 콘솔에 보이는 이름을 바꿉니다. SSH 호스트 이름은 바뀌지 않습니다.</li>
              <li>
                <strong>비밀번호 SSH 허용:</strong> 기본 접속 방식은 개인키입니다.
                비밀번호 접속을 켜면 비밀번호를 아는 사람의 접속을 개인별 접근 목록으로
                회수할 수 없으므로 확인 창의 안내를 읽고 결정하세요.
              </li>
              <li><strong>비밀번호 열람 최소 역할:</strong> sudo에 쓰는 비밀번호를 볼 수 있는 등급을 정합니다.</li>
              <li>
                <strong>중지 보호:</strong> 종료, 재부팅, 강제 종료를 편집자 이상으로 제한합니다.
                VM 내부에서 sudo로 종료하는 동작까지 막는 것은 아닙니다.
              </li>
              <li><strong>삭제 보호:</strong> 삭제 접수를 막습니다. 삭제하려면 먼저 보호를 꺼야 합니다.</li>
            </ul>
            <p>
              보호 설정과 비밀번호 열람 최소 역할은 리소스 소유자가 관리합니다.
              이미 알려진 비밀번호는 권한을 낮춰도 회수되지 않으므로 필요하면
              <GuideLink slug="vm/connect" anchor="credentials">비밀번호를 재생성</GuideLink>하세요.
            </p>
          </>
        ),
      },
      {
        id: 'expiry',
        title: '사용 기간 확인과 연장',
        body: (
          <>
            <p>
              <strong>개요 → VM 정보 → 사용 기간</strong>에서 승인된 종료일을 확인합니다.
              종료일 당일까지 사용할 수 있으며, 기간이 만료되면 VM은 종료됩니다.
              데이터가 자동으로 삭제되지는 않지만 사용자가 직접 다시 시작할 수 없습니다.
            </p>
            <p>
              계속 사용해야 한다면 만료 전에 관리자에게 VM 이름, 새로 필요한 종료일,
              연장 사유를 전달하세요. 현재 연장은 관리자가 처리합니다.
              처리 뒤 상세 화면의 종료일이 바뀌었는지 확인하고, 중지된 VM은 시작합니다.
              <GuideAction action="notifications">알림함</GuideAction>과 이메일의 만료 안내도 확인하세요.
            </p>
          </>
        ),
      },
      {
        id: 'delete',
        title: '백업하고 삭제하기',
        body: (
          <>
            <p>
              <strong>플랫폼은 VM 데이터를 백업하지 않습니다.</strong> 필요한 파일과
              데이터베이스 백업을 VM 밖으로 옮기고, 옮긴 사본이 열리는지 확인하세요.
              <GuideLink slug="vm/connect" anchor="files">파일 전송</GuideLink>으로
              사본을 내려받을 수 있습니다.
            </p>
            <ol>
              <li>해당 VM을 사용하는 사람과 서비스의 종료 시점을 확인합니다.</li>
              <li>VM의 <strong>설정 → VM 삭제</strong>를 엽니다. 삭제 보호가 켜져 있다면 소유자가 먼저 해제합니다.</li>
              <li>확인 창에서 이름을 입력하고 삭제를 접수합니다.</li>
              <li>VM이 종료되고 삭제 예정 상태와 파기 시각이 표시되는지 확인합니다.</li>
            </ol>
            <p>
              삭제 접수는 해당 리소스 소유자 또는 워크스페이스 소유자가 수행하며 본인
              확인이 필요합니다. <strong>사용자는 접수 후 취소할 수 없습니다.</strong>
              유예 기간 중 실수를 알았다면 즉시 관리자에게 문의하세요. 영구 파기된 데이터는
              복구할 수 없습니다. 생성에 실패한 VM은 확인 창의 안내에 따라 즉시 삭제됩니다.
            </p>
            <p>
              VM이 파기되면 연결된 도메인과 포트포워딩도 사용할 수 없습니다.
              서비스 주소를 계속 써야 한다면 삭제 전에 이전을 준비하세요.
            </p>
          </>
        ),
      },
    ],
  },
]
