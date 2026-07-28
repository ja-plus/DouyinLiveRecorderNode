import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ArcoResolver } from 'unplugin-vue-components/resolvers';

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
