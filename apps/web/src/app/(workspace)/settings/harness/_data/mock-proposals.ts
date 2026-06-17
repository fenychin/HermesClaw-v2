import type { HarnessProposal } from "@/types";

/**
 * Harness 升级提案 mock 数据
 * —— 覆盖 pending / approved / rejected 状态与 L1-L3 授权等级
 *    严格遵循 AGENTS.md §4.7 L4 绝对禁止自动逻辑
 */
export const mockProposals: HarnessProposal[] = [
  // ---- 待审批：高风险 L3 ----
  {
    id: "hep-001",
    proposalId: "HEP-1717840000",
    triggeredBy: "auto",
    triggerReason: "连续 3 次询盘评分任务失败（同类型任务）",
    problemStatement:
      "询盘评分 Agent 在过去 24 小时内连续 3 次对新询盘评分失败，错误率升至 42%。根因分析显示上下文供给链中的行业分类知识库版本过旧（v2.1），缺少 2026 年新增的「跨境电商独立站」类目。",
    evidence: [
      "错误日志：inquiry-score-agent ERROR 2026-06-08T10:23:00 — KeyError: category 'cross-border-dts' not found",
      "错误日志：inquiry-score-agent ERROR 2026-06-08T12:15:00 — 同上",
      "错误日志：inquiry-score-agent ERROR 2026-06-08T14:02:00 — 同上",
      "知识库版本检查：knowledge-base/v2.1 缺少 cross-border-dts 类目定义",
    ],
    proposedChange: {
      targetComponent: "上下文供给",
      description:
        "将行业分类知识库从 v2.1 升级至 v3.0，新增「跨境电商独立站」「社交电商」「海外仓直发」三个类目定义，并重新生成向量索引。此变更影响所有依赖行业分类的下游 Agent。",
      riskLevel: "high",
      automationLevel: "L3",
    },
    requiresHumanApproval: true,
    estimatedImpact:
      "修复后询盘评分成功率预计从 58% 恢复至 95% 以上，影响 3 个下游 Agent 的分类准确度。",
    affectedAgents: ["询盘评分 Agent", "客户画像 Agent", "市场洞察 Agent"],
    rollbackPlan:
      "回退知识库至 v2.1 版本，重建向量索引。预计回滚耗时 5 分钟，期间询盘评分服务暂停。",
    status: "pending",
    createdAt: "2026-06-08T14:30:00Z",
  },

  // ---- 待审批：中风险 L2 ----
  {
    id: "hep-002",
    proposalId: "HEP-1717850000",
    triggeredBy: "manual",
    triggerReason: "人工触发：/harness evaluate",
    problemStatement:
      "邮件回复起草 Agent 的工具调用成功率降至 78%，低于 85% 阈值。SMTP 连接器超时频率上升，主因为连接池配置不足。",
    evidence: [
      "工具调用统计：SMTP 连接器 72 小时成功率 78.3%（阈值 85%）",
      "超时日志：smtp-connector TIMEOUT 2026-06-07 共 12 次",
      "连接池监控：peak_connections=48 / max_pool_size=50",
    ],
    proposedChange: {
      targetComponent: "工具接入",
      description:
        "将 SMTP 连接器的连接池上限从 50 提升至 100，超时时间从 5s 调整为 8s，并启用连接预热。",
      riskLevel: "medium",
      automationLevel: "L2",
    },
    requiresHumanApproval: true,
    estimatedImpact:
      "SMTP 连接器成功率预计从 78% 提升至 96%，邮件起草 Agent 端到端延迟降低约 30%。",
    affectedAgents: ["邮件回复 Agent", "开发信 Agent"],
    rollbackPlan:
      "恢复连接池参数至原值（max=50, timeout=5s），重启连接器服务。",
    status: "pending",
    createdAt: "2026-06-08T09:15:00Z",
  },

  // ---- 已通过：低风险 L1 ----
  {
    id: "hep-003",
    proposalId: "HEP-1717760000",
    triggeredBy: "auto",
    triggerReason: "新工具接入后首次全量运行完成",
    problemStatement:
      "CRM 连接器首次全量同步完成后，反馈闭环未配置结构化存储，Agent 执行结果仅写入文本日志，不满足 AGENTS.md §4.4 反馈数据结构化存储要求。",
    evidence: [
      "审计日志：crm-connector 全量同步 2026-06-06T08:00 完成",
      "闭环检查：feedback_storage_type=text_log（应为 structured_json）",
    ],
    proposedChange: {
      targetComponent: "反馈闭环",
      description:
        "为 CRM 连接器新增结构化反馈存储管道，同步结果以 JSON 格式写入 feedback-store，并支持 Level 2 评估层查询。",
      riskLevel: "low",
      automationLevel: "L1",
    },
    requiresHumanApproval: true,
    estimatedImpact:
      "CRM 同步结果可被 Level 2 评估层自动分析，消除「盲飞执行」隐患。",
    affectedAgents: ["CRM 同步 Agent"],
    rollbackPlan: "移除结构化管道配置，回退至文本日志模式。",
    status: "approved",
    createdAt: "2026-06-06T10:00:00Z",
    reviewedAt: "2026-06-06T11:30:00Z",
    reviewedBy: "管理员",
  },

  // ---- 已通过：中风险 L2 ----
  {
    id: "hep-004",
    proposalId: "HEP-1717780000",
    triggeredBy: "auto",
    triggerReason: "上下文供给缺口导致任务中断超过 2 次/天",
    problemStatement:
      "客户画像 Agent 在生成画像时频繁因缺少产品目录上下文而中断，日均中断 3.2 次。产品目录知识库未纳入该 Agent 的上下文供给链。",
    evidence: [
      "中断日志：profile-agent CONTEXT_GAP 2026-06-05 共 4 次",
      "中断日志：profile-agent CONTEXT_GAP 2026-06-06 共 3 次",
      "上下文审计：product-catalog 未在 profile-agent 的 context_sources 中注册",
    ],
    proposedChange: {
      targetComponent: "上下文供给",
      description:
        "将产品目录知识库（v1.2）注册到客户画像 Agent 的上下文供给链中，配置自动同步策略（每 6 小时增量更新）。",
      riskLevel: "medium",
      automationLevel: "L2",
    },
    requiresHumanApproval: true,
    estimatedImpact:
      "客户画像生成中断率从日均 3.2 次降至 0，画像完整度提升约 25%。",
    affectedAgents: ["客户画像 Agent"],
    rollbackPlan:
      "从 profile-agent 的 context_sources 中移除 product-catalog 注册。",
    status: "approved",
    createdAt: "2026-06-06T16:00:00Z",
    reviewedAt: "2026-06-07T09:00:00Z",
    reviewedBy: "管理员",
  },

  // ---- 已驳回：高风险 L3 ----
  {
    id: "hep-005",
    proposalId: "HEP-1717800000",
    triggeredBy: "auto",
    triggerReason: "连续 3 次任务失败（同类型任务）",
    problemStatement:
      "报价单生成 Agent 连续 3 次生成的报价金额偏差超过 15%，置信度降至 0.52。系统建议扩大其任务边界，允许直接读取 ERP 实时库存与成本数据。",
    evidence: [
      "偏差日志：quotation-agent PRICE_DEVIATION 2026-06-07 超 15% 共 3 次",
      "置信度记录：avg_confidence=0.52（阈值 0.7）",
      "根因：报价依赖的成本数据为缓存副本，延迟 24 小时",
    ],
    proposedChange: {
      targetComponent: "任务边界",
      description:
        "扩大报价单 Agent 的 can_do 边界，允许直接读取 ERP 数据库的实时库存与成本表。",
      riskLevel: "high",
      automationLevel: "L3",
    },
    requiresHumanApproval: true,
    estimatedImpact:
      "报价金额偏差率预计从 15% 降至 3% 以内，置信度提升至 0.85+。",
    affectedAgents: ["报价单 Agent", "合同 Agent"],
    rollbackPlan:
      "收回 ERP 直读权限，恢复缓存副本模式。需同步通知 DBA 撤回只读账号。",
    status: "rejected",
    createdAt: "2026-06-07T08:00:00Z",
    reviewedAt: "2026-06-07T14:00:00Z",
    reviewedBy: "管理员",
  },

  // ---- 待审批：L4 绝对禁止自动（PRD §10.9 L4 测试用例）----
  {
    id: "hep-006",
    proposalId: "HEP-1717820000",
    triggeredBy: "auto",
    triggerReason: "连续 3 次高风险任务失败 + 触发 L2 评估",
    problemStatement:
      "财务结算 Agent 在执行跨境支付对账时连续 3 次超时失败，系统自动评估建议将 Agent 的任务边界扩展至可直接调用银行支付接口发起退款。该操作涉及外部资金调度，属于 AGENTS.md §4.5 高危操作（永远需要人工审批），且因涉及资金安全被标记为 L4。",
    evidence: [
      "失败日志：payment-agent TIMEOUT 2026-06-09 共 3 次",
      "审计快照：跨境对账成功率降至 67%（阈值 85%）",
      "风险评估：直接退款操作涉及资金流水，任何自动化均不可接受",
    ],
    proposedChange: {
      targetComponent: "安全护栏",
      description:
        "授予财务结算 Agent 直接调用银行支付接口发起退款的能力，绕过现有的人工复核环节。",
      riskLevel: "high",
      automationLevel: "L4",
    },
    requiresHumanApproval: true,
    estimatedImpact:
      "若获批：对账-退款端到端延迟从 2 小时降至 5 分钟。但该变更为 L4 级别，禁止系统自动审批。",
    affectedAgents: ["财务结算 Agent", "银行支付连接器"],
    rollbackPlan:
      "立即撤回银行退款 API 权限，恢复人工复核流程。回滚窗口 ≤ 1 分钟，无数据损失风险。",
    status: "pending",
    createdAt: "2026-06-09T16:00:00Z",
  },
];
