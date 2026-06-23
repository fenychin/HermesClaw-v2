# 架构评审验证报告 — 审计与回滚闭环

> **专项：** V2 门户升级专项 — Phase 6 审计与回滚验证  
> **日期：** ____年____月____日  
> **评审人：** ________  
> **工作空间：** ________

---

## 1. 验证范围

本次验证覆盖 HermesClaw v3.x 的审计、灰度、回滚全链路，确保：

- 每次变更都可解释（有审计记录）
- 每次变更都有证据链（四层日志可串联）
- 每次变更都可回滚（基于 snapshot/version）

---

## 2. 审计事件矩阵

| 事件类型 | 审计动作 | 覆盖状态 | 审计记录位置 | 备注 |
|----------|----------|----------|-------------|------|
| `task.dispatch` | ✅ | 已覆盖 | AuditLog | orchestrator / execution-bus |
| `sandbox.submit` | ✅ | 已覆盖 | AuditLog | industry-intel-service |
| `connector.execute` | ✅ | 已覆盖 | AuditLog + Receipt Store | http/openclaw/email connectors |
| `proposal.create` | ✅ | 已覆盖 | AuditLog (预记录模式) | harness-proposal-service |
| `proposal.approve` | ✅ | 已覆盖 | AuditLog | harness-proposal-service |
| `proposal.reject` | ✅ | 已覆盖 | AuditLog | harness-proposal-service |
| `proposal.rollback` | ✅ | 已覆盖 | AuditLog | rollback.ts |
| `industry.pack.install` | ✅ | Phase 6 补齐 | AuditLog (预记录模式) | 含兼容性快照 |
| `industry.pack.activate` | ✅ | Phase 6 补齐 | AuditLog (预记录模式) | 含版本信息 |
| `industry.pack.rollback` | ✅ | Phase 6 补齐 | AuditLog (预记录模式) | 含迁移规则 |
| `automation.level.change` | ✅ | Phase 6 补齐 | AuditLog (预记录模式) | 含 previousLevel/newLevel |
| `canary.started` | ✅ | 已覆盖 | AuditLog | canary.ts |
| `canary.promoted` | ✅ | 已覆盖 | AuditLog | canary.ts |
| `canary.aborted` | ✅ | 已覆盖 | AuditLog | canary.ts |

---

## 3. 四层日志证据链

### 3.1 架构

```
L1 AuditLog    — 治理真相源（Hermes）
    ↓ actor/action/targetId 关联
L2 AgentLog    — 执行行为与风险（Hermes 评估）
    ↓ agentId/taskName 关联
L3 WorkflowRun — 结构化运行记录（OpenClaw Runtime）
    ↓ workflowRunId 关联
L4 ReceiptStore — 外部动作回执（OpenClaw Runtime）
```

### 3.2 可串行性

通过 `workflowRunId` 可串联四层：

```sql
-- L1 审计
SELECT * FROM AuditLog WHERE targetId = :workflowRunId;

-- L2 Agent 行为
SELECT * FROM AgentLog WHERE workspaceId = :ws AND detail LIKE :workflowRunId;

-- L3 运行记录
SELECT * FROM WorkflowRun WHERE id = :workflowRunId;

-- L4 回执
SELECT * FROM ActionReceipt WHERE workflowRunId = :workflowRunId;
```

### 3.3 验证结果

- [ ] 四层日志均可通过 `workflowRunId` 串联
- [ ] 所有 `connector.execute` 审计有对应 `ActionReceipt`
- [ ] 高危写操作回执包含 `compensationStrategy`
- [ ] 无回执的写操作已被 `isHighRiskWithoutReceipt()` 标记

---

## 4. 灰度与回滚状态机

### 4.1 Proposal 生命周期

```
draft → pending → approved → canary → active → rolled_back
                 ↘ rejected          ↘ rolled_back
```

### 4.2 Canary 健康评估

