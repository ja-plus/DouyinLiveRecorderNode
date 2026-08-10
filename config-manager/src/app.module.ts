import { Module, type DynamicModule } from "@nestjs/common";
import type { Logger } from "pino";
import { LoggerModule } from "./common/logger.js";
import { ConfigModule } from "./config/config.module.js";
import { RecordingsModule } from "./recordings/recordings.module.js";
import { RecordingStatusModule } from "./recording-status/recording-status.module.js";
import { LogsModule } from "./logs/logs.module.js";

export function createAppModule(
  AuthModule: DynamicModule,
  recorderStatusUrl: string,
  logger: Logger,
  sqliteLogPath: string,
): DynamicModule {
  // 鉴权配置在启动时确定，因此动态组装根模块。
  @Module({
    imports: [
      // LoggerModule 为 @Global，放首位使 LOGGER_TOKEN 对所有子模块可注入。
      LoggerModule.forRoot(logger),
      AuthModule,
      ConfigModule,
      RecordingsModule,
      RecordingStatusModule.forRoot(recorderStatusUrl, logger),
      LogsModule.forRoot(sqliteLogPath),
    ],
  })
  class AppModule {}

  return { module: AppModule };
}
