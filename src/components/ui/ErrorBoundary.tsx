import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface ErrorBoundaryProps {
  /** 이 패널의 이름 — 안내 문구가 어느 칸이 비었는지 밝힌다. */
  label: string
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * 지연 로드하는 패널 하나를 감싸는 오류 경계 — 배포 직후 낡은 청크를 불러오다
 * 실패하면 그 패널만 안내로 바뀌고 나머지 화면은 그대로 남는다. (React는 오류
 * 경계를 클래스 컴포넌트로만 제공한다.)
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 화면은 안내로 대체되므로, 원인은 콘솔에만 남긴다.
    console.error(`[${this.props.label}] 패널을 불러오지 못했습니다.`, error, info)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="status"
        className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600"
      >
        {this.props.label} 화면을 불러오지 못했습니다. 페이지를 새로고침하면 다시
        시도합니다.
      </div>
    )
  }
}
