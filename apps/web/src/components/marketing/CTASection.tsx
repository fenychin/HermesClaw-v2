"use client"

import { useState, type FormEvent } from "react"

const STATS = [
  { value: "4+", label: "行业 Pack" },
  { value: "20+", label: "连接器" },
  { value: "100%", label: "审计字段覆盖" },
  { value: "V2.20", label: "当前版本" },
] as const

export function CTASection() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setStatus("loading")
    setErrorMsg("")

    try {
      const res = await fetch("/api/marketing/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setStatus("success")
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "提交失败，请稍后重试",
      )
      setStatus("error")
    }
  }

  return (
    <section
      id="cta"
      data-testid="cta-section"
      style={{
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
        padding: "128px 24px",
      }}
    >
      {/* 光晕 — matches .cta-glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 900,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(245,166,35,.09) 0%, transparent 70%)",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 700,
          margin: "0 auto",
        }}
      >
        {/* 统计栏 — matches .stats-bar */}
        <div
          data-testid="stats-bar"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "12px 48px",
            marginBottom: 48,
          }}
        >
          {STATS.map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  fontSize: "2.5rem",
                  fontWeight: 900,
                  color: "#F5A623",
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,.25)",
                  marginTop: 4,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* 标题 — matches .cta-title */}
        <h2
          style={{
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: 900,
            lineHeight: 1.15,
            marginBottom: 16,
          }}
        >
          现在就建立你的
          <br />
          <span style={{ color: "#F5A623" }}>AI 数字员工系统</span>
        </h2>

        {/* 副标题 — matches .cta-sub */}
        <p
          style={{
            fontSize: "1.1rem",
            color: "rgba(255,255,255,.6)",
            marginBottom: 40,
          }}
        >
          申请企业内测，获得专属架构咨询 + Industry Pack 配置支持。
        </p>

        {/* 表单 — matches .cta-form (visible when not success) */}
        {status !== "success" && (
          <form
            data-testid="cta-form"
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
              marginBottom: 0,
            }}
          >
            <input
              type="email"
              required
              data-testid="cta-email-input"
              placeholder="输入企业邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                flex: 1,
                minWidth: 260,
                maxWidth: 380,
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.18)",
                borderRadius: 14,
                padding: "16px 20px",
                fontSize: "1rem",
                color: "#fff",
                outline: "none",
                transition: "border-color .25s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(245,166,35,.5)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,.18)"
              }}
            />
            <button
              type="submit"
              data-testid="cta-submit-btn"
              disabled={status === "loading"}
              style={{
                background: "#F5A623",
                color: "#000",
                fontWeight: 800,
                padding: "16px 32px",
                borderRadius: 14,
                fontSize: "1rem",
                transition: "background .2s, transform .15s, opacity .2s",
                whiteSpace: "nowrap",
                cursor: status === "loading" ? "not-allowed" : "pointer",
                opacity: status === "loading" ? 0.55 : 1,
                border: "none",
              }}
              onMouseEnter={(e) => {
                if (status !== "loading") {
                  e.currentTarget.style.background = "#e8961a"
                  e.currentTarget.style.transform = "scale(1.04)"
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#F5A623"
                e.currentTarget.style.transform = "scale(1)"
              }}
            >
              {status === "loading" ? "提交中..." : "申请内测 →"}
            </button>
          </form>
        )}

        {/* 成功 — matches .cta-success */}
        {status === "success" && (
          <div
            data-testid="cta-success"
            style={{
              border: "1px solid rgba(16,185,129,.35)",
              background: "rgba(16,185,129,.12)",
              borderRadius: 16,
              padding: "24px 32px",
              color: "#6ee7b7",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            ✅ 申请成功！我们会在 24 小时内与您联系。
          </div>
        )}

        {/* 错误 — matches .cta-error */}
        {status === "error" && (
          <p
            data-testid="cta-error"
            style={{
              marginTop: 12,
              fontSize: "0.875rem",
              color: "#f87171",
            }}
          >
            {errorMsg}
          </p>
        )}

        {/* 底部说明 — matches .cta-note */}
        <p
          data-testid="cta-note"
          style={{
            marginTop: 20,
            fontSize: "0.8rem",
            color: "rgba(255,255,255,.25)",
          }}
        >
          所有申请经人工审核后接入 &middot; 数据受 AuditLog 保护 &middot;
          不用于任何第三方营销
        </p>
      </div>
    </section>
  )
}
