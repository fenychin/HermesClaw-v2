"use client";

import { memo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, ChevronDown } from "lucide-react";
import { knowledgeNav } from "@/config/navigation";

interface SidebarKnowledgeProps {
  collapsed?: boolean;
  isActive?: boolean;
}

export const SidebarKnowledge = memo(function SidebarKnowledge({
  collapsed = false,
  isActive = false,
}: SidebarKnowledgeProps) {
  const pathname = usePathname();
  const router = useRouter();

  // 是否展开子菜单
  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive]);

  const effectiveExpanded = collapsed ? false : expanded;

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const prewarm = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  return (
    <div className="w-full">
      {/* 触发行 */}
      {collapsed ? (
        <Link
          href="/files"
          className={cn(
            "w-full h-10 flex items-center justify-center rounded-xl transition-all duration-150",
            isActive
              ? "bg-accent text-foreground font-semibold"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          title="资料库"
          onPointerEnter={() => prewarm("/files")}
          onFocus={() => prewarm("/files")}
        >
          <FileText className={cn("size-[18px]", isActive && "text-[#6D5EF9]")} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={toggleExpanded}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all duration-150 select-none cursor-pointer",
            isActive
              ? "bg-accent text-foreground font-semibold"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          title="企业资料库"
        >
          <FileText className={cn("size-[18px] shrink-0", isActive && "text-[#6D5EF9]")} />
          <span className="truncate flex-1 text-left">资料库</span>
          <span
            className={cn(
              "shrink-0 flex items-center justify-center text-muted-foreground/60 transition-transform duration-150 ease-out",
              effectiveExpanded && "rotate-180",
            )}
          >
            <ChevronDown className="size-3.5" />
          </span>
        </button>
      )}

      {/* 资料库二级子导航 */}
      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          effectiveExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          <div className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-border/40 pl-2">
            {knowledgeNav.map((child) => {
              const ChildIcon = child.icon;
              const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onPointerEnter={() => prewarm(child.href)}
                  onFocus={() => prewarm(child.href)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors",
                    isChildActive
                      ? "bg-accent/80 text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  )}
                >
                  <ChildIcon
                    className={cn(
                      "size-3.5 shrink-0",
                      isChildActive ? "text-[#6D5EF9]" : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate flex-1 text-left">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
