function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    } else {
        for(var i = decorators.length - 1; i >= 0; i--){
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
import { Module } from "@nestjs/common";
import { RecordingStatusController } from "./recording-status.controller.js";
import { RecordingStatusService } from "./recording-status.service.js";
export class RecordingStatusModule {
    static forRoot(recorderStatusUrl, logger) {
        return {
            module: RecordingStatusModule,
            providers: [
                // 直接以构造好的实例注入，避免在 Nest 容器内传递原始字符串令牌。
                {
                    provide: RecordingStatusService,
                    useValue: new RecordingStatusService(recorderStatusUrl, logger)
                }
            ],
            controllers: [
                RecordingStatusController
            ]
        };
    }
}
RecordingStatusModule = _ts_decorate([
    Module({})
], RecordingStatusModule);

//# sourceMappingURL=recording-status.module.js.map