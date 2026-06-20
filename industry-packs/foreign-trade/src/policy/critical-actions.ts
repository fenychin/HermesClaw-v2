/**
 * 外贸行业包高危动作类型定义
 *
 * 三域归属：Industry Pack Layer / Foreign Trade
 * 行业包自行声明其高危动作类型，系统层通过注入使用。
 */

export const TRADE_CRITICAL_ACTION_TYPES = [
  'trade.send-quotation',
  'trade.sign-contract',
] as const

export type TradeCriticalActionType = (typeof TRADE_CRITICAL_ACTION_TYPES)[number]

export function isTradeCriticalActionType(actionType: string): boolean {
  return (TRADE_CRITICAL_ACTION_TYPES as readonly string[]).includes(actionType)
}
