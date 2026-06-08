"use client";

import { Toaster as SonnerToaster } from "sonner";

export { toast } from "sonner";

/**
 * shadcn/ui 风格的 Sonner Toaster 封装
 * —— 深色主题 + 丰富颜色 + 关闭按钮
 */
export function Toaster({ ...props }: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "!bg-card !text-foreground !border-border !shadow-lg",
          description: "!text-muted-foreground",
          actionButton:
            "!bg-brand !text-white hover:!bg-brand/90",
          cancelButton:
            "!bg-accent !text-muted-foreground hover:!bg-accent/80",
          closeButton:
            "!bg-accent !text-muted-foreground hover:!bg-accent/80 !border-border",
        },
      }}
      {...props}
    />
  );
}
