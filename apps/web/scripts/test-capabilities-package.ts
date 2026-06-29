import {
  listIndustryWorkflows,
  loadIndustryAgents,
  loadIndustrySkills,
  loadIndustryConnectors,
  loadIndustryDashboards,
  loadIndustrySchemas,
  loadIndustryEvalRules
} from "@hermesclaw/industry-pack-sdk"

async function run() {
  const packId = "foreign-trade"
  console.log("开始测试通过 package 导入加载行业包:", packId)

  const steps = [
    { name: "workflows", fn: () => listIndustryWorkflows(packId) },
    { name: "agents", fn: () => loadIndustryAgents(packId) },
    { name: "skills", fn: () => loadIndustrySkills(packId) },
    { name: "connectors", fn: () => loadIndustryConnectors(packId) },
    { name: "dashboards", fn: () => loadIndustryDashboards(packId) },
    { name: "schemas", fn: () => loadIndustrySchemas(packId) },
    { name: "evalRules", fn: () => loadIndustryEvalRules(packId) }
  ]

  for (const step of steps) {
    try {
      console.log(`正在加载: ${step.name}...`)
      const res = step.fn()
      console.log(`成功加载: ${step.name}, 数量: ${Array.isArray(res) ? res.length : "非数组"}`)
    } catch (err: any) {
      console.error(`加载 ${step.name} 失败！错误信息:`)
      console.error(err)
    }
  }
}

run().catch(console.error)
