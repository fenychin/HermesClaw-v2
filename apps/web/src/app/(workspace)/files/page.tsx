"use client";

import { PageTransition } from "@/components/common/PageTransition";
import { FilesPageClient } from "@/components/pages/files/files-page-client";

/** 文件：企业内容供给链（PRD 10.7） */
export default function FilesPage() {
  return (
    <PageTransition>
      <FilesPageClient />
    </PageTransition>
  );
}
