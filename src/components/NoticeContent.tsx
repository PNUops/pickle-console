import type { NoticeImageView } from '../api/queries'
import { NoticeImage } from './NoticeImage'
import { Card } from './ui'

/** A notice uses the same plain text and stored images on every reader surface. */
export function NoticeContent({ body, images, variant = 'full' }: {
  body: string
  images: NoticeImageView[]
  variant?: 'full' | 'popup'
}) {
  if (variant === 'popup') return <div className="space-y-3">
    {images[0] && <NoticeImage image={images[0]} className="max-h-40 w-full rounded-lg object-cover" />}
    <p className="text-sm/6 whitespace-pre-line text-neutral-700">{body}</p>
  </div>
  return <div className="space-y-6">
    <div className="text-sm/7 whitespace-pre-line text-neutral-800">{body}</div>
    {images.length > 0 && <section className="space-y-4"><h2 className="text-sm font-semibold text-neutral-800">첨부 이미지</h2>
      {images.map((image) => <Card key={image.id} className="overflow-hidden p-2"><NoticeImage image={image} className="mx-auto h-auto w-full max-w-xl rounded" /></Card>)}
    </section>}
  </div>
}
