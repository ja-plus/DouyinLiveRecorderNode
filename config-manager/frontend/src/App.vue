<template>
  <router-view v-if="route.name === 'login'" />
  <a-layout v-else class="layout">
    <a-layout-header class="topbar">
      <div class="brand">
        <icon-video-camera class="brand-icon" />
        <span>DLR 管理台</span>
      </div>
      <a-menu
        v-if="!isMobile"
        class="topbar-menu"
        mode="horizontal"
        :selected-keys="selectedKeys"
        @menu-item-click="onMenuItemClick"
      >
        <a-menu-item key="urlConfig">直播间管理</a-menu-item>
        <a-menu-item key="appConfig">系统配置</a-menu-item>
        <a-menu-item key="logs">系统日志</a-menu-item>
        <!-- 后续扩展页面在此添加菜单项，key 与路由 name 保持一致 -->
      </a-menu>
      <a-button v-if="loginEnabled" class="logout-button" type="text" @click="signOut">
        <template #icon><icon-export /></template>
        退出登录
      </a-button>
    </a-layout-header>

    <a-layout-content class="content">
      <router-view v-slot="{ Component }">
        <Transition :name="routeTransition" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
    </a-layout-content>

    <nav v-if="isMobile" class="mobile-nav" aria-label="主导航">
      <button
        type="button"
        :class="{ active: route.name === 'urlConfig' }"
        :aria-current="route.name === 'urlConfig' ? 'page' : undefined"
        @click="onMenuItemClick('urlConfig')"
      >
        <icon-video-camera />
        <span>直播间管理</span>
      </button>
      <button
        type="button"
        :class="{ active: route.name === 'appConfig' }"
        :aria-current="route.name === 'appConfig' ? 'page' : undefined"
        @click="onMenuItemClick('appConfig')"
      >
        <icon-settings />
        <span>系统配置</span>
      </button>
    </nav>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getAuthStatus, logout } from './auth';
import { isMobile } from './composables/useMobile';

const route = useRoute();
const router = useRouter();

const selectedKeys = computed(() => [String(route.name ?? '')]);
const routeTransition = computed(() => route.name === 'appConfig' ? 'route-forward' : 'route-back');
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
* {
  box-sizing: border-box;
}

/* 暗色下 --color-fill-2 是半透明白（用于叠加深色底），不能作页面背景，改用实色背景变量 */
body[arco-theme='dark'] {
  background: var(--color-bg-1, #17171a);
}

/* 全局滚动条美化：统一页面、弹窗、表格等所有可滚动容器的滚动条样式 */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: var(--color-fill-4, #c9cdd4);
  border-radius: 8px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-4, #86909c);
}

::-webkit-scrollbar-corner {
  background: transparent;
}

/* Firefox 回退 */
@supports not selector(::-webkit-scrollbar) {
  html {
    scrollbar-width: thin;
    scrollbar-color: var(--color-fill-4, #c9cdd4) transparent;
  }
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
.logout-button {
  margin-left: auto;
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

}

.mobile-nav {
  display: flex;
  flex: none;
  height: 56px;
  padding-bottom: 0;
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  box-sizing: border-box;
  background: var(--color-bg-2, #fff);
  border-top: 1px solid var(--color-border-2, #e5e6eb);
}
.mobile-nav button {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0;
  color: var(--color-text-2, #4e5969);
  font: inherit;
  font-size: 12px;
  background: none;
  border: 0;
}
.mobile-nav button.active {
  color: rgb(var(--primary-6, 22, 93, 255));
}
.mobile-nav :deep(.arco-icon) {
  font-size: 20px;
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
  overflow-x: hidden;
}

.route-forward-enter-active,
.route-forward-leave-active,
.route-back-enter-active,
.route-back-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.route-forward-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

.route-forward-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.route-back-enter-from {
  opacity: 0;
  transform: translateX(-24px);
}

.route-back-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
