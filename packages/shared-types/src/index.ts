/**
 * 占位导出 —— v0.13+ 仓库正式拆分 monorepo 时（CLAUDE.md §3.3），
 * 跨域共享类型（如 RBAC 角色、租户上下文）将从 src/types/ 抽至此处。
 *
 * 当前 src/types/* 仍为权威来源，本包暂不导出任何类型，
 * 仅占位以让 pnpm workspace 拓扑稳定。
 */
export const SHARED_TYPES_VERSION = "0.0.0-placeholder"
