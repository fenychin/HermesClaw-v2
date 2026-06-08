"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * 页面切换过渡动画组件
 * —— 淡入 + 轻微上移，提供柔和的页面切换体验
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
