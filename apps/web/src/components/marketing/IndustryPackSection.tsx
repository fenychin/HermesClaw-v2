"use client"

import { useState, useEffect, useRef } from "react"

const TABS = [
  {
    id: "foreign-trade",
    label: "外贸行业包",
    icon: "🌐",
    color: "#F5A623",
    agents: ["询盘跟进员", "报价生成员", "跟单协调员", "客户关系员"],
    workflows: ["询盘自动分级", "报价审批流", "订单跟踪 SOP", "客户复盘报告"],
    connectors: ["WhatsApp", "Gmail", "Alibaba Trade", "SAP ERP"],
    kpis: ["询盘转化率", "报价响应时效", "订单周期", "客户满意度"],
  },
  {
    id: "medical",
    label: "医疗行业包",
    icon: "🏥",
    color: "#34D399",
    agents: ["预约管理员", "病历助理", "随访跟进员", "费用核算员"],
    workflows: ["预约→就诊→随访", "病历生成审核", "医保核销流程"],
    connectors: ["HIS 系统", "微信", "钉钉", "电子病历"],
    kpis: ["预约履约率", "随访覆盖率", "平均就诊时长", "医保结算准确率"],
  },
  {
    id: "education",
    label: "教育行业包",
    icon: "🎓",
    color: "#60A5FA",
    agents: ["招生咨询员", "学习顾问", "作业批改员", "家校沟通员"],
    workflows: ["招生线索培育", "课程匹配推荐", "作业批改流", "家长周报生成"],
    connectors: ["企业微信", "腾讯课堂", "学籍系统", "支付宝"],
    kpis: ["线索转化率", "课程完成率", "家长满意度", "续费率"],
  },
  {
    id: "finance",
    label: "金融行业包",
    icon: "📈",
    color: "#A78BFA",
    agents: ["风控审核员", "客户经理 AI", "合规审查员", "报表生成员"],
    workflows: ["贷款申请审核", "KYC 合规流程", "风险预警处置", "月度报表生成"],
    connectors: ["银行核心系统", "征信平台", "Bloomberg", "钉钉审批"],
    kpis: ["审核通过率", "合规覆盖率", "坏账率", "客户 AUM"],
  },
] as const

export function IndustryPackSection() {
  const [activeTab, setActiveTab] = useState<string>("foreign-trade")

  const pack = TABS.find((t) => t.id === activeTab)!

  const sectionRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

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

  // 切换 tab 时重置 detail fade-in 并立即触发
  useEffect(() => {
    if (detailRef.current) {
      detailRef.current.classList.remove("visible")
      // force reflow then add visible back for the fade-in animation
      void detailRef.current.offsetWidth
      detailRef.current.classList.add("visible")
    }
  }, [activeTab])

  return (
    <section
      ref={sectionRef}
      id="industry"
      data-testid="industry-pack-section"
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
            Industry Pack 行业插件
          </h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,.6)" }}>
            可装载、可停用、可升级、可回滚的行业能力包。
          </p>
        </div>

        {/* Tab buttons — matches .pack-tabs */}
        <div
          data-testid="industry-pack-tabs"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 12,
            marginBottom: 32,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                data-testid={`industry-tab-${tab.id}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  border: `1px solid ${isActive ? `${tab.color}96` : "rgba(255,255,255,.12)"}`,
                  borderRadius: 12,
                  padding: "10px 22px",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: isActive ? tab.color : "rgba(255,255,255,.5)",
                  background: isActive ? `${tab.color}22` : "transparent",
                  transition: "all .25s",
                  cursor: "pointer",
                }}
              >
                {tab.icon} {tab.label}
              </button>
            )
          })}
        </div>

        {/* Detail panel — matches .pack-detail */}
        <div
          ref={detailRef}
          data-testid="industry-pack-detail"
          className="fade-in"
          style={{
            border: `1px solid ${pack.color}66`,
            borderRadius: 20,
            padding: 36,
            background: `${pack.color}14`,
            display: "grid",
            gap: 24,
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            transition: "all .3s",
          }}
        >
          {/* Roles — matches .pack-col-title + .pack-item */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: pack.color,
                marginBottom: 12,
              }}
            >
              <span>👤</span> 数字员工角色
            </div>
            {pack.agents.map((a) => (
              <div
                key={a}
                style={{
                  border: "1px solid rgba(255,255,255,.094)",
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: "0.85rem",
                  color: "rgba(255,255,255,.6)",
                  marginBottom: 8,
                }}
              >
                {a}
              </div>
            ))}
          </div>

          {/* Workflows */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: pack.color,
                marginBottom: 12,
              }}
            >
              <span>⚙️</span> 工作流模板
            </div>
            {pack.workflows.map((w) => (
              <div
                key={w}
                style={{
                  border: "1px solid rgba(255,255,255,.094)",
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: "0.85rem",
                  color: "rgba(255,255,255,.6)",
                  marginBottom: 8,
                }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Connectors */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: pack.color,
                marginBottom: 12,
              }}
            >
              <span>🔌</span> 连接器
            </div>
            {pack.connectors.map((c) => (
              <div
                key={c}
                style={{
                  border: "1px solid rgba(255,255,255,.094)",
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: "0.85rem",
                  color: "rgba(255,255,255,.6)",
                  marginBottom: 8,
                }}
              >
                {c}
              </div>
            ))}
          </div>

          {/* KPIs */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: pack.color,
                marginBottom: 12,
              }}
            >
              <span>📊</span> KPI 指标
            </div>
            {pack.kpis.map((k) => (
              <div
                key={k}
                style={{
                  border: "1px solid rgba(255,255,255,.094)",
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: "0.85rem",
                  color: "rgba(255,255,255,.6)",
                  marginBottom: 8,
                }}
              >
                {k}
              </div>
            ))}
          </div>
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: "0.8rem",
            color: "rgba(255,255,255,.25)",
          }}
        >
          Industry Pack 不会侵入 Hermes / OpenClaw 核心——行业逻辑完全收敛在插件层
        </p>
      </div>

      <style>{`
        .fade-in { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
        .fade-in.visible { opacity: 1; transform: translateY(0); }
      `}</style>
    </section>
  )
}
