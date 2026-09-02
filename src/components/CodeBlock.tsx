import { CopyButton } from './CopyButton'

export interface CodeBlockProps {
  /** 그대로 복사되어 실행될 본문. 화면에 보이는 것과 복사되는 것이 같아야 한다. */
  code: string
  /** 블록 위에 붙는 이름(`curl`, `Python` 등). */
  label?: string
  /** 복사 버튼을 숨길 때. 한 줄짜리 값에는 바깥에서 따로 붙이는 편이 낫다. */
  copyable?: boolean
}

/** 복사해서 그대로 실행할 수 있는 코드 블록. */
export function CodeBlock({ code, label, copyable = true }: CodeBlockProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
      {(label || copyable) && (
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-2">
          <span className="font-mono text-xs text-neutral-400">{label}</span>
          {copyable && <CopyButton value={code} label="복사" />}
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6 text-neutral-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}
