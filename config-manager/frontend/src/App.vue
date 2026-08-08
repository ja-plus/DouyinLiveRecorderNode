<template>
  <router-view v-if="route.name === 'login'" />
  <a-layout v-else class="layout">
    <a-layout-header class="topbar">
      <div class="brand">
        <icon-video-camera class="brand-icon" />
        <span>DLR 管理台</span>
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
      <a-button v-if="loginEnabled" type="text" @click="signOut">
        <template #icon><icon-export /></template>
      </a-button>
    </a-layout-header>

    <a-layout-content class="content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getAuthStatus, logout } from './auth';

const route = useRoute();
const router = useRouter();

const selectedKeys = computed(() => [String(route.name ?? '')]);
const loginEnabled = ref(false);

onMounted(async () => {
  loginEnabled.value = (await getAuthStatus()).loginEnabled;
});

function onMenuItemClick(key: string): void {
  if (key !== route.name) {
    router.push({ name: key });
  }
}

async function signOut(): Promise<void> {
  await logout();
  await router.replace({ name: 'login' });
}
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  /* 使用 arco 变量，暗色下自动切换 */
  background: var(--color-fill-1, #f7f8fa);
  color: var(--color-text-1, #1d2129);
  transition: background-color 0.2s;
}

/* 暗色下 --color-fill-2 是半透明白（用于叠加深色底），不能作页面背景，改用实色背景变量 */
body[arco-theme='dark'] {
  background: var(--color-bg-1, #17171a);
}
</style>

<style scoped>
/* a-layout 本身是 flex 纵向布局，固定为视口高度，让子页面可用 flex 占满剩余空间 */
.layout {
  height: 100vh;
  /* 移动端地址栏收起/展开时用动态视口高度，避免出现空白或裁剪 */
  height: 100dvh;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 32px;
  height: 56px;
  padding: 0 24px;
  background: color-mix(in srgb, var(--color-bg-2, #fff) 94%, transparent);
  backdrop-filter: blur(12px);
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
  /* 允许菜单在 flex 容器内收缩，否则窄屏下 arco 的溢出折叠计算错乱导致换行 */
  min-width: 0;
  background: transparent;
}

/* 移动端：压缩间距和菜单项内边距，保证顶栏单行摆下 */
@media (max-width: 640px) {
  .topbar {
    gap: 12px;
    padding: 0 12px;
  }

  .brand {
    font-size: 15px;
    gap: 6px;
  }

  .topbar-menu :deep(.arco-menu-item) {
    padding: 0 8px;
    margin: 0 2px;
  }
}

/* 超窄屏：只留品牌图标，把空间让给菜单 */
@media (max-width: 420px) {
  .brand span {
    display: none;
  }
}
.content {
  padding: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 普通长页面（如系统配置）在此容器内滚动 */
  overflow-y: auto;
}
</style>
