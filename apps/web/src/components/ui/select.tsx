"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon } from "lucide-react"

// ============================================================
// Select — 基于 @base-ui/react/select 的 shadcn 风格封装
// ============================================================

function Select({
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root<string, false>>) {
  return (
    <SelectPrimitive.Root<string, false> {...props}>
      {children}
    </SelectPrimitive.Root>
  )
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs",
        "hover:bg-accent/50 hover:border-border/80",
        "data-[popup-open]:border-ring data-[popup-open]:ring-2 data-[popup-open]:ring-ring/20",
        "transition-colors outline-none",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDownIcon className="size-3.5 text-muted-foreground shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectValue({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      className={cn("text-xs text-foreground truncate", className)}
      {...props}
    >
      {children}
    </SelectPrimitive.Value>
  )
}

function SelectContent({
  className,
  children,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> & {
  align?: "start" | "center" | "end"
  sideOffset?: number
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        className="z-50"
      >
        <SelectPrimitive.Popup
          className={cn(
            "min-w-[var(--anchor-width)] bg-popover border border-border rounded-lg p-1 shadow-lg",
            "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.List>) {
  return (
    <SelectPrimitive.List
      className={cn("flex flex-col gap-0.5 max-h-60 overflow-auto", className)}
      {...props}
    >
      {children}
    </SelectPrimitive.List>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-2 pr-7 text-xs text-foreground outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-foreground",
        "transition-colors",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute right-1.5 flex items-center">
        <CheckIcon className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectList,
  SelectItem,
}
