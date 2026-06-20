export async function register() {
  // 开发期先不注入行业包 SDK，避免将 Node.js 专用模块带入前端/边界编译链。
  // 后续如需恢复，可改为单独的 server-only bootstrap 模块。
}
