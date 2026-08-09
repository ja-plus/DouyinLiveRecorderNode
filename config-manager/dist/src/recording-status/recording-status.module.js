var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RecordingStatusModule_1;
import { Module } from "@nestjs/common";
import { RecordingStatusController } from "./recording-status.controller.js";
import { RecordingStatusService } from "./recording-status.service.js";
/**
 * 录制状态模块（动态）。
 * 通过 forRoot 注入录制器状态服务地址；该地址来自 config-manager/config.js。
 */
let RecordingStatusModule = RecordingStatusModule_1 = class RecordingStatusModule {
    static forRoot(recorderStatusUrl, logger) {
        return {
            module: RecordingStatusModule_1,
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
};
RecordingStatusModule = RecordingStatusModule_1 = __decorate([
    Module({})
], RecordingStatusModule);
export { RecordingStatusModule };
