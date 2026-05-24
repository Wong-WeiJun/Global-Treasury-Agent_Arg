import type { LucideIcon } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"

interface Particle {
  el: HTMLDivElement
  root: Root
  x: number
  y: number
  translateX: number
  translateY: number
  dx: number
  dy: number
  size: number
  alpha: number
  targetAlpha: number
  magnetism: number
  rotation: number
  dRotation: number
}

interface IconParticleBackgroundProps {
  icons: LucideIcon[]
  quantity?: number
  ease?: number
  sizeRange?: [number, number]
  className?: string
}

export function IconParticleBackground({
  icons,
  quantity = 30,
  ease = 60,
  sizeRange = [24, 48],
  className = "",
}: IconParticleBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const magnetRef = useRef({ x: 0, y: 0 })
  const mouseRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)
  const dimsRef = useRef({ w: 0, h: 0 })

  // ─── helpers ────────────────────────────────────────────────────────────

  const pickIcon = useCallback((): LucideIcon => {
    return icons[Math.floor(Math.random() * icons.length)]
  }, [icons])

  const edgeFade = useCallback((vals: number[]): number => {
    const min = Math.min(...vals)

    if (min >= 20) return 1
    if (min <= 0) return 0

    return min / 20
  }, [])

  const spawnParticle = useCallback((): Particle => {
    const { w, h } = dimsRef.current

    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0])

    const el = document.createElement("div")

    el.style.cssText = `
      position: absolute;
      pointer-events: none;
      will-change: transform, opacity;
      display: flex;
      align-items: center;
      justify-content: center;
      width: ${size}px;
      height: ${size}px;
      color: currentColor;
    `

    containerRef.current?.appendChild(el)

    const root = createRoot(el)
    const Icon = pickIcon()

    root.render(<Icon size={size} strokeWidth={1.2} />)

    return {
      el,
      root,
      x: Math.random() * w,
      y: Math.random() * h,
      translateX: 0,
      translateY: 0,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      size,
      alpha: 0,
      targetAlpha: parseFloat((Math.random() * 0.2 + 0.1).toFixed(2)),
      magnetism: 0.5 + Math.random() * 4,
      rotation: Math.random() * 360,
      dRotation: (Math.random() - 0.5) * 0.3,
    }
  }, [pickIcon, sizeRange])

  const destroyAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current)

    for (const p of particlesRef.current) {
      p.root.unmount()
      p.el.remove()
    }

    particlesRef.current = []
  }, [])

  // ─── animation loop ──────────────────────────────────────────────────────

  const animate = useCallback(() => {
    const { w, h } = dimsRef.current

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i]

      // fade based on edge proximity
      const fade = edgeFade([
        p.x + p.translateX - p.size,
        w - p.x - p.translateX - p.size,
        p.y + p.translateY - p.size,
        h - p.y - p.translateY - p.size,
      ])

      p.alpha =
        fade >= 1
          ? Math.min(p.alpha + 0.008, p.targetAlpha)
          : p.targetAlpha * fade

      // drift
      p.x += p.dx
      p.y += p.dy
      p.rotation += p.dRotation

      // mouse magnetism
      p.translateX +=
        (magnetRef.current.x / (ease / p.magnetism) - p.translateX) / ease

      p.translateY +=
        (magnetRef.current.y / (ease / p.magnetism) - p.translateY) / ease

      // apply to DOM directly — no React re-render
      p.el.style.opacity = String(p.alpha)

      p.el.style.transform = `translate(${p.x + p.translateX}px, ${
        p.y + p.translateY
      }px) rotate(${p.rotation}deg)`

      // respawn if off-screen
      if (
        p.x < -p.size ||
        p.x > w + p.size ||
        p.y < -p.size ||
        p.y > h + p.size
      ) {
        p.root.unmount()
        p.el.remove()

        particlesRef.current.splice(i, 1)
        particlesRef.current.push(spawnParticle())
      }
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [ease, edgeFade, spawnParticle])

  // ─── init ────────────────────────────────────────────────────────────────

  const init = useCallback(() => {
    destroyAll()

    const container = containerRef.current

    if (!container) return

    dimsRef.current = {
      w: container.offsetWidth,
      h: container.offsetHeight,
    }

    for (let i = 0; i < quantity; i++) {
      particlesRef.current.push(spawnParticle())
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [animate, destroyAll, quantity, spawnParticle])

  // ─── effects ─────────────────────────────────────────────────────────────

  useEffect(() => {
    init()

    const onResize = () => init()

    window.addEventListener("resize", onResize)

    return () => {
      destroyAll()
      window.removeEventListener("resize", onResize)
    }
  }, [destroyAll, init])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX,
        y: e.clientY,
      }

      const container = containerRef.current

      if (!container) return

      const rect = container.getBoundingClientRect()

      const { w, h } = dimsRef.current

      const dx = e.clientX - rect.left - w / 2
      const dy = e.clientY - rect.top - h / 2

      if (Math.abs(dx) < w / 2 && Math.abs(dy) < h / 2) {
        magnetRef.current = { x: dx, y: dy }
      }
    }

    window.addEventListener("mousemove", onMove)

    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  )
}
