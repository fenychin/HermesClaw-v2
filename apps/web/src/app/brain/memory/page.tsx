"use client";

import { MemoryView } from "../_components/memory-view";

interface MemoryPageProps {
  searchParams: { tab?: string };
}

export default function MemoryPage({ searchParams }: MemoryPageProps) {
  const initialTab = (searchParams?.tab === "short" || searchParams?.tab === "mid" || searchParams?.tab === "long")
    ? (searchParams.tab as "short" | "mid" | "long")
    : undefined;

  return <MemoryView initialTab={initialTab} />;
}
