"use client";

import { use } from "react";
import { MemoryView } from "../_components/memory-view";

interface MemoryPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default function MemoryPage({ searchParams }: MemoryPageProps) {
  const resolvedSearchParams = use(searchParams);
  const initialTab = (resolvedSearchParams?.tab === "short" || resolvedSearchParams?.tab === "mid" || resolvedSearchParams?.tab === "long")
    ? (resolvedSearchParams.tab as "short" | "mid" | "long")
    : undefined;

  return <MemoryView initialTab={initialTab} />;
}
