import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./src/main.js";

export { startServer };

// 仅在直接执行此文件时启动服务；被导入时只导出 startServer。
// 所有日志已收敛进 startServer（含启动/错误日志），此处仅处理退出码。
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  startServer().catch((err: unknown) => {
    // startServer 内部已有 logger 记录错误；此处仅兜底极罕见的 logger 创建前失败。
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Config Manager 启动失败: ${msg}\n`);
    process.exit(1);
  });
}
