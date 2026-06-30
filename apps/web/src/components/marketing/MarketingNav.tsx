"use client"

import { useState } from "react"

const NAV_LINKS = [
  { label: "架构", href: "#architecture" },
  { label: "行业插件", href: "#industry" },
  { label: "治理", href: "#governance" },
] as const

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav
      data-testid="marketing-nav"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,.094)",
        background: "rgba(10,10,15,.8)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
        }}
      >
        {/* Logo */}
        <a
          href="/"
          data-testid="marketing-nav-logo"
          style={{
            fontSize: "1.2rem",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#FFFFFF",
            textDecoration: "none",
          }}
        >
          <span style={{ color: "#F5A623", fontSize: "1.4rem" }}>⚡</span>
          {" "}HermesClaw
        </a>

        {/* Desktop nav links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
          }}
          className="nav-links-desktop"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontSize: "0.875rem",
                color: "rgba(255,255,255,.6)",
                textDecoration: "none",
                transition: "color .2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "rgba(255,255,255,.6)")
              }
            >
              {link.label}
            </a>
          ))}
          <a
            href="/sign-in"
            style={{
              fontSize: "0.875rem",
              color: "rgba(255,255,255,.6)",
              textDecoration: "none",
              transition: "color .2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,.6)")
            }
          >
            登录
          </a>
          <a
            href="#cta"
            data-testid="marketing-nav-cta"
            style={{
              background: "#F5A623",
              color: "#000",
              fontWeight: 700,
              padding: "8px 20px",
              borderRadius: 10,
              fontSize: "0.875rem",
              textDecoration: "none",
              transition: "background .2s, transform .15s",
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
            申请内测
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="菜单"
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            display: "none",
            fontSize: "1.5rem",
            color: "#fff",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
          className="nav-mobile-toggle"
        >
          ☰
        </button>

        <style jsx>{`
          @media (max-width: 768px) {
            .nav-links-desktop { display: none !important; }
            .nav-mobile-toggle { display: block !important; }
          }
        `}</style>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          data-testid="marketing-nav-mobile"
          style={{
            padding: "12px 24px 16px",
            borderTop: "1px solid rgba(255,255,255,.094)",
          }}
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "block",
                padding: "10px 0",
                fontSize: "0.9rem",
                color: "rgba(255,255,255,.6)",
                textDecoration: "none",
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#cta"
            onClick={() => setMobileOpen(false)}
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 12,
              padding: 12,
              background: "#F5A623",
              color: "#000",
              fontWeight: 700,
              borderRadius: 10,
              fontSize: "0.875rem",
              textDecoration: "none",
            }}
          >
            申请内测
          </a>
        </div>
      )}
    </nav>
  )
}