```
观察窗口内:
  errorRate > 20% → Early Abort → 自动回滚
  window 未结束 → 继续观察

观察窗口到期:
  errorRate < 5% AND successRate > 90% → 自动 Promote
  errorRate > 20% → 自动回滚
  指标居中 (ambiguous) → 写审计 → 人工介入
```

### 4.3 回滚原子操作

1. 校验 canary 状态（running / rolling-back）
2. 读取 snapshot（agentConfig + workflows + skills + connectors）
3. 在 Prisma 事务中原子恢复 Agent 全部字段
4. 记录 `restoredFields`（字段级 diff）
5. 标记 snapshot 为 `rolled-back-to`
6. 更新 canary 状态为 `rolled-back`
7. 写审计日志

---

## 5. 真相源声明

| 领域 | 真相源 | 存储 |
|------|--------|------|
| 任务定义 | Hermes Control Kernel | HarnessProposal + AuditLog |
| 策略快照 | Hermes Control Kernel | HarnessSnapshot |
| 审批状态 | Hermes Control Kernel | AuditLog (proposal.approve/reject) |
| 审计留痕 | Hermes Control Kernel | AuditLog |
| 执行回执 | OpenClaw Execution Runtime | ActionReceipt (Phase 6 新增) |
| 运行记录 | OpenClaw Execution Runtime | WorkflowRun + AgentLog |
| 连接器执行 | OpenClaw Execution Runtime | ActionReceipt |

**关键原则：**
- 任务真相源在 Hermes：proposal.create 审计早于 task.dispatch
- 执行真相源在 OpenClaw：connector.execute 审计早于 Receipt 写入

---

## 6. 测试覆盖

### 6.1 E2E 测试

| 测试 | 文件 | 覆盖路径 |
|------|------|----------|
| 完整闭环 | phase6-audit-rollback.test.ts | proposal→canary→fail→rollback→audit chain |
| 六类事件 | phase6-audit-rollback.test.ts | task.dispatch/sandbox/connector/proposal/pack/automation |
| 四层日志 | phase6-audit-rollback.test.ts | AuditLog→AgentLog→WorkflowRun→Receipt |
| 硬性约束 | phase6-audit-rollback.test.ts | 不伪造审批/快照回滚/真相源验证 |
| 状态机 | phase6-audit-rollback.test.ts | draft guard/canary 唯一性/rollback 完整性 |

### 6.2 脚本验证

| 脚本 | 用途 |
|------|------|
| `scripts/canary-release.ts` | 最小 canary 发布（cron 或手动） |
| `scripts/rollback-drill.ts` | 回滚演练（模拟 A5 导致恶化） |

---

## 7. 已知风险与建议

### 7.1 双实现层不一致

- apps-side `canary.ts` 与 kernel-side `harness-handler.ts` 的 canary 阈值不同
- **建议：** 统一到 `packages/hermes-kernel/src/harness/lifecycle.ts` 的 `DEFAULT_CANARY_THRESHOLDS`

### 7.2 旧版 writeAuditLog 残留

- 多个 connector 和 mutation 文件仍使用旧版 one-shot 接口
- **建议：** 逐步迁移到 `createAuditEntry` + `updateAuditEntry` 预记录模式

### 7.3 ActionReceipt 覆盖率

- Phase 6 新增了 DB 模型和存储层，但现有 connector 尚未接入
- **建议：** 在 `http-connector.ts`、`email-connector.ts`、`openclaw-gateway-connector.ts` 中接入 `storeReceipt()`

---

## 8. 签署

| 角色 | 姓名 | 日期 | 签名 |
|------|------|------|------|
| 架构评审人 | | | |
| 安全评审人 | | | |
| QA 负责人 | | | |

---

> 本报告基于 HermesClaw v3.x Phase 6 审计与回滚验证生成。  
> 测试结果：____通过 / ____失败  
> 生成时间：____年____月____日
