import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH, startServer } from "./src/main.js";

export { startServer };

// 仅在直接执行此文件时启动服务；被导入时只导出 startServer。
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(`配置文件路径: ${CONFIG_PATH}`);
  startServer()
    .then((server) => console.log(`Config Manager running at ${server.configManagerHttpInfo.url} (${server.configManagerHttpInfo.scheme}${server.configManagerHttpInfo.protocol === "https" ? " + TLS" : ""})`))
    .catch((error: Error) => {
      console.error(`Server error: ${error.message}`);
      process.exit(1);
    });
}
