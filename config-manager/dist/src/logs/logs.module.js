var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LogsModule_1;
import { Module } from "@nestjs/common";
import { LOGGER_TOKEN } from "../common/logger.js";
import { LogsController } from "./logs.controller.js";
import { LogsService } from "./logs.service.js";
let LogsModule = LogsModule_1 = class LogsModule {
    static forRoot(sqliteLogPath) {
        return {
            module: LogsModule_1,
            controllers: [LogsController],
            providers: [
                {
                    provide: LogsService,
                    useFactory: (logger) => new LogsService(logger, sqliteLogPath),
                    inject: [LOGGER_TOKEN],
                },
            ],
            exports: [LogsService],
        };
    }
};
LogsModule = LogsModule_1 = __decorate([
    Module({})
], LogsModule);
export { LogsModule };
