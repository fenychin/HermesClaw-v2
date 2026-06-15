"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/config/navigation";

interface SidebarNavItemProps {
  item: NavItem;
  /** 侧边栏是否折叠（仅显示图标） */
  collapsed?: boolean;
}

/** 侧边栏单个导航项：根据当前路径高亮 active 态（支持二级路由） */
export const SidebarNavItem = memo(function SidebarNavItem({
  item,
  collapsed = false,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const Icon = item.icon;
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      title={item.description ?? item.label}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all duration-150",
        "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        isActive && "bg-accent text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span
        className={cn(
          "truncate overflow-hidden whitespace-nowrap transition-all duration-150 ease-in-out inline-block",
          collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
        )}
      >
        {item.label}
      </span>
    </Link>
  );
});
