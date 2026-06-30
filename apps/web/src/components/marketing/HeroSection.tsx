"use client"

import { useState, useEffect, useRef } from "react"

const TAGLINES = [
  "可规划 · 可执行 · 可记忆",
  "可治理 · 可审计 · 可回滚",
  "可进化 · 可按行业装配",
]

const FLOW_STEPS = [
  { label: "意图解析", color: "#F5A623", domain: "Hermes" },
  { label: "Workflow 编排", color: "#F5A623", domain: "Hermes" },
  { label: "OpenClaw 执行", color: "#00B4D8", domain: "OpenClaw" },
  { label: "ActionReceipt", color: "#00B4D8", domain: "OpenClaw" },
  { label: "AuditLog", color: "#A78BFA", domain: "Governance" },
  { label: "进化提案", color: "#F5A623", domain: "Hermes" },
]

export function HeroSection() {
  const [taglineIdx, setTaglineIdx] = useState(0)
  const [activeStep, setActiveStep] = useState(0)
  const [taglineVisible, setTaglineVisible] = useState(true)
  const heroRef = useRef<HTMLElement>(null)

  // Tagline rotator — matches reference opacity fade cycle
  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineVisible(false)
      setTimeout(() => {
        setTaglineIdx((prev) => (prev + 1) % TAGLINES.length)
        setTaglineVisible(true)
      }, 400)
    }, 2600)
    return () => clearInterval(interval)
  }, [])

  // Flow animation — 850ms
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % FLOW_STEPS.length)
    }, 850)
    return () => clearInterval(interval)
  }, [])

  // IntersectionObserver for scroll fade-in
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 },
    )
    const targets = el.querySelectorAll(".fade-in")
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={heroRef}
      id="hero"
      data-testid="hero-section"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 96,
        paddingBottom: 48,
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}
    >
      {/* 网格线纹理 — matches .hero-grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(245,166,35,.04) 1px, transparent 1px), linear-gradient(rgba(245,166,35,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(245,166,35,.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* 径向光晕 — matches .hero-glow */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700,
          height: 700,
          background: "radial-gradient(circle, rgba(245,166,35,.10) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 900,
          padding: "0 16px",
        }}
      >
        {/* Badge — matches .hero-badge */}
        <div
          data-testid="hero-badge"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(245,166,35,.35)",
            background: "rgba(245,166,35,.10)",
            color: "#F5A623",
            fontSize: "0.75rem",
            fontWeight: 600,
            padding: "6px 16px",
            borderRadius: 99,
            marginBottom: 24,
            letterSpacing: ".04em",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#F5A623",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          V2.20.11-beta &middot; 内测中
        </div>

        {/* 主标题 — matches .hero-title */}
        <h1
          data-testid="hero-title"
          style={{
            fontSize: "clamp(2.4rem, 5.5vw, 4.5rem)",
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: "-.02em",
            marginBottom: 16,
          }}
        >
          你的企业不缺 AI，
          <br />
          <span style={{ color: "#F5A623" }}>缺的是能被治理的 AI 系统。</span>
        </h1>

        {/* 轮播副标题 — matches .hero-tagline */}
        <p
          data-testid="hero-tagline"
          style={{
            fontSize: "clamp(1rem, 2vw, 1.4rem)",
            color: "rgba(255,255,255,.6)",
            marginBottom: 40,
            minHeight: "2rem",
            transition: "opacity .4s",
            opacity: taglineVisible ? 1 : 0,
          }}
        >
          {TAGLINES[taglineIdx]}
        </p>

        {/* 双 CTA — matches .hero-ctas */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "center",
            marginBottom: 56,
          }}
        >
          <a
            href="#cta"
            data-testid="hero-cta-primary"
            className="btn-primary"
            style={{
              background: "#F5A623",
              color: "#000",
              fontWeight: 800,
              padding: "16px 36px",
              borderRadius: 14,
              fontSize: "1rem",
              textDecoration: "none",
              transition: "background .2s, transform .15s",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#e8961a"
              e.currentTarget.style.transform = "scale(1.04)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#F5A623"
              e.currentTarget.style.transform = "scale(1)"
            }}
          >
            申请企业内测 →
          </a>
          <a
            href="#architecture"
            data-testid="hero-cta-secondary"
            className="btn-secondary"
            style={{
              border: "1px solid rgba(255,255,255,.2)",
              color: "rgba(255,255,255,.8)",
              padding: "16px 36px",
              borderRadius: 14,
              fontSize: "1rem",
              textDecoration: "none",
              transition: "border-color .2s, color .2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,.4)"
              e.currentTarget.style.color = "#fff"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"
              e.currentTarget.style.color = "rgba(255,255,255,.8)"
            }}
          >
            查看三域架构
          </a>
        </div>

        {/* 执行流程动画 — matches .hero-flow */}
        <div
          data-testid="hero-flow"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginBottom: 48,
          }}
        >
          {FLOW_STEPS.map((step, i) => {
            const isActive = i <= activeStep
            return (
              <div key={`${step.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && (
                  <span
                    style={{
                      color: i - 1 < activeStep ? "#F5A623" : "rgba(255,255,255,.15)",
                      fontSize: "0.9rem",
                      transition: "color .5s",
                      userSelect: "none",
                    }}
                  >
                    →
                  </span>
                )}
                <div
                  data-testid="flow-step"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    border: `1px solid ${isActive ? step.color : "rgba(255,255,255,.1)"}`,
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontSize: "0.75rem",
                    backgroundColor: isActive ? `${step.color}1A` : "transparent",
                    color: isActive ? step.color : "rgba(255,255,255,.25)",
                    transition: "all .5s ease",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{step.label}</span>
                  <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>{step.domain}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 信任栏 — matches .hero-trust */}
        <div
          data-testid="hero-trust"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "8px 32px",
            fontSize: "0.85rem",
            color: "rgba(255,255,255,.25)",
          }}
        >
          <span>三域架构</span>
          <span>·</span>
          <span>审计全覆盖</span>
          <span>·</span>
          <span>Canary 灰度回滚</span>
          <span>·</span>
          <span>Industry Pack 行业装配</span>
        </div>
      </div>

      {/* Keyframes for pulse */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .fade-in { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
        .fade-in.visible { opacity: 1; transform: translateY(0); }
      `}</style>
    </section>
  )
}
