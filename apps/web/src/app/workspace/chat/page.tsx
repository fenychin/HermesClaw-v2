"use client";

import { useEffect } from "react";
import { useWorkspaceMode } from "../workspace-provider";
import NewTopicPageClient from "./page-client";

export default function NewTopicPage() {
  const { setMode } = useWorkspaceMode();

  useEffect(() => {
    setMode("session");
  }, [setMode]);

  return <NewTopicPageClient />;
}
