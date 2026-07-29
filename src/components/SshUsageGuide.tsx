import { useId, useState } from 'react'
import { cn } from '../lib/cn'
import { SSH_GATEWAY_HOST } from '../lib/hosts'
import { TabPanel, Tabs } from './ui'

type OsTab = 'windows' | 'macos' | 'linux'

const TABS: { id: OsTab; label: string }[] = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
]

const KEY_FILE = 'id_ed25519_pickle'

/** 코드 한 줄 — 터미널 명령·설정을 mono로 표시한다. */
function Code({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs whitespace-pre text-neutral-100">
      {children}
    </code>
  )
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {children}
    </div>
  )
}

export interface SshUsageGuideProps {
  /** VM 호스트명 (게이트웨이 로그인 계정 = 호스트명). 없으면 자리표시자. */
  hostname?: string
  /** SSH 게이트웨이 호스트. 없으면 자리표시자. */
  sshHost?: string
  className?: string
}

/**
 * OS별 SSH 접속 안내 — 키 파일 이동·권한 설정, `ssh -i` 접속 명령, ~/.ssh/config 예시.
 * 게이트웨이는 사용자명으로 대상 VM을 라우팅하므로 로그인 계정은 VM 호스트명이다.
 */
export function SshUsageGuide({ hostname, sshHost, className }: SshUsageGuideProps) {
  // 페이지 카드와 키 발급 모달에 동시에 마운트될 수 있어 탭 id를 인스턴스별로 구분한다.
  const uid = useId()
  const [tab, setTab] = useState<OsTab>('macos')
  const host = hostname ?? '<VM 호스트명>'
  const gateway = sshHost ?? SSH_GATEWAY_HOST
  const isWindows = tab === 'windows'
  const keyPath = isWindows
    ? `%USERPROFILE%\\.ssh\\${KEY_FILE}`
    : `~/.ssh/${KEY_FILE}`

  return (
    <div className={cn('space-y-4', className)}>
      <Tabs
        aria-label="운영체제"
        tabs={TABS}
        value={tab}
        onChange={(id) => setTab(id as OsTab)}
        idPrefix={uid}
      />

      {/* 안내 본문은 OS별로 갈라지는 단일 흐름 — 활성 탭이 곧 패널이다. */}
      <TabPanel id={tab} active idPrefix={uid} className="space-y-4">
        <Step title="1. 개인키 파일을 안전한 위치로 옮깁니다">
          {isWindows ? (
            <Code>{`move %USERPROFILE%\\Downloads\\${KEY_FILE} %USERPROFILE%\\.ssh\\`}</Code>
          ) : (
            <Code>{`mv ~/Downloads/${KEY_FILE} ~/.ssh/`}</Code>
          )}
        </Step>

        <Step title="2. 개인키 파일 권한을 제한합니다">
          {isWindows ? (
            <Code>{`icacls "${keyPath}" /inheritance:r /grant:r "%USERNAME%:R"`}</Code>
          ) : (
            <Code>{`chmod 600 ${keyPath}`}</Code>
          )}
        </Step>

        <Step title="3. SSH로 접속합니다">
          <Code>{`ssh -i ${keyPath} ${host}@${gateway}`}</Code>
        </Step>

        <Step title="자주 접속한다면 ~/.ssh/config에 등록하세요">
          <Code>{`Host ${host}\n  HostName ${gateway}\n  User ${host}\n  IdentityFile ${keyPath}`}</Code>
          <p className="text-xs text-neutral-500">
            등록 후에는 <span className="font-mono">ssh {host}</span> 만으로 접속할 수 있습니다.
          </p>
        </Step>
      </TabPanel>
    </div>
  )
}
