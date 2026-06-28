/**
 * 自动化门禁通用函数
 *
 * 三域归属：OpenClaw Execution Runtime（通用系统层）
 * 行业包将其高危动作类型列表注入 Industry Pack SDK 注册表，
 * 系统层通过本模块查询，不再硬编码行业专属枚举。
 */
import {
  getAllCriticalActionTypes,
  isCriticalActionTypeRegistered,
} from "@hermesclaw/industry-pack-sdk"

/**
 * 判断指定 actionType 是否属于高危动作。
 * 通过 criticalTypes 参数注入高危类型列表，实现与行业包的松耦合。
 *
 * @param actionType - 待检查的动作类型
 * @param criticalTypes - 高危动作类型列表（由调用方注入）
 */
export function isCriticalActionType(
  actionType: string,
  criticalTypes: readonly string[] = []
): boolean {
  return criticalTypes.includes(actionType)
}

/**
 * 获取当前进程中所有已注册的高危动作类型并集。
 * 用于 Hermes 控制平面在无法拿到具体行业上下文时做保守拦截。
 */
export function getCriticalActionTypes(): readonly string[] {
  return getAllCriticalActionTypes()
}

/**
 * 判断 actionType 是否已被任何行业包注册为高危动作。
 */
export function isRegisteredCriticalActionType(actionType: string): boolean {
  return isCriticalActionTypeRegistered(actionType)
}
