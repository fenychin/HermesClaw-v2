import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    memory: "src/memory/index.ts",
    orchestration: "src/orchestration/index.ts",
    harness: "src/harness/index.ts",
    policy: "src/policy/index.ts",
    handlers: "src/handlers/task-handler.ts",
    "handlers/chat-handler": "src/handlers/chat-handler.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
});
