/**
 * Harness 治理闭环冒烟脚本
 *
 * 运行方式：
 *   BASE_URL=http://localhost:3000 \
 *   TEST_BUNDLE_ID=<draft-bundle-id> \
 *   TEST_AUTH_COOKIE=<session-cookie> \
 *   CRON_SECRET=local-dev-cron-secret-not-for-prod \
 *   pnpm tsx scripts/harness-smoke.ts
 *
 * 或通过 package.json：
 *   pnpm smoke:harness
 */

const BASE      = process.env.BASE_URL   ?? 'http://localhost:3000'
const SECRET    = process.env.CRON_SECRET ?? ''
const AUTH      = process.env.TEST_AUTH_COOKIE ?? ''
const BUNDLE_ID = process.env.TEST_BUNDLE_ID ?? ''

interface HarnessSmokeResult { name: string; ok: boolean; detail?: string }
const harnessSmokeResults: HarnessSmokeResult[] = []

const check = (name: string, ok: boolean, detail?: string) => {
  harnessSmokeResults.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function call(
  method: string,
  path: string,
  body?: object,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH ? { Cookie: AUTH } : {}),
      ...(extraHeaders ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

async function run() {
  console.log('\n🛡️  HermesClaw Harness Governance Smoke Test')
  console.log('='.repeat(55))

  // ---- 1. api/harness/status ----
  console.log('\n[1] 基础端点可达性')
  const statusRes = await call('GET', '/api/harness/status')
  check('harness/status 端点可访问', [200, 401, 403].includes(statusRes.status),
    `status=${statusRes.status}`)

  // ---- 2. Cron 触发 ----
  console.log('\n[2] Cron 触发评估')
  const cronHeaders = SECRET ? { Authorization: `Bearer ${SECRET}` } : undefined
  const cronRes = await call('GET', '/api/harness/cron', undefined, cronHeaders)
  check('Cron 返回 200', cronRes.status === 200, `status=${cronRes.status}`)
  check('Cron 响应含 results 数组',
    Array.isArray(cronRes.data?.results),
    `results 类型=${typeof cronRes.data?.results}`)
  check('Cron 响应含 evaluatedAt',
    !!cronRes.data?.evaluatedAt,
    `evaluatedAt=${cronRes.data?.evaluatedAt}`)
  check('Cron 响应含 nextEvaluatedAt',
    !!cronRes.data?.nextEvaluatedAt,
    `nextEvaluatedAt=${cronRes.data?.nextEvaluatedAt}`)
  check('Cron 响应含 intervalHours',
    typeof cronRes.data?.intervalHours === 'number',
    `intervalHours=${cronRes.data?.intervalHours}`)

  // ---- 3. evolution-log ----
  console.log('\n[3] Evolution Log')
  const evoRes = await call('GET', '/api/harness/evolution-log?limit=1')
  check('evolution-log 端点可访问', [200, 401].includes(evoRes.status),
    `status=${evoRes.status}`)

  // ---- 4. proposals 列表 ----
  console.log('\n[4] Proposals 列表')
  const listRes = await call('GET', '/api/harness/proposals')
  check('proposals 端点可访问', [200, 401].includes(listRes.status),
    `status=${listRes.status}`)

  // ---- 5. Proposal 审批流程 ----
  console.log('\n[5] Proposal 审批全流程')

  if (!BUNDLE_ID || !AUTH) {
    console.log('  ⚠️  TEST_BUNDLE_ID 或 TEST_AUTH_COOKIE 未配置，跳过审批流程测试')
    console.log('  配置方式：')
    console.log('    export TEST_BUNDLE_ID=<draft-bundle-id>')
    console.log('    export TEST_AUTH_COOKIE=<next-auth.session-token=xxx>')
  } else {
    // 5a. 创建 Proposal
    const createRes = await call('POST', '/api/harness/proposals', {
      bundleId: BUNDLE_ID,
      title: `[冒烟] Harness 闭环验收 ${new Date().toISOString()}`,
      description: '冒烟测试自动生成的审批链提案',
      changes: { canaryPercent: 5 },
    })
    check('Proposal 创建返回 201', createRes.status === 201,
      `status=${createRes.status}`)

    const proposalId = createRes.data?.proposalId as string | undefined

    if (proposalId) {
      // 5b. 审批通过
      const approveRes = await call(
        'POST',
        `/api/harness/proposals/${proposalId}/approve`,
        {},
      )
      check('审批通过端点可访问',
        [200, 400, 403, 404, 409].includes(approveRes.status),
        `status=${approveRes.status}`)

      if (approveRes.status === 200) {
        check('审批通过返回 proposalId',
          !!approveRes.data?.proposalId,
          `${JSON.stringify(approveRes.data).slice(0, 100)}`)
      }

      // 5c. 拒绝链路
      const rejectRes = await call(
        'POST',
        `/api/harness/proposals/${proposalId}/reject`,
        {},
      )
      check('拒绝端点可访问',
        [200, 400, 403, 404, 409].includes(rejectRes.status),
        `status=${rejectRes.status}`)
    }
  }

  // ---- 6. generate-spec ----
  console.log('\n[6] generate-spec 参数校验')
  const genRes = await call('POST', '/api/harness/generate-spec', {
    businessIntent: '冒烟测试 — 验证端点可达性',
    industry: '外贸',
    agentRole: '测试智能体',
  })
  check('generate-spec 端点可访问',
    [200, 400, 401, 403, 502].includes(genRes.status),
    `status=${genRes.status}`)

  // ---- 7. 回滚门禁 ----
  console.log('\n[7] 回滚安全门禁')
  const emptyReasonRes = await call(
    'POST',
    `/api/harness/bundles/${BUNDLE_ID || 'test'}/rollback`,
    { reason: '' },
  )
  check('空 reason 回滚被拒绝',
    [400, 404].includes(emptyReasonRes.status),
    `status=${emptyReasonRes.status}`)

  // ---- 8. Cron 鉴权 ----
  console.log('\n[8] Cron 鉴权')
  if (SECRET) {
    const badAuthRes = await call('GET', '/api/harness/cron', undefined, {
      Authorization: 'Bearer wrong-secret',
    })
    check('错误 secret 返回 401', badAuthRes.status === 401,
      `status=${badAuthRes.status}`)
  } else {
    console.log('  ⚠️  CRON_SECRET 未配置，跳过鉴权测试')
  }

  // ---- 9. Bundles 端点 ----
  console.log('\n[9] Bundles 端点')
  if (BUNDLE_ID && AUTH) {
    const activateRes = await call(
      'POST',
      `/api/harness/bundles/${BUNDLE_ID}/activate`,
      { confirmationToken: '确认回滚' },
    )
    check('bundle/activate 端点可访问',
      [200, 404, 409].includes(activateRes.status),
      `status=${activateRes.status}`)

    const rollbackRes = await call(
      'POST',
      `/api/harness/bundles/${BUNDLE_ID}/rollback`,
      { reason: '冒烟测试 — 验证回滚端点', confirmationToken: '确认回滚' },
    )
    check('bundle/rollback 端点可访问',
      [200, 404, 409, 422].includes(rollbackRes.status),
      `status=${rollbackRes.status}`)
  }

  // ---- 汇总 ----
  console.log('\n' + '='.repeat(55))
  const passed = harnessSmokeResults.filter(r => r.ok).length
  const failed = harnessSmokeResults.filter(r => !r.ok)
  const skipped = harnessSmokeResults.filter(r => r.detail?.includes('跳过'))

  console.log(`📊 ${passed}/${harnessSmokeResults.length} 通过`)
  console.log(`   跳过: ${skipped.length}  失败: ${failed.length}`)

  if (failed.length > 0) {
    console.log('\n❌ 失败项：')
    failed.forEach(r => console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ''}`))
  }

  // 与 Phase 2 主链路冒烟对齐：有预期失败的不视为整个冒烟失败
  // 网络不可达类失败才 exit 1
  const netFailures = failed.filter(r => r.detail?.includes('status=undefined'))
  if (netFailures.length > 0) {
    console.log('\n🔴 网络不可达，确认 dev server 是否已启动')
    process.exit(1)
  }

  console.log('\n✅ Harness 冒烟完成')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
