import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { getDownloadsDir } from "../config/config.service.js";
import { STATIC_DIR } from "../common/paths.js";
export async function registerStaticRoutes(app, logger) {
    // 单独挂载录制目录，使播放器可通过相对路径请求媒体文件。
    const downloads = getDownloadsDir();
    if (fs.existsSync(downloads))
        await app.register(fastifyStatic, {
            root: downloads,
            prefix: "/api/video/",
            decorateReply: false,
        });
    if (!fs.existsSync(STATIC_DIR)) {
        logger.warn({ staticDir: STATIC_DIR }, "前端 static 目录不存在，仅提供 API 服务");
        return;
    }
    await app.register(fastifyStatic, {
        root: STATIC_DIR,
        prefix: "/",
        wildcard: false,
    });
    // 非 API 路径交给 SPA 路由处理，未知 API 则始终返回 JSON 404。
    app.get("/*", (request, reply) => {
        if (request.url.startsWith("/api/"))
            return reply.code(404).send({ success: false, error: "Not found" });
        const index = path.join(STATIC_DIR, "index.html");
        if (!fs.existsSync(index))
            logger.warn("前端未构建：缺少 static/index.html");
        return fs.existsSync(index)
            ? reply.type("text/html").send(fs.readFileSync(index))
            : reply
                .code(404)
                .send({
                success: false,
                error: "前端未构建：缺少 static/index.html",
            });
    });
}
