import { Link } from 'react-router'

const steps = [
  {
    title: '회원가입 · 이메일 인증',
    description: '부산대학교 이메일(@pusan.ac.kr)로 가입하고 인증 메일을 확인합니다.',
  },
  {
    title: 'VM 신청',
    description: '필요한 사양(CPU·메모리·디스크)과 사용 목적을 적어 신청서를 제출합니다.',
  },
  {
    title: '승인 후 바로 사용',
    description: '관리자가 승인하면 VM이 자동으로 만들어지고 접속 안내를 메일로 받습니다.',
  },
]

const features = [
  {
    title: '신청은 간단하게',
    description:
      '복잡한 설정 없이 용도와 사양만 고르면 됩니다. 신청부터 사용까지 콘솔에서 한 번에 진행됩니다.',
  },
  {
    title: '승인 기반으로 안전하게',
    description:
      '모든 VM은 기관 관리자의 승인을 거쳐 만들어집니다. 자원은 공정하게, 운영은 투명하게 관리됩니다.',
  },
  {
    title: '팀 프로젝트에 유용하게',
    description:
      '개인 실습은 물론 팀·프로젝트 그룹 단위로 VM을 함께 쓰고, 역할별로 권한을 나눌 수 있습니다.',
  },
]

export function LandingPage() {
  return (
    <div>
      {/* hero */}
      <section className="bg-gradient-to-b from-primary-50 to-neutral-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-primary-700">
              부산대학교 클라우드 플랫폼
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
              수업과 프로젝트를 위한
              <br />
              나만의 서버, <span className="text-primary-600">피클</span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-neutral-600">
              학교 이메일로 가입하고 가상 머신(VM)을 신청하세요. 관리자 승인 후 몇 분 안에
              실습·과제·팀 프로젝트에 바로 쓸 수 있는 서버가 준비됩니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="inline-flex h-12 items-center rounded-lg bg-primary-600 px-6 text-base font-medium text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                지금 시작하기
              </Link>
              <Link
                to="/login"
                className="inline-flex h-12 items-center rounded-lg border border-neutral-300 bg-white px-6 text-base font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                로그인
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 신청 절차 3단계 */}
      <section aria-labelledby="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="how-it-works" className="text-2xl font-bold text-neutral-900">
          신청 절차
        </h2>
        <p className="mt-1 text-sm text-neutral-500">세 단계면 충분합니다.</p>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-card border border-neutral-200 bg-white p-6 shadow-card"
            >
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white"
              >
                {index + 1}
              </span>
              <h3 className="mt-4 font-semibold text-neutral-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 서비스 소개 */}
      <section aria-labelledby="features" className="border-t border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="features" className="text-2xl font-bold text-neutral-900">
            피클이 하는 일
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title}>
                <h3 className="font-semibold text-primary-800">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12 rounded-card bg-primary-600 px-8 py-10 text-center">
            <h2 className="text-xl font-bold text-white">피클과 함께 시작해 보세요</h2>
            <p className="mt-2 text-sm text-primary-100">
              부산대학교 구성원이라면 누구나 무료로 이용할 수 있습니다.
            </p>
            <Link
              to="/signup"
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-white px-6 text-sm font-semibold text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              회원가입
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
