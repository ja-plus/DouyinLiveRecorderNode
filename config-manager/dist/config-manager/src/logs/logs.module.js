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
import { LOGGER_TOKEN } from "../common/logger.js";
import { LogsController } from "./logs.controller.js";
import { LogsService } from "./logs.service.js";
export class LogsModule {
    static forRoot(sqliteLogPath) {
        return {
            module: LogsModule,
            controllers: [
                LogsController
            ],
            providers: [
                {
                    provide: LogsService,
                    useFactory: (logger)=>new LogsService(logger, sqliteLogPath),
                    inject: [
                        LOGGER_TOKEN
                    ]
                }
            ],
            exports: [
                LogsService
            ]
        };
    }
}
LogsModule = _ts_decorate([
    Module({})
], LogsModule);

//# sourceMappingURL=logs.module.js.map