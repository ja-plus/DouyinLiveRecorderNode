import { Module, type DynamicModule, Inject } from "@nestjs/common";
import type { Logger } from "pino";
import { LOGGER_TOKEN } from "../common/logger.js";
import { LogsController } from "./logs.controller.js";
import { LogsService } from "./logs.service.js";

@Module({})
export class LogsModule {
  static forRoot(sqliteLogPath: string): DynamicModule {
    return {
      module: LogsModule,
      controllers: [LogsController],
      providers: [
        {
          provide: LogsService,
          useFactory: (logger: Logger) => new LogsService(logger, sqliteLogPath),
          inject: [LOGGER_TOKEN],
        },
      ],
      exports: [LogsService],
    };
  }
}
