import { Module, type DynamicModule } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { RecordingsModule } from "./recordings/recordings.module.js";

export function createAppModule(AuthModule: DynamicModule): DynamicModule {
  // 鉴权配置在启动时确定，因此动态组装根模块。
  @Module({ imports: [AuthModule, ConfigModule, RecordingsModule] })
  class AppModule {}

  return { module: AppModule };
}
