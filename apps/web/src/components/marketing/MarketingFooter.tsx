"use client"

import type { CSSProperties } from "react"

export function MarketingFooter() {
  return (
    <footer
      data-testid="marketing-footer"
      style={{
        borderTop: "1px solid rgba(255,255,255,.094)",
        background: "#0A0A0F",
        padding: "64px 24px 32px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gap: 32,
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
          }}
          className="footer-grid"
        >
          {/* 品牌描述 */}
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 10 }}>
              <span style={{ color: "#F5A623" }}>⚡</span> HermesClaw
            </div>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,.25)", lineHeight: 1.6 }}>
              面向中小企业的 AI 数字员工操作系统。<br />
              三域架构，真实闭环，可治理可回滚。
            </p>
          </div>

          {/* 产品链接 */}
          <div className="footer-col">
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.25)",
                marginBottom: 14,
              }}
            >
              产品
            </div>
            <a href="#architecture" style={footerLink} onMouseEnter={linkHover} onMouseLeave={linkRest}>
              三域架构
            </a>
            <a href="#industry" style={footerLink} onMouseEnter={linkHover} onMouseLeave={linkRest}>
              行业插件
            </a>
            <a href="#governance" style={footerLink} onMouseEnter={linkHover} onMouseLeave={linkRest}>
              治理中心
            </a>
          </div>

          {/* 开发者链接 */}
          <div className="footer-col">
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.25)",
                marginBottom: 14,
              }}
            >
              开发者
            </div>
            <a href="/docs" style={footerLink} onMouseEnter={linkHover} onMouseLeave={linkRest}>
              文档
            </a>
            <a href="/api" style={footerLink} onMouseEnter={linkHover} onMouseLeave={linkRest}>
              API 参考
            </a>
            <a
              href="https://github.com/fenychin/HermesClaw-v2"
              target="_blank"
              rel="noopener"
              style={footerLink}
              onMouseEnter={linkHover}
              onMouseLeave={linkRest}
            >
              GitHub
            </a>
          </div>

          {/* 法律链接 */}
          <div className="footer-col">
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.25)",
                marginBottom: 14,
              }}
            >
              法律
            </div>
            <a href="/privacy" style={footerLink} onMouseEnter={linkHover} onMouseLeave={linkRest}>
              隐私政策
            </a>
            <a href="/terms" style={footerLink} onMouseEnter={linkHover} onMouseLeave={linkRest}>
              服务条款
            </a>
          </div>
        </div>

        {/* 底部版权 */}
        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,.094)",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "rgba(255,255,255,.25)",
          }}
        >
          &copy; 2026 HermesClaw &middot; 版本 V2.20.11-beta
        </div>
      </div>

      {/* Responsive grid via <style> — only way without CSS-in-JS in SSR-safe manner */}
      <style>{`
        @media (max-width: 768px) {
          [data-testid="marketing-footer"] .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </footer>
  )
}

const footerLink: CSSProperties = {
  display: "block",
  fontSize: "0.875rem",
  color: "rgba(255,255,255,.55)",
  marginBottom: 10,
  textDecoration: "none",
  transition: "color .2s",
}

function linkHover(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.color = "#fff"
}
function linkRest(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.color = "rgba(255,255,255,.55)"
}
