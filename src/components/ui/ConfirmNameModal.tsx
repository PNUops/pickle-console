import { useEffect, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { FormField } from './FormField'
import { Input } from './Input'
import { Modal } from './Modal'

export interface ConfirmNameModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** 확인을 위해 정확히 입력해야 하는 대상 이름 (예: VM 이름). */
  expectedName: string
  /** 확인(danger) 버튼 라벨. */
  confirmLabel: string
  /** 확인 버튼의 로딩 상태. */
  loading?: boolean
  /**
   * 확인 시 사용자가 실제로 타이핑한 이름을 전달한다. 호출부는 이 값을
   * 그대로 서버 confirmName으로 전송해야 한다 — 이미 아는 expectedName을
   * 전송하면 서버의 이중 확인(이름 정확 일치 검사)이 무력화된다.
   */
  onConfirm: (typedName: string) => void
  /** 경고·안내 본문 (이름 입력 필드 위에 렌더링). */
  children?: ReactNode
}

/**
 * 파괴적 작업(삭제 등) 확인 모달. 대상 이름을 정확히 입력해야만
 * 확인 버튼이 활성화된다 (오조작 방지 — 계약의 confirmName 패턴과 동일).
 */
export function ConfirmNameModal({
  open,
  onClose,
  title,
  expectedName,
  confirmLabel,
  loading = false,
  onConfirm,
  children,
}: ConfirmNameModalProps) {
  const [name, setName] = useState('')

  // 닫았다 다시 열면 입력값이 남지 않게 초기화한다.
  useEffect(() => {
    if (!open) setName('')
  }, [open])

  const matches = name === expectedName

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            돌아가기
          </Button>
          <Button
            variant="danger"
            disabled={!matches}
            loading={loading}
            onClick={() => onConfirm(name)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        <FormField
          label={`계속하려면 이름(${expectedName})을 정확히 입력하세요`}
          required
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={expectedName}
          />
        </FormField>
      </div>
    </Modal>
  )
}
