/**
 * 行业包高危动作类型注册表
 *
 * 三域原则：
 * - 本文件位于 Industry Pack SDK，只提供注册/查询能力，不写任何行业业务实现。
 * - 行业包通过 manifest 声明其高危动作类型，SDK 在装载 manifest 时自动注册。
 * - Hermes 控制平面通过本注册表查询高危动作类型，从而避免硬编码行业包常量。
 */

/** packId -> 高危动作类型集合 */
const registry = new Map<string, ReadonlySet<string>>()

/**
 * 注册（或覆盖）指定行业包的高危动作类型。
 * 由 SDK loader 在 loadIndustryManifest 成功后调用。
 */
export function registerCriticalActionTypes(
  packId: string,
  types: readonly string[],
): void {
  registry.set(packId, new Set(types))
}

/**
 * 取消注册指定行业包的高危动作类型。
 * 在行业包卸载/回滚时由 loader 调用。
 */
export function unregisterCriticalActionTypes(packId: string): void {
  registry.delete(packId)
}

/**
 * 获取指定行业包的高危动作类型列表。
 * 若未注册或行业包不存在，返回空数组。
 */
export function getCriticalActionTypes(packId: string): readonly string[] {
  const set = registry.get(packId)
  return set ? Array.from(set) : []
}

/**
 * 获取所有已注册高危动作类型的并集。
 * 用于 Hermes 控制平面在无法确定具体行业上下文时做保守拦截。
 */
export function getAllCriticalActionTypes(): readonly string[] {
  const union = new Set<string>()
  for (const set of registry.values()) {
    for (const t of set) {
      union.add(t)
    }
  }
  return Array.from(union)
}

/**
 * 判断 actionType 是否属于指定行业包的高危动作类型。
 * 当 packId 未提供时，对所有已注册 pack 取并集判断。
 */
export function isCriticalActionTypeRegistered(
  actionType: string,
  packId?: string,
): boolean {
  if (packId) {
    const set = registry.get(packId)
    return set ? set.has(actionType) : false
  }
  for (const set of registry.values()) {
    if (set.has(actionType)) return true
  }
  return false
}

/**
 * 清空注册表。主要用于测试隔离。
 */
export function clearCriticalActionTypes(): void {
  registry.clear()
}
