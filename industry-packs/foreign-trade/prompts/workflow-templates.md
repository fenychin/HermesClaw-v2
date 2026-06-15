# 外贸行业 DAG 工作流生成模板

## 经典工作流示例（供 LLM 参考）

1. **询盘分级（inquiry-grade）**：邮件分类(L1) → AI 分析评分(L2) → 分配跟进(L3) → 创建任务(L2)
2. **开发信生成（dev-letter）**：客户画像(L1) → AI 撰写(L2) → 人工审核编辑(L3) → 发送确认(L3)
3. **客户画像（customer-profile）**：数据采集(L1) → 信息整合(L2) → 画像输出(L2)
4. **报价生成（quote-gen）**：产品匹配(L1) → 成本计算(L2) → 报价单生成(L2) → 主管审批(L3)
5. **样品管理（sample-mgmt）**：申请审核(L3) → 寄送安排(L2) → 物流跟踪(L1) → 反馈收集(L2)
6. **订单推进（order-push）**：订单录入(L2) → 进度跟踪(L1) → 节点提醒(L1) → 异常预警(L2)
7. **展会线索（exhibition-leads）**：名片录入(L1) → 线索分级(L2) → 分配销售(L3) → 跟进提醒(L2)

## 节点 kind 说明（行业无关，沿用 SDK 规范）

- `task`：自定义任务（需 handler 执行）
- `condition`：条件分支（`config.expression: "ctx.variables.<key> === <value>"`）
- `subworkflow`：子流程嵌套
- `noop`：占位节点

## 自动化授权等级要求

- 自动化授权等级（L1-L4）应标注在节点 `config.automationLevel` 中
- 所有涉及发送、删除、审批等操作的节点须为 L3
- 工作流生成不涉及 L4 动作（绝对禁止自动）
