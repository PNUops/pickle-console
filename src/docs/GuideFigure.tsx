import { useId } from 'react'
import './GuideFigure.css'

export interface GuideFigureProps {
  src: string
  alt: string
  caption: string
  /** Native image dimensions reserve space before a lazy image loads. */
  width?: number
  height?: number
}

export function GuideFigure({ src, alt, caption, width, height }: GuideFigureProps) {
  const captionId = useId()

  return (
    <figure className="guide-figure" aria-labelledby={captionId}>
      <a
        className="guide-figure__link"
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={captionId}
      >
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
        <span className="guide-figure__expand" aria-hidden="true">원본 보기 ↗</span>
        <span className="sr-only"> (새 탭에서 원본 이미지 열기)</span>
      </a>
      <figcaption id={captionId}>{caption}</figcaption>
    </figure>
  )
}
