/** GET /api/brain/memory — 组织级记忆（Hermes 记忆层）*/
export async function getOrgMemory(workspaceId: string): Promise<any> {
  const res = await fetch(`/api/brain/memory?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch org memory");
  return res.json();
}

/** GET /api/brain/kpi — Industry KPI Schema 数据（Industry Pack 层）*/
export async function getKPIData(workspaceId: string): Promise<any> {
  const res = await fetch(`/api/brain/kpi?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch KPI data");
  return res.json();
}

/** GET /api/brain/knowledge — Knowledge Pack 内容（Industry Pack 层）*/
export async function getKnowledgePacks(workspaceId: string): Promise<any> {
  const res = await fetch(`/api/brain/knowledge?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch knowledge packs");
  return res.json();
}
