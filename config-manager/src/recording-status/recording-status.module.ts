import { type DynamicModule, Module } from "@nestjs/common";
import type { Logger } from "pino";
import { RecordingStatusController } from "./recording-status.controller.js";
import { RecordingStatusService } from "./recording-status.service.js";

/**
 * 录制状态模块（动态）。
 * 通过 forRoot 注入录制器状态服务地址；该地址来自 config-manager/config.js。
 */
@Module({})
export class RecordingStatusModule {
  static forRoot(
    recorderStatusUrl: string,
    logger: Logger,
  ): DynamicModule {
    return {
      module: RecordingStatusModule,
      providers: [
        // 直接以构造好的实例注入，避免在 Nest 容器内传递原始字符串令牌。
        {
          provide: RecordingStatusService,
          useValue: new RecordingStatusService(recorderStatusUrl, logger),
        },
      ],
      controllers: [RecordingStatusController],
    };
  }
}
