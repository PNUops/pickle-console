import { useId } from 'react'
import './GuideVideo.css'

export interface GuideVideoProps {
  src: string
  poster: string
  captionsSrc: string
  title: string
  caption: string
  width: number
  height: number
}

export function GuideVideo({ src, poster, captionsSrc, title, caption, width, height }: GuideVideoProps) {
  const captionId = useId()

  return (
    <figure className="guide-video" aria-labelledby={captionId}>
      <video
        className="guide-video__player"
        aria-label={title}
        aria-describedby={captionId}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        width={width}
        height={height}
      >
        <source src={src} type="video/mp4" />
        <track src={captionsSrc} kind="captions" srcLang="ko" label="한국어" default={false} />
        <p>영상을 재생할 수 없으면 <a href={src}>MP4 파일을 내려받아 확인합니다.</a></p>
      </video>
      <figcaption id={captionId}>{caption}</figcaption>
    </figure>
  )
}
