import { Line, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { HeroFallback } from './HeroFallback'

/**
 * 히어로 3D 씬 — 중앙 코어(호스트)와 궤도를 도는 VM 노드들.
 * "하나의 인프라에서 각자의 서버가 만들어진다"는 모티프.
 *
 * - React.lazy로만 로드되므로(three ~160KB gzip) 콘솔 진입 번들에 영향 없음.
 * - WebGL 미지원 → HeroFallback, reduced-motion/화면 밖 → 정지 프레임(demand).
 */

/** 궤도 정의: 반지름 / 노드 수 / X축 기울기 / 위상 / 노드 크기 */
const RINGS = [
  { radius: 2.0, count: 5, tilt: 0.48, phase: 0.0, size: 0.2 },
  { radius: 2.8, count: 6, tilt: -0.34, phase: 0.55, size: 0.16 },
  { radius: 3.55, count: 4, tilt: 0.16, phase: 1.15, size: 0.13 },
]

function ringNodePositions(ring: (typeof RINGS)[number]): THREE.Vector3[] {
  const euler = new THREE.Euler(ring.tilt, 0, 0)
  return Array.from({ length: ring.count }, (_, i) => {
    const angle = ring.phase + (i * Math.PI * 2) / ring.count
    return new THREE.Vector3(
      Math.cos(angle) * ring.radius,
      0,
      Math.sin(angle) * ring.radius,
    ).applyEuler(euler)
  })
}

function ringCirclePoints(ring: (typeof RINGS)[number]): THREE.Vector3[] {
  const euler = new THREE.Euler(ring.tilt, 0, 0)
  return Array.from({ length: 65 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 64
    return new THREE.Vector3(
      Math.cos(angle) * ring.radius,
      0,
      Math.sin(angle) * ring.radius,
    ).applyEuler(euler)
  })
}

/** 시드 고정 LCG — 렌더마다 배치가 흔들리지 않는 결정적 파티클 좌표. */
function particlePositions(count: number): Float32Array {
  let seed = 20260720
  const next = () => {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
  }
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // 반지름 4.2~6.5 구 껍질에 흩뿌린다(씬 바깥 배경 별처럼).
    const r = 4.2 + next() * 2.3
    const theta = next() * Math.PI * 2
    const phi = Math.acos(next() * 2 - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.7
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  return positions
}

function OrbitalScene({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)

  const rings = useMemo(
    () =>
      RINGS.map((ring) => ({
        nodes: ringNodePositions(ring),
        circle: ringCirclePoints(ring),
        size: ring.size,
      })),
    [],
  )
  const particles = useMemo(() => particlePositions(140), [])

  useFrame((state, delta) => {
    if (!animate) return
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    // 느린 자전 + 부유, 마우스 패럴랙스는 부드럽게 lerp.
    g.rotation.y += delta * 0.12
    g.position.y = Math.sin(t * 0.4) * 0.1
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, state.pointer.y * -0.14, 0.04)
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, state.pointer.x * 0.07, 0.04)
    if (core.current) {
      core.current.rotation.x = t * 0.25
      core.current.rotation.y = t * 0.32
    }
  })

  return (
    <group ref={group}>
      {/* 중앙 코어: 와이어프레임 외피 + 발광 코어 */}
      <mesh>
        <icosahedronGeometry args={[0.98, 1]} />
        <meshBasicMaterial color="#4aa7b8" wireframe transparent opacity={0.28} />
      </mesh>
      <RoundedBox ref={core} args={[0.72, 0.72, 0.72]} radius={0.1} smoothness={3}>
        <meshStandardMaterial
          color="#217286"
          emissive="#2e8b9e"
          emissiveIntensity={1.5}
          roughness={0.25}
          metalness={0.35}
        />
      </RoundedBox>

      {rings.map((ring, ringIndex) => (
        <group key={ringIndex}>
          {/* 궤도선 */}
          <Line points={ring.circle} color="#81c7d3" transparent opacity={0.1} lineWidth={1} />
          {ring.nodes.map((position, i) => (
            <group key={i}>
              {/* 코어-노드 연결선 */}
              <Line
                points={[new THREE.Vector3(0, 0, 0), position]}
                color="#2e8b9e"
                transparent
                opacity={0.18}
                lineWidth={1}
              />
              {/* VM 노드 */}
              <RoundedBox position={position} args={[ring.size, ring.size, ring.size]} radius={0.03} smoothness={2}>
                <meshStandardMaterial
                  color="#2e8b9e"
                  emissive="#4aa7b8"
                  emissiveIntensity={0.55 + ((i + ringIndex) % 3) * 0.35}
                  roughness={0.35}
                  metalness={0.25}
                />
              </RoundedBox>
            </group>
          ))}
        </group>
      ))}

      {/* 배경 파티클 */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#81c7d3"
          size={0.035}
          transparent
          opacity={0.45}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  )
}

function detectWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!context) return false
    // 감지용 컨텍스트는 즉시 반납한다(브라우저 동시 컨텍스트 상한 잠식 방지).
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export default function HeroScene() {
  const reduced = useReducedMotion()
  const [webglSupported] = useState(detectWebgl)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)

  // 히어로가 화면 밖으로 나가면 렌더 루프를 멈춰 GPU를 아낀다.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? true),
      { threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!webglSupported) {
    return <HeroFallback />
  }

  const animate = inView && !reduced
  return (
    <div ref={wrapRef} aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[540px]">
      <Canvas
        frameloop={animate ? 'always' : 'demand'}
        dpr={[1, 2]}
        camera={{ position: [0, 1.1, 7], fov: 42 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <fog attach="fog" args={['#020617', 7.5, 13]} />
        <ambientLight intensity={0.35} />
        <pointLight position={[0, 0, 0]} intensity={26} color="#2e8b9e" />
        <directionalLight position={[4, 6, 3]} intensity={0.7} color="#81c7d3" />
        <OrbitalScene animate={animate} />
      </Canvas>
    </div>
  )
}
