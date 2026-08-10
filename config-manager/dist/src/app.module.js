var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { LoggerModule } from "./common/logger.js";
import { ConfigModule } from "./config/config.module.js";
import { RecordingsModule } from "./recordings/recordings.module.js";
import { RecordingStatusModule } from "./recording-status/recording-status.module.js";
import { LogsModule } from "./logs/logs.module.js";
export function createAppModule(AuthModule, recorderStatusUrl, logger, sqliteLogPath) {
    // 鉴权配置在启动时确定，因此动态组装根模块。
    let AppModule = class AppModule {
    };
    AppModule = __decorate([
        Module({
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
    ], AppModule);
    return { module: AppModule };
}
