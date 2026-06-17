"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { brainNav } from "@/config/navigation";

/** 智慧大脑二级导航：横向标签栏 */
export function BrainSubnav() {
  const pathname = usePathname();

  return (
    <div className="border-border flex flex-wrap gap-1 border-b pb-3">
      {brainNav.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              isActive && "bg-accent text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
