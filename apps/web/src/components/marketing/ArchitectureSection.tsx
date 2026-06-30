"use client"

import { useEffect, useRef } from "react"

const DOMAINS = [
  {
    id: "hermes",
    tag: "控制内核",
    title: "Hermes Control Kernel",
    color: "#F5A623",
    borderColor: "rgba(245,166,35,.25)",
    bg: "rgba(245,166,35,.06)",
    items: [
      "意图解析 → TaskEnvelope",
      "DAG Workflow 生成与编排",
      "多层记忆管理（会话/项目/组织）",
      "Agent Policy 治理与自动化等级",
      "Evaluation + Proposal + Rollback",
      "AuditLog 写入（治理真相源）",
    ],
  },
  {
    id: "openclaw",
    tag: "执行运行时",
    title: "OpenClaw Execution Runtime",
    color: "#00B4D8",
    borderColor: "rgba(0,180,216,.25)",
    bg: "rgba(0,180,216,.06)",
    items: [
      "渠道会话与设备在线状态",
      "连接器动作执行（Connectors/Tools）",
      "长连接事件流（WebSocket / SSE）",
      "ExecutionEvent 流回传",
      "ActionReceipt 存储",
      "Sandbox 模式与主会话切换",
    ],
  },
  {
    id: "industry",
    tag: "行业插件层",
    title: "Industry Pack Layer",
    color: "#A78BFA",
    borderColor: "rgba(167,139,250,.25)",
    bg: "rgba(167,139,250,.06)",
    items: [
      "行业 Agent 模板（岗位化）",
      "行业 Workflow Templates",
      "技能包 + SOP",
      "行业 KPI Schema + Dashboard",
      "行业知识包与字段 schema",
      "行业连接器映射（CRM/ERP/邮件）",
    ],
  },
] as const

const LOOP_STEPS = [
  { label: "TaskEnvelope", color: "#F5A623" },
  { label: "WorkflowRun", color: "#F5A623" },
  { label: "ExecutionEvent", color: "#00B4D8" },
  { label: "ActionReceipt", color: "#00B4D8" },
  { label: "EvaluationReport", color: "#A78BFA" },
  { label: "Proposal → Approve", color: "#A78BFA" },
]

export function ArchitectureSection() {
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
      id="architecture"
      data-testid="architecture-section"
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
            三域架构
          </h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,.6)" }}>
            每一步都有迹可查，每一次偏差都进入治理流程。
          </p>
        </div>

        {/* 三领域卡片 — matches .arch-grid */}
        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            marginBottom: 40,
          }}
        >
          {DOMAINS.map((domain) => (
            <div
              key={domain.id}
              data-testid={`arch-layer-${domain.id}`}
              className="fade-in"
              style={{
                border: `1px solid ${domain.borderColor}`,
                borderRadius: 18,
                padding: 28,
                background: domain.bg,
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: domain.color,
                  marginBottom: 4,
                }}
              >
                {domain.tag}
              </div>
              <h3
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  marginBottom: 16,
                  color: "#fff",
                }}
              >
                {domain.title}
              </h3>
              <ul style={{ listStyle: "none" }}>
                {domain.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: "0.85rem",
                      color: "rgba(255,255,255,.6)",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ color: domain.color, fontSize: "1rem", marginTop: 2 }}>
                      ›
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 核心业务闭环 — matches .arch-loop */}
        <div
          data-testid="arch-loop"
          className="fade-in"
          style={{
            border: "1px solid rgba(255,255,255,.094)",
            background: "rgba(255,255,255,.05)",
            borderRadius: 18,
            padding: "36px 28px",
            textAlign: "center",
          }}
        >
          <h3
            style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 24, color: "#fff" }}
          >
            核心业务闭环
          </h3>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {LOOP_STEPS.map((step, i) => (
              <div
                key={step.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    border: `1px solid ${step.color}66`,
                    borderRadius: 10,
                    padding: "8px 18px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    background: `${step.color}1A`,
                    color: step.color,
                  }}
                >
                  {step.label}
                </div>
                {i < LOOP_STEPS.length - 1 && (
                  <span
                    style={{
                      color: "rgba(255,255,255,.25)",
                      fontSize: "0.9rem",
                      userSelect: "none",
                    }}
                  >
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
          <p
            style={{
              marginTop: 20,
              fontSize: "0.8rem",
              color: "rgba(255,255,255,.25)",
            }}
          >
            每步产生审计事件 &middot; 每次执行绑定 workflowRunId &middot;
            每个外部动作可追溯 receipt
          </p>
        </div>
      </div>

      <style>{`
        .fade-in { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
        .fade-in.visible { opacity: 1; transform: translateY(0); }
      `}</style>
    </section>
  )
}
