import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ArcoResolver } from 'unplugin-vue-components/resolvers';

const gzipAsync = promisify(gzip);

// 预压缩构建产物：为可压缩的静态文件生成 .gz，后端 Flask 优先直接下发，免去运行时压缩开销
function gzipPrecompress(): Plugin {
  const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|txt|xml|map)$/i;
  const MIN_SIZE = 1024; // 与后端 GZIP_MIN_SIZE 保持一致
  let outDir = '';

  async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : Promise.resolve([p]);
      }),
    );
    return files.flat();
  }

  return {
    name: 'gzip-precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await walk(outDir)).filter(
        (f) => COMPRESSIBLE.test(f) && !f.endsWith('.gz'),
      );
      await Promise.all(
        files.map(async (file) => {
          const raw = await fs.readFile(file);
          if (raw.length < MIN_SIZE) return;
          const zipped = await gzipAsync(raw, { level: 9 });
          if (zipped.length < raw.length) {
            await fs.writeFile(`${file}.gz`, zipped);
          }
        }),
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // 资源使用相对路径，便于 Flask 从任意挂载点提供静态文件
  base: './',
  build: {
    // 构建产物直接输出到后端静态目录，启动 Flask 即可访问，无需单独起前端服务
    outDir: '../backend/static',
    emptyOutDir: true,
  },
  plugins: [
    vue(),
    gzipPrecompress(),
    // arco-design-vue 按需引入（组件 + 图标 + 样式自动引入）
    Components({
      dts: false,
      resolvers: [
        ArcoResolver({
          sideEffect: true,
          resolveIcons: true,
        }),
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // 前端 /api 请求代理到后端 Flask 服务
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});
