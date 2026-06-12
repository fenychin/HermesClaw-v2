/**
 * SkillNodeExecutor 端到端验证脚本
 *
 * 验证目标：
 *   1. L2 技能（inquiry-grading / ft-inquiry-priority）能正常通过 LLM 执行
 *   2. L3 技能（outreach-email / ft-customer-profiling）在缺少 HarnessProposal 时被拒绝
 *   3. L3 技能在有已审批 HarnessProposal 时能正常执行
 *   4. AgentLog 中包含正确的 riskLevel 映射
 *
 * 用法：
 *   pnpm exec tsx prisma/verify-skill-executor.ts
 */
import 'dotenv/config'
import { createSeedPrisma } from './seed-utils'
import { runWorkflow } from '../src/lib/server/workflow/dag-runner'
import { stringifyJsonField } from '../src/lib/api-utils'

const prisma = createSeedPrisma()

// ============================================================
// 辅助函数
// ============================================================

/** 日志输出分节 */
function section(title: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${'='.repeat(60)}`)
}

// ============================================================
// 主验证流程
// ============================================================

async function main() {
  console.log('🧪 SkillNodeExecutor 端到端验证')
  console.log('   验证 Skill 节点通过 model-router 调用 LLM，而非 noop\n')

  // ---- 准备：创建两个 Skill 记录 ----

  section('1. 准备 Skill 记录')

  const inquiryGradingId = 'skill-verify-inquiry-grading'
  const outreachEmailId = 'skill-verify-outreach-email'

  // 创建 L2 技能：询盘分级（映射到 ft-inquiry-priority SKILL.md）
  await prisma.skill.upsert({
    where: { id: inquiryGradingId },
    create: {
      id: inquiryGradingId,
      workspaceId: 'default',
      name: 'ft-inquiry-priority', // 对应 .claude/skills/ft-inquiry-priority/SKILL.md
      description: '询盘优先级智能评估 — 对入站询盘进行优先级评分（E2E 验证用）',
      version: 'v1.0.0',
      category: 'foreign-trade:询盘分拣员',
      source: 'e2e-verify',
      status: 'active',
      automationLevel: 'L2',
      inputSchema: '{}',
      outputSchema: '{}',
      usedByAgents: '[]',
      scenarios: '[]',
    },
    update: {
      name: 'ft-inquiry-priority',
      automationLevel: 'L2',
      status: 'active',
    },
  })
  console.log(`  ✅ L2 技能已准备：${inquiryGradingId} → ft-inquiry-priority (automationLevel=L2)`)

  // 创建 L3 技能：开发信生成（映射到 ft-customer-profiling SKILL.md）
  await prisma.skill.upsert({
    where: { id: outreachEmailId },
    create: {
      id: outreachEmailId,
      workspaceId: 'default',
      name: 'ft-customer-profiling', // 对应 .claude/skills/ft-customer-profiling/SKILL.md
      description: '客户画像提取与开发信多语言生成（E2E 验证用）',
      version: 'v1.0.0',
      category: 'foreign-trade:开发信撰写员',
      source: 'e2e-verify',
      status: 'active',
      automationLevel: 'L3',
      inputSchema: '{}',
      outputSchema: '{}',
      usedByAgents: '[]',
      scenarios: '[]',
    },
    update: {
      name: 'ft-customer-profiling',
      automationLevel: 'L3',
      status: 'active',
    },
  })
  console.log(`  ✅ L3 技能已准备：${outreachEmailId} → ft-customer-profiling (automationLevel=L3)`)

  // ============================================================
  // 测试 1：L2 技能正常执行
  // ============================================================

  section('2. 测试 L2 技能（询盘分级）正常执行')

  // 创建工作流定义（含一个 skill 节点）
  const l2WorkflowId = 'wf-verify-l2-skill'
  await prisma.workflow.upsert({
    where: { id: l2WorkflowId },
    create: {
      id: l2WorkflowId,
      workspaceId: 'default',
      name: 'E2E-L2-询盘分级验证',
      description: '验证 L2 Skill 节点能正常通过 LLM 执行',
      status: 'active',
      nodes: stringifyJsonField([
        {
          id: 'node-grading',
          kind: 'skill',
          name: '询盘分级',
          config: {
            skillId: inquiryGradingId,
            instructions: '请对以下询盘进行优先级评分：来自德国客户，询价1000件LED灯具，交期30天，目标价$5/件',
          },
        },
      ]),
      edges: stringifyJsonField([]),
    },
    update: { status: 'active' },
  })

  try {
    const l2Result = await runWorkflow(l2WorkflowId, {
      inquiry: {
        country: '德国',
        product: 'LED灯具',
        quantity: 1000,
        deliveryDays: 30,
        targetPrice: 5,
      },
    })

    console.log(`  工作流状态：${l2Result.status}`)
    if (l2Result.status === 'completed') {
      console.log('  ✅ L2 技能工作流执行完成（通过 model-router 调用 LLM）')
    } else {
      console.log(`  ⚠️ L2 技能工作流状态非预期：${l2Result.status}`)
    }
  } catch (error) {
    console.log(`  ⚠️ L2 技能执行异常：${error instanceof Error ? error.message : '未知'}`)
    console.log('  （如果是因为缺少 LLM API Key，此测试需在有 API Key 的环境中运行）')
  }

  // ============================================================
  // 测试 2：L3 技能缺少 HarnessProposal 时拒绝执行
  // ============================================================

  section('3. 测试 L3 技能（开发信生成）缺少审批时被拒绝')

  const l3NoApprovalWorkflowId = 'wf-verify-l3-no-approval'
  await prisma.workflow.upsert({
    where: { id: l3NoApprovalWorkflowId },
    create: {
      id: l3NoApprovalWorkflowId,
      workspaceId: 'default',
      name: 'E2E-L3-开发信生成验证(无审批)',
      description: '验证 L3 Skill 节点在缺少 HarnessProposal 时被拒绝',
      status: 'active',
      nodes: stringifyJsonField([
        {
          id: 'node-outreach',
          kind: 'skill',
          name: '开发信生成',
          config: {
            skillId: outreachEmailId,
            instructions: '请为德国LED灯具进口商生成英文开发信',
          },
        },
      ]),
      edges: stringifyJsonField([]),
    },
    update: { status: 'active' },
  })

  // 确保没有已审批的 HarnessProposal
  await prisma.harnessProposal.deleteMany({
    where: {
      targetComponent: { in: [outreachEmailId, `skill:${outreachEmailId}`] },
      status: 'approved',
    },
  })

  try {
    const l3NoApprovalResult = await runWorkflow(l3NoApprovalWorkflowId, {
      client: { country: '德国', industry: 'LED灯具进口' },
    })

    console.log(`  工作流状态：${l3NoApprovalResult.status}`)
    // L3 技能节点应失败，导致整个工作流状态为 failed（单节点工作流）
    if (l3NoApprovalResult.status === 'failed') {
      console.log('  ✅ L3 技能正确因缺少 HarnessProposal 而被拒绝')
    } else {
      console.log(`  ⚠️ L3 工作流状态非预期：${l3NoApprovalResult.status}（预期 failed）`)
    }
  } catch (error) {
    console.log(`  ⚠️ L3 拒绝测试异常：${error instanceof Error ? error.message : '未知'}`)
  }

  // ============================================================
  // 测试 3：L3 技能有审批时正常执行
  // ============================================================

  section('4. 测试 L3 技能在有已审批 HarnessProposal 时正常执行')

  // 创建一个已审批的 HarnessProposal
  const proposalId = `HEP-E2E-${Date.now()}`
  await prisma.harnessProposal.upsert({
    where: { proposalId },
    create: {
      id: `hp-verify-${Date.now()}`,
      workspaceId: 'default',
      proposalId,
      triggeredBy: 'manual',
      problemStatement: 'E2E 验证：为开发信生成技能创建审批',
      evidence: '[]',
      targetComponent: outreachEmailId,
      proposedChange: '允许开发信生成技能在 DAG 工作流中自动执行',
      riskLevel: 'medium',
      automationLevel: 'L3',
      status: 'approved',
      estimatedImpact: 'E2E 测试用，无实际影响',
      reviewedBy: 'e2e-verify',
      reviewedAt: new Date().toISOString(),
    },
    update: { status: 'approved' },
  })
  console.log(`  ✅ 已创建已审批的 HarnessProposal：${proposalId}`)

  const l3ApprovedWorkflowId = 'wf-verify-l3-approved'
  await prisma.workflow.upsert({
    where: { id: l3ApprovedWorkflowId },
    create: {
      id: l3ApprovedWorkflowId,
      workspaceId: 'default',
      name: 'E2E-L3-开发信生成验证(已审批)',
      description: '验证 L3 Skill 节点在有 HarnessProposal 时能正常执行',
      status: 'active',
      nodes: stringifyJsonField([
        {
          id: 'node-outreach-approved',
          kind: 'skill',
          name: '开发信生成（已审批）',
          config: {
            skillId: outreachEmailId,
            instructions: '请为德国LED灯具进口商生成简短英文开发信草稿（约100字）',
          },
        },
      ]),
      edges: stringifyJsonField([]),
    },
    update: { status: 'active' },
  })

  try {
    const l3ApprovedResult = await runWorkflow(l3ApprovedWorkflowId, {
      client: { country: '德国', industry: 'LED灯具进口' },
    })

    console.log(`  工作流状态：${l3ApprovedResult.status}`)
    if (l3ApprovedResult.status === 'completed') {
      console.log('  ✅ L3 技能在有审批时执行完成')
    } else {
      console.log(`  ⚠️ L3 已审批工作流状态非预期：${l3ApprovedResult.status}`)
    }
  } catch (error) {
    console.log(`  ⚠️ L3 已审批执行异常：${error instanceof Error ? error.message : '未知'}`)
    console.log('  （如果是因为缺少 LLM API Key，此测试需在有 API Key 的环境中运行）')
  }

  // ============================================================
  // 验证 4：AgentLog 中 riskLevel 字段是否正确
  // ============================================================

  section('5. 验证 AgentLog riskLevel 映射')

  const agentLogs = await prisma.agentLog.findMany({
    where: {
      source: 'workflow',
      detail: {
        contains: 'skill-verify-',
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      taskName: true,
      status: true,
      riskLevel: true,
      detail: true,
    },
  })

  if (agentLogs.length === 0) {
    console.log('  ⚠️ 未找到 Skill 节点 AgentLog（可能因 LLM API Key 缺失、节点未真正执行）')
    console.log('  技能节点 start/finish 钩子仍会写入 AgentLog，请检查')
  } else {
    console.log(`  找到 ${agentLogs.length} 条 Skill 相关 AgentLog：`)
    let checksPassed = 0
    let checksFailed = 0
    for (const log of agentLogs) {
      // 通过 riskLevel 字段直接判断映射是否正确
      // ft-customer-profiling 是 L3 → 期望 medium
      // ft-inquiry-priority 是 L2 → 期望 low
      const isL3Skill = log.taskName.includes('customer-profiling')
      const expectedRisk = isL3Skill ? 'medium' : 'low'
      const ok = log.riskLevel === expectedRisk
      if (ok) checksPassed++
      else checksFailed++
      console.log(
        `  ${ok ? '✅' : '❌'} ${log.taskName} (${log.status})：` +
        `riskLevel=${log.riskLevel ?? 'null'}（期望=${expectedRisk}）`,
      )
    }
    if (checksFailed === 0 && checksPassed > 0) {
      console.log(`  ✅ 全部 ${checksPassed} 条 AgentLog 的 riskLevel 映射正确`)
    }
  }

  // ============================================================
  // 验证 5：数据库中的 Skill 记录 automationLevel 字段
  // ============================================================

  section('6. 验证 Skill 记录 automationLevel 持久化')

  const skills = await prisma.skill.findMany({
    where: {
      id: { in: [inquiryGradingId, outreachEmailId] },
    },
    select: { id: true, name: true, automationLevel: true },
  })

  for (const skill of skills) {
    const expected = skill.id === outreachEmailId ? 'L3' : 'L2'
    const ok = skill.automationLevel === expected
    console.log(
      `  ${ok ? '✅' : '❌'} ${skill.id}：` +
      `automationLevel=${skill.automationLevel}（期望=${expected}）`,
    )
  }

  // ============================================================
  // 验证 6：L4 绝对禁止自动执行
  // ============================================================

  section('7. 验证 L4 技能绝对禁止自动执行')

  const l4SkillId = 'skill-verify-l4-forbidden'
  await prisma.skill.upsert({
    where: { id: l4SkillId },
    create: {
      id: l4SkillId,
      workspaceId: 'default',
      name: 'ft-inquiry-priority',
      description: 'L4 绝对禁止自动执行测试',
      version: 'v1.0.0',
      category: 'foreign-trade:测试',
      source: 'e2e-verify',
      status: 'active',
      automationLevel: 'L4',
      inputSchema: '{}',
      outputSchema: '{}',
      usedByAgents: '[]',
      scenarios: '[]',
    },
    update: { automationLevel: 'L4', status: 'active' },
  })

  const l4WorkflowId = 'wf-verify-l4'
  await prisma.workflow.upsert({
    where: { id: l4WorkflowId },
    create: {
      id: l4WorkflowId,
      workspaceId: 'default',
      name: 'E2E-L4-禁止执行验证',
      description: '验证 L4 Skill 节点被绝对禁止',
      status: 'active',
      nodes: stringifyJsonField([
        {
          id: 'node-l4',
          kind: 'skill',
          name: 'L4 禁止执行',
          config: { skillId: l4SkillId },
        },
      ]),
      edges: stringifyJsonField([]),
    },
    update: { status: 'active' },
  })

  const l4Result = await runWorkflow(l4WorkflowId, { test: true })
  console.log(`  工作流状态：${l4Result.status}`)
  if (l4Result.status === 'failed') {
    console.log('  ✅ L4 技能正确被绝对禁止执行（符合 AGENTS.md §4.7 L4_FORBIDDEN）')
  } else {
    console.log(`  ❌ L4 工作流应失败但状态为：${l4Result.status}`)
  }

  // ============================================================
  // 汇总
  // ============================================================

  section('验证完成')
  console.log('  所有 E2E 验证场景已执行。')
  console.log('  注：涉及 LLM 调用的测试需要有效的 API Key。')
  console.log('  如缺少 API Key，L2/L3(已审批) 测试会因 LLM 调用失败而标记为异常，')
  console.log('  但 Skill 节点执行器的门禁逻辑（L3 审批检查、L4 禁止）不依赖 LLM，')
  console.log('  可独立验证。\n')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('❌ 验证脚本异常退出：', err)
  process.exit(1)
})
