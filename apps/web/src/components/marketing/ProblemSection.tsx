"use client"

import { useEffect, useRef } from "react"

const PROBLEMS = [
  {
    id: "no-loop",
    icon: "🔄",
    pain: "没有稳定执行闭环",
    painDesc: "问答之后谁来执行？执行结果如何沉淀？",
    backColor: "rgba(245,166,35,.08)",
    accentColor: "#F5A623",
    solutionTitle: "HermesClaw 解法",
    solutionDesc: "Hermes 编排 WorkflowRun，OpenClaw 回传 ActionReceipt，形成可验证闭环。",
  },
  {
    id: "no-memory",
    icon: "🧠",
    pain: "没有组织级记忆",
    painDesc: "知识散落在微信、文档、邮箱，无法沉淀。",
    backColor: "rgba(245,166,35,.08)",
    accentColor: "#F5A623",
    solutionTitle: "HermesClaw 解法",
    solutionDesc: "三层记忆（会话 / 项目 / 组织），自动写入 AuditLog，永久可查。",
  },
  {
    id: "no-template",
    icon: "🏭",
    pain: "没有行业模板",
    painDesc: "每家企业都要从零配置，成本高昂。",
    backColor: "rgba(0,180,216,.08)",
    accentColor: "#00B4D8",
    solutionTitle: "HermesClaw 解法",
    solutionDesc: "Industry Pack 一键装载：外贸 / 医疗 / 教育 / 金融，开箱即用。",
  },
  {
    id: "no-governance",
    icon: "🛡️",
    pain: "没有可治理的执行面",
    painDesc: "AI 执行结果无法追溯，风控和安全无保障。",
    backColor: "rgba(167,139,250,.08)",
    accentColor: "#A78BFA",
    solutionTitle: "HermesClaw 解法",
    solutionDesc: "L1-L4 自动化等级 + Approval Gate + Rollback，每步可审计。",
  },
  {
    id: "no-evolution",
    icon: "📈",
    pain: "没有自进化机制",
    painDesc: "系统不会从成功与失败中学习，永远需要人工干预。",
    backColor: "rgba(245,166,35,.08)",
    accentColor: "#F5A623",
    solutionTitle: "HermesClaw 解法",
    solutionDesc: "Evaluation Engine → Proposal Engine → Canary 灰度，系统持续进化。",
  },
] as const

export function ProblemSection() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
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
      ref={sectionRef}
      id="problems"
      data-testid="problem-section"
      style={{
        padding: "96px 24px",
        background: "#0D0D14",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* 标题 — matches .section-header */}
        <div
          className="fade-in"
          style={{
            textAlign: "center",
            marginBottom: 56,
          }}
        >
          <h2
            style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            中小企业用 AI 的{" "}
            <span style={{ color: "#f87171" }}>5 个核心障碍</span>
          </h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,.6)" }}>
            问题不是模型不够强——而是缺少系统性支撑。
          </p>
        </div>

        {/* 卡片网格 — matches .problems-grid */}
        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {PROBLEMS.map((p) => (
            <div
              key={p.id}
              data-testid={`problem-card-${p.id}`}
              className="problem-card fade-in"
              style={{
                position: "relative",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.094)",
                background: "rgba(255,255,255,.05)",
                borderRadius: 18,
                padding: 28,
                minHeight: 160,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"
                const front = e.currentTarget.querySelector(".problem-front") as HTMLElement
                const back = e.currentTarget.querySelector(".problem-back") as HTMLElement
                if (front) front.style.opacity = "0"
                if (back) back.style.opacity = "1"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,.094)"
                const front = e.currentTarget.querySelector(".problem-front") as HTMLElement
                const back = e.currentTarget.querySelector(".problem-back") as HTMLElement
                if (front) front.style.opacity = "1"
                if (back) back.style.opacity = "0"
              }}
            >
              {/* 正面：痛点 — matches .problem-front */}
              <div
                className="problem-front"
                style={{
                  transition: "opacity .3s",
                  opacity: 1,
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>{p.icon}</div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#f87171", marginBottom: 8 }}>
                  {p.pain}
                </h3>
                <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,.6)" }}>
                  {p.painDesc}
                </p>
              </div>

              {/* 背面：解法 — matches .problem-back */}
              <div
                className="problem-back"
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: 28,
                  borderRadius: 18,
                  background: p.backColor,
                  opacity: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  transition: "opacity .3s",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>
                  ✅
                </div>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: p.accentColor, marginBottom: 8 }}>
                  {p.solutionTitle}
                </h4>
                <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,.75)" }}>
                  {p.solutionDesc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .fade-in { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
        .fade-in.visible { opacity: 1; transform: translateY(0); }
        .problem-card { transition: border-color .3s; }
      `}</style>
    </section>
  )
}
