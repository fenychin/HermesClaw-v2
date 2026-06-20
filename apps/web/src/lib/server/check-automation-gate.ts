/**
 * 自动化门禁通用函数
 *
 * 三域归属：OpenClaw Execution Runtime（通用系统层）
 * 行业包将其高危动作类型列表注入此函数，系统层不再硬编码行业专属枚举。
 */

/**
 * 判断指定 actionType 是否属于高危动作。
 * 通过 criticalTypes 参数注入高危类型列表，实现与行业包的松耦合。
 *
 * @param actionType - 待检查的动作类型
 * @param criticalTypes - 高危动作类型列表（由行业包提供）
 */
export function isCriticalActionType(
  actionType: string,
  criticalTypes: readonly string[] = []
): boolean {
  return criticalTypes.includes(actionType)
}
