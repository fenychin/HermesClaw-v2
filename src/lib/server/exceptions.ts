/**
 * 全局应用层异常体系 (Exceptions System)
 * 
 * —— 统一后端错误处理，包含错误码 (errorCode) 和对应的 HTTP 状态码 (httpStatus)。
 * —— 可被 api-handler 中的 withRBAC 装饰器全局捕获，实现无缝的状态码和细节响应分发，
 *    彻底消除对错误文本 includes 判定的紧耦合行为。
 */

/** 应用层异常基类 */
export class AppException extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly httpStatus: number = 400,
    public readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "AppException";
    // 显式设置原型链，以便在 TypeScript 中 instanceof 能正常识别继承关系
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 远程 Hermes API 网络或协议异常 (502 Bad Gateway) */
export class HermesApiError extends AppException {
  constructor(message: string, details: Record<string, unknown> | null = null) {
    super("HERMES_API_ERROR", message, 502, details);
  }
}

/** 任务输入参数校验失败 (400 Bad Request) */
export class TaskInputValidationError extends AppException {
  constructor(message: string, details: Record<string, unknown> | null = null) {
    super("TASK_INPUT_VALIDATION_FAILED", message, 400, details);
  }
}

/** 工作流未找到异常 (404 Not Found) */
export class WorkflowNotFoundError extends AppException {
  constructor(workflowId: string) {
    super("WORKFLOW_NOT_FOUND", `工作流不存在：${workflowId}`, 404);
  }
}

/** 子工作流嵌套嵌套层级越界 (400 Bad Request) */
export class MaxDepthExceededError extends AppException {
  constructor(depth: number, maxDepth: number) {
    super("MAX_DEPTH_EXCEEDED", `子流程嵌套深度 ${depth} 超过上限 ${maxDepth}`, 400);
  }
}

/** 工具授权凭证 (ToolGrant) 缺失或双审批签字不足异常 (403 Forbidden) */
export class ToolGrantMissingException extends AppException {
  constructor(
    public readonly agentId: string,
    public readonly toolId: string,
    public readonly scopes: string[],
    message: string = "工具授权缺失，需人工审批",
    riskLevel: string = "medium"
  ) {
    super("TOOL_GRANT_MISSING", message, 403, { agentId, toolId, scopes, riskLevel });
  }
}

/**
 * Workflow 实体缺少 industryId 异常 (500 Internal Server Error)。
 *
 * P2-4：消除 `let industryId = 'foreign-trade'` 字面量。
 * 当一个 Workflow 既不存在、又无 industryId 字段时抛出此异常 ——
 * 它表示数据完整性破损，不能用任何静默默认值绕过，否则会把多包路由信号丢失。
 */
export class MissingIndustryIdError extends AppException {
  constructor(workflowId: string) {
    super(
      "MISSING_INDUSTRY_ID",
      `Workflow ${workflowId} 缺失 industryId（数据完整性破损，无法路由到行业包）`,
      500,
      { workflowId },
    );
  }
}
