/**
 * @deprecated 自 v0.12.13 起，契约层已迁移至独立 packages：
 *   - `@hermesclaw/event-contracts`：跨域事件契约（TaskEnvelope / ExecutionEvent / ActionReceipt /
 *     ExecutionSummary / CapabilityRegistration / ConnectorLease / HumanApprovalCheckpoint /
 *     BoundaryDecision / TaskPayloads）
 *   - `@hermesclaw/harness-schema`：Harness Runtime 对象（HarnessBundle 7 件套 / HarnessProposal /
 *     EvolutionProposal / EvaluationReport / IndustryManifest）
 *
 * 本文件保留为过渡兼容层，让既有 `@/contracts` import 路径继续可用。
 * **新代码请直接 import 自上述 package**，本文件将在 v0.13+ 仓库正式拆分 monorepo
 * （CLAUDE.md §3.3）时移除。
 */
export * from "@hermesclaw/event-contracts"
export * from "@hermesclaw/harness-schema"
