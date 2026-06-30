"use client"

import { useState, useEffect, useRef } from "react"

const LEVELS = [
  {
    label: "L1",
    title: "完全人工",
    color: "#EF4444",
    desc: "AI 仅生成建议，所有动作由人工确认执行。",
    actions: [
      "生成执行计划",
      "⏸ 等待人工逐步确认",
      "人工点击执行",
    ],
  },
  {
    label: "L2",
    title: "低风险自动",
    color: "#F59E0B",
    desc: "低风险动作自动执行，中高风险触发 Approval Gate。",
    actions: [
      "自动执行低风险动作",
      "⚠️ 中/高风险触发审批",
      "Approval Gate 弹出",
    ],
  },
  {
    label: "L3",
    title: "高度自动",
    color: "#10B981",
    desc: "仅最高风险动作（资金/数据删除）需要人工审批。",
    actions: [
      "批量自动执行",
      "仅高危动作审批",
      "审批超时自动降级",
    ],
  },
  {
    label: "L4",
    title: "全自动",
    color: "#00B4D8",
    desc: "在预设策略边界内完全自主运行，异常时自动回滚。",
    actions: [
      "策略边界内全自动",
      "异常自动触发 Rollback",
      "Canary 灰度验证",
    ],
  },
] as const

const AUDIT_EVENTS = [
  {
    time: "13:42:01",
    label: "TaskEnvelope 创建",
    domain: "Hermes",
    color: "#F5A623",
    done: true,
  },
  {
    time: "13:42:03",
    label: "WorkflowRun 启动",
    domain: "Hermes",
    color: "#F5A623",
    done: true,
  },
  {
    time: "13:42:05",
    label: "发送报价邮件",
    domain: "OpenClaw",
    color: "#00B4D8",
    done: true,
  },
  {
    time: "13:42:06",
    label: "ActionReceipt 写入",
    domain: "OpenClaw",
    color: "#00B4D8",
    done: true,
  },
  {
    time: "13:42:08",
    label: "AuditLog 记录",
    domain: "Governance",
    color: "#A78BFA",
    done: true,
  },
  {
    time: "13:42:30",
    label: "EvaluationReport 生成",
    domain: "Hermes",
    color: "#F5A623",
    done: false,
  },
] as const

export function GovernanceSection() {
  const [activeIdx, setActiveIdx] = useState(1) // default L2

  const lvl = LEVELS[activeIdx]

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
      id="governance"
      data-testid="governance-section"
      style={{ padding: "96px 24px" }}
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
            治理即产品
          </h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,.6)" }}>
            自动化等级可调，审批可追溯，偏差自动回滚。
          </p>
        </div>

        {/* Two-column grid — matches .gov-grid */}
        <div
          style={{
            display: "grid",
            gap: 24,
            gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))",
          }}
          className="gov-grid"
        >
          {/* 左：自动化等级控制器 — matches .gov-card */}
          <div
            data-testid="automation-level-controller"
            className="fade-in"
            style={{
              border: "1px solid rgba(255,255,255,.094)",
              background: "rgba(255,255,255,.05)",
              borderRadius: 20,
              padding: 32,
            }}
          >
            <h3
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                marginBottom: 24,
                color: "#fff",
              }}
            >
              自动化等级控制器
            </h3>

            {/* Level buttons — matches .level-btns */}
            <div
              data-testid="level-btns"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {LEVELS.map((l, i) => {
                const isActive = i === activeIdx
                return (
                  <button
                    key={l.label}
                    data-testid={`level-btn-${l.label}`}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    style={{
                      border: `1px solid ${isActive ? l.color : "rgba(255,255,255,.12)"}`,
                      borderRadius: 12,
                      padding: "12px 0",
                      fontSize: "0.875rem",
                      fontWeight: 800,
                      color: isActive ? l.color : "rgba(255,255,255,.35)",
                      background: isActive ? `${l.color}22` : "transparent",
                      transition: "all .25s",
                      cursor: "pointer",
                    }}
                  >
                    {l.label}
                  </button>
                )
              })}
            </div>

            {/* Level detail — matches .level-detail */}
            <div
              data-testid="level-detail"
              style={{
                border: `1px solid ${lvl.color}58`,
                borderRadius: 14,
                padding: 20,
                background: `${lvl.color}1A`,
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: lvl.color,
                  marginBottom: 4,
                }}
              >
                {lvl.label} &mdash; {lvl.title}
              </div>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "rgba(255,255,255,.6)",
                  marginBottom: 14,
                }}
              >
                {lvl.desc}
              </p>
              <ul className="level-actions" style={{ listStyle: "none" }}>
                {lvl.actions.map((a) => (
                  <li
                    key={a}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.85rem",
                      color: "rgba(255,255,255,.7)",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ color: lvl.color, fontSize: "1.1rem" }}>›</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>

            <p
              data-testid="level-note"
              style={{
                marginTop: 14,
                fontSize: "0.75rem",
                color: "rgba(255,255,255,.25)",
              }}
            >
              * 自动化等级由 AgentPolicy 控制，变更需通过 Proposal + Approval 流程
            </p>
          </div>

          {/* 右：执行审计时间轴 — matches .gov-card + audit log */}
          <div
            data-testid="audit-log-timeline"
            className="fade-in"
            style={{
              border: "1px solid rgba(255,255,255,.094)",
              background: "rgba(255,255,255,.05)",
              borderRadius: 20,
              padding: 32,
            }}
          >
            <h3
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                marginBottom: 24,
                color: "#fff",
              }}
            >
              执行审计时间轴
            </h3>

            {/* Audit events — matches .audit-event */}
            <div data-testid="audit-log">
              {AUDIT_EVENTS.map((ev) => (
                <div
                  key={`${ev.time}-${ev.label}`}
                  className="audit-event"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: "1px solid rgba(255,255,255,.06)",
                    background: "rgba(0,0,0,.25)",
                    borderRadius: 10,
                    padding: "12px 16px",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "rgba(255,255,255,.25)",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ev.time}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: "0.875rem",
                      color: "rgba(255,255,255,.8)",
                    }}
                  >
                    {ev.label}
                  </span>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 4,
                      color: ev.color,
                      background: `${ev.color}18`,
                    }}
                  >
                    {ev.domain}
                  </span>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: ev.done ? "#10B981" : "#FBBF24",
                      animation: ev.done ? "none" : "pulse 1.2s infinite",
                    }}
                  />
                </div>
              ))}
            </div>

            <p
              data-testid="audit-note"
              style={{
                marginTop: 12,
                fontSize: "0.75rem",
                color: "rgba(255,255,255,.25)",
              }}
            >
              * 每条记录绑定 auditTraceId，可完整回放执行链路
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .fade-in { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
        .fade-in.visible { opacity: 1; transform: translateY(0); }
        @media (max-width: 1040px) { .gov-grid { grid-template-columns: 1fr !important; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </section>
  )
}
