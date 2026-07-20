/**
 * 히어로 우측 비주얼의 정적 폴백. 3D 씬(HeroScene) 로딩 중 Suspense 폴백이자
 * WebGL 미지원 환경의 대체 그래픽으로 쓰인다 — 중앙 코어(호스트)와 궤도 노드(VM)라는
 * 모티프를 CSS만으로 은유한다.
 */
export function HeroFallback() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[540px]">
      {/* 중앙 코어 */}
      <div className="absolute top-1/2 left-1/2 size-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/25 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-primary-300/40 bg-primary-500/15 backdrop-blur-sm">
        <div className="size-8 rounded-lg bg-primary-400/70" />
      </div>
      {/* 궤도 링 */}
      <div className="absolute top-1/2 left-1/2 size-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <div className="absolute top-1/2 left-1/2 size-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" />
      <div className="absolute top-1/2 left-1/2 size-[96%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
      {/* 궤도 위 VM 노드 */}
      <div className="absolute top-[24%] left-[18%] size-4 animate-float rounded-md border border-primary-300/50 bg-primary-500/40" />
      <div
        className="absolute top-[12%] right-[30%] size-3 animate-float rounded-md border border-primary-300/40 bg-primary-500/30"
        style={{ animationDelay: '-2.2s' }}
      />
      <div
        className="absolute right-[12%] bottom-[30%] size-5 animate-float rounded-md border border-primary-300/50 bg-primary-500/40"
        style={{ animationDelay: '-4.1s' }}
      />
      <div
        className="absolute bottom-[16%] left-[32%] size-3 animate-float rounded-md border border-primary-300/40 bg-primary-500/30"
        style={{ animationDelay: '-5.6s' }}
      />
    </div>
  )
}
