import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  type HttpStatus,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  APP_CONFIG_PATH,
  CONFIG_PATH,
  buildIni,
  getDefaultQuality,
  parseAppConfig,
  parseIni,
  readConfig,
  saveConfig,
  updateAppConfig,
} from "./config.service.js";
import { QUALITIES } from "../common/paths.js";

type ConfigItem = {
  enabled?: boolean;
  quality?: string;
  url?: string;
  name?: string;
};
type AppSection = {
  name?: string;
  items?: { key?: string; value?: unknown }[];
};

@Controller("/api")
export class ConfigController {
  // 将服务层的异常统一转换为前端使用的 API 响应格式。
  private failed(reply: FastifyReply, status: HttpStatus, error: unknown) {
    reply.code(status);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  @Get("config")
  getConfig(@Res({ passthrough: true }) reply: FastifyReply) {
    try {
      // 解析 URL_config.ini 后返回结构化数据，供前端编辑。
      const text = readConfig(CONFIG_PATH);
      return {
        success: true,
        path: CONFIG_PATH,
        items: parseIni(text),
        qualities: QUALITIES,
        defaultQuality: getDefaultQuality(),
      };
    } catch (error) {
      return this.failed(reply, 500, error);
    }
  }

  @Post("config")
  @HttpCode(200)
  saveUrlConfig(
    @Body() body: { items?: ConfigItem[] },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      if (!Array.isArray(body?.items))
        return this.failed(reply, 400, "items 必须是数组");
      const text = buildIni(body.items);
      // 重新解析生成的文本，返回实际保存的有效条目数量。
      saveConfig(CONFIG_PATH, text);
      return { success: true, count: parseIni(text).length };
    } catch (error) {
      return this.failed(reply, 500, error);
    }
  }

  @Get("app-config")
  getAppConfig(@Res({ passthrough: true }) reply: FastifyReply) {
    try {
      return {
        success: true,
        path: APP_CONFIG_PATH,
        sections: parseAppConfig(readConfig(APP_CONFIG_PATH)),
      };
    } catch (error) {
      return this.failed(reply, 500, error);
    }
  }

  @Post("app-config")
  @HttpCode(200)
  saveAppConfig(
    @Body() body: { sections?: AppSection[] },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      if (!Array.isArray(body?.sections))
        return this.failed(reply, 400, "sections 必须是数组");
      saveConfig(
        APP_CONFIG_PATH,
        // 仅替换已知键的值，保留注释和未知的 INI 内容。
        updateAppConfig(readConfig(APP_CONFIG_PATH), body.sections),
      );
      return {
        success: true,
        count: body.sections.reduce(
          (total, section) => total + (section.items?.length || 0),
          0,
        ),
      };
    } catch (error) {
      return this.failed(reply, 500, error);
    }
  }
}
