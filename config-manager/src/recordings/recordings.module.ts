import { Module } from "@nestjs/common";
import { RecordingsController } from "./recordings.controller.js";

@Module({ controllers: [RecordingsController] })
export class RecordingsModule {}
