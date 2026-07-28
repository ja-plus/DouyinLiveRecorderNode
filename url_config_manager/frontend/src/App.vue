<template>
  <a-layout class="layout">
    <a-layout-header class="topbar">
      <div class="brand">
        <icon-video-camera class="brand-icon" />
        <span>DouyinLiveRecorder 管理台</span>
      </div>
      <a-menu
        class="topbar-menu"
        mode="horizontal"
        :selected-keys="selectedKeys"
        @menu-item-click="onMenuItemClick"
      >
        <a-menu-item key="urlConfig">直播间管理</a-menu-item>
        <a-menu-item key="appConfig">系统配置</a-menu-item>
        <!-- 后续扩展页面在此添加菜单项，key 与路由 name 保持一致 -->
      </a-menu>
    </a-layout-header>

    <a-layout-content class="content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const selectedKeys = computed(() => [String(route.name ?? '')]);

function onMenuItemClick(key: string): void {
  if (key !== route.name) {
    router.push({ name: key });
  }
}
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  /* 使用 arco 变量，暗色下自动切换 */
  background: var(--color-fill-2, #f5f6fb);
  color: var(--color-text-1, #1d2129);
  transition: background-color 0.2s;
}

/* 暗色下 --color-fill-2 是半透明白（用于叠加深色底），不能作页面背景，改用实色背景变量 */
body[arco-theme='dark'] {
  background: var(--color-bg-1, #17171a);
}
</style>

<style scoped>
.layout {
  min-height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 32px;
  height: 56px;
  padding: 0 24px;
  background: var(--color-bg-2, #fff);
  border-bottom: 1px solid var(--color-border-2, #e5e6eb);
  box-sizing: border-box;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1, #1d2129);
  white-space: nowrap;
}
.brand-icon {
  font-size: 20px;
  color: rgb(var(--primary-6, 22, 93, 255));
}
.topbar-menu {
  flex: 1;
  background: transparent;
}
.content {
  padding: 0;
}
</style>
