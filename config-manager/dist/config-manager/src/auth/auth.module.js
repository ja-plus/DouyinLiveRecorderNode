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
function _ts_metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(metadataKey, metadataValue);
    }
}
function _ts_param(paramIndex, decorator) {
    return function(target, key) {
        decorator(target, key, paramIndex);
    };
}
import { Body, Controller, Get, HttpCode, Inject, Module, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { LOGGER_TOKEN } from "../common/logger.js";
const COOKIE = "config_manager_session";
export function createAuthModule(settings, secure, logger) {
    // 凭据不完整或密钥强度不足时立即失败，避免以不安全状态启用登录。
    if (settings.enableLogin && (!settings.loginUsername || !settings.loginPassword || settings.authSecret.length < 32)) throw new Error("启用登录保护时，config-manager/config.js 必须配置 loginUsername、loginPassword 和至少 32 位的 authSecret");
    const auth = {
        enabled: settings.enableLogin,
        username: settings.loginUsername,
        password: settings.loginPassword,
        cookieMaxAgeSeconds: Math.floor(settings.authCookieMaxAgeDays * 86400),
        secure
    };
    const jwt = new JwtService({
        secret: settings.authSecret || "login-disabled"
    });
    class AuthController {
        logger;
        constructor(logger){
            this.logger = logger;
        }
        async status(request) {
            // 返回鉴权状态而非抛错，让前端自行决定显示哪个页面。
            if (!auth.enabled) return {
                success: true,
                loginEnabled: false,
                authenticated: true
            };
            try {
                await jwt.verifyAsync(request.cookies?.[COOKIE] || "");
                return {
                    success: true,
                    loginEnabled: true,
                    authenticated: true
                };
            } catch  {
                // 正常未登录态，不告警。
                this.logger.debug("会话未验证或已过期");
                return {
                    success: true,
                    loginEnabled: true,
                    authenticated: false
                };
            }
        }
        async login(body, reply) {
            if (!auth.enabled) return {
                success: true,
                loginEnabled: false
            };
            const username = String(body?.username || "");
            if (username !== auth.username || String(body?.password || "") !== auth.password) {
                // 不记录密码，仅记录用户名用于审计。
                this.logger.warn({
                    username
                }, "登录失败：用户名或密码错误");
                throw new UnauthorizedException("用户名或密码错误");
            }
            const token = await jwt.signAsync({
                sub: auth.username
            }, {
                expiresIn: auth.cookieMaxAgeSeconds
            });
            // 使用 HttpOnly Cookie 保存令牌，避免浏览器脚本读取。
            reply.setCookie(COOKIE, token, {
                httpOnly: true,
                secure: auth.secure,
                sameSite: "lax",
                path: "/",
                maxAge: auth.cookieMaxAgeSeconds
            });
            this.logger.info({
                username
            }, "登录成功");
            return {
                success: true,
                loginEnabled: true
            };
        }
        logout(reply) {
            reply.clearCookie(COOKIE, {
                path: "/"
            });
            return {
                success: true
            };
        }
    }
    _ts_decorate([
        Get("status"),
        _ts_param(0, Req()),
        _ts_metadata("design:type", Function),
        _ts_metadata("design:paramtypes", [
            typeof FastifyRequest === "undefined" ? Object : FastifyRequest
        ]),
        _ts_metadata("design:returntype", Promise)
    ], AuthController.prototype, "status", null);
    _ts_decorate([
        Post("login"),
        HttpCode(200),
        _ts_param(0, Body()),
        _ts_param(1, Res({
            passthrough: true
        })),
        _ts_metadata("design:type", Function),
        _ts_metadata("design:paramtypes", [
            typeof LoginBody === "undefined" ? Object : LoginBody,
            typeof FastifyReply === "undefined" ? Object : FastifyReply
        ]),
        _ts_metadata("design:returntype", Promise)
    ], AuthController.prototype, "login", null);
    _ts_decorate([
        Post("logout"),
        HttpCode(200),
        _ts_param(0, Res({
            passthrough: true
        })),
        _ts_metadata("design:type", Function),
        _ts_metadata("design:paramtypes", [
            typeof FastifyReply === "undefined" ? Object : FastifyReply
        ]),
        _ts_metadata("design:returntype", void 0)
    ], AuthController.prototype, "logout", null);
    AuthController = _ts_decorate([
        Controller("/api/auth"),
        _ts_param(0, Inject(LOGGER_TOKEN)),
        _ts_metadata("design:type", Function),
        _ts_metadata("design:paramtypes", [
            typeof Logger === "undefined" ? Object : Logger
        ])
    ], AuthController);
    class AuthModule {
    }
    AuthModule = _ts_decorate([
        Module({
            controllers: [
                AuthController
            ]
        })
    ], AuthModule);
    return {
        AuthModule: {
            module: AuthModule
        },
        guard: async (request, reply)=>{
            // 放行登录相关接口，才能创建、查询和清理会话。
            if (!auth.enabled || !request.url.startsWith("/api/") || [
                "/api/auth/login",
                "/api/auth/status",
                "/api/auth/logout"
            ].includes(request.url.split("?")[0])) return;
            try {
                await jwt.verifyAsync(request.cookies?.[COOKIE] || "");
            } catch  {
                // 鉴权失败：令牌无效或过期。
                logger.warn({
                    url: request.url,
                    hasCookie: !!request.cookies?.[COOKIE]
                }, "鉴权失败：令牌无效或过期");
                // 返回鉴权错误前清除过期或伪造的 Cookie。
                reply.clearCookie(COOKIE, {
                    path: "/"
                });
                return reply.code(401).send({
                    success: false,
                    error: request.cookies?.[COOKIE] ? "登录已失效，请重新登录" : "请先登录"
                });
            }
        }
    };
}

//# sourceMappingURL=auth.module.js.map