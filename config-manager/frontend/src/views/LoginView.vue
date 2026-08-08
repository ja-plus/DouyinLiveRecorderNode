<template>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="brand-mark"><icon-video-camera /></div>
      <p class="login-kicker">DouyinLiveRecorder</p>
      <h1 id="login-title" class="login-title">DLR 管理台</h1>
      <p class="login-description">管理直播间与录制配置</p>
      <a-form :model="form" layout="vertical" @submit="submit">
        <a-form-item field="username" label="用户名" required>
          <a-input v-model="form.username" autocomplete="username" placeholder="请输入用户名" />
        </a-form-item>
        <a-form-item field="password" label="密码" required>
          <a-input-password v-model="form.password" autocomplete="current-password" placeholder="请输入密码" @press-enter="submit" />
        </a-form-item>
        <div class="login-options"><a-checkbox v-model="rememberUsername">记住用户名</a-checkbox></div>
        <a-button type="primary" long html-type="submit" :loading="loading">登录</a-button>
      </a-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useRoute, useRouter } from 'vue-router';
import http from '../http';
import { API } from '../api';

const router = useRouter();
const route = useRoute();
const usernameStorageKey = 'dlr-login-username';
const savedUsername = localStorage.getItem(usernameStorageKey) || '';
const form = reactive({ username: savedUsername, password: '' });
const rememberUsername = ref(Boolean(savedUsername));
const loading = ref(false);

async function submit(): Promise<void> {
  if (!form.username || !form.password) {
    Message.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    const data = await http.post<{ success?: boolean; error?: string }>(API.authLogin, { body: form });
    if (!data.success) throw new Error(data.error || '登录失败');
    if (rememberUsername.value) localStorage.setItem(usernameStorageKey, form.username.trim());
    else localStorage.removeItem(usernameStorageKey);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/url-config';
    await router.replace(redirect);
  } catch (error) {
    Message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
  background: linear-gradient(135deg, rgb(var(--primary-1, 232, 243, 255)), transparent 55%), var(--color-fill-1, #f7f8fa);
}
.login-panel {
  width: min(100%, 380px);
  padding: 36px;
  background: var(--color-bg-2, #fff);
  border: 1px solid var(--color-border-2, #e5e6eb);
  border-radius: 8px;
  box-shadow: 0 18px 48px rgb(0 0 0 / 8%);
  animation: panel-enter 360ms ease-out both;
}
.brand-mark { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 20px; color: rgb(var(--primary-6, 22, 93, 255)); font-size: 23px; background: rgb(var(--primary-1, 232, 243, 255)); border-radius: 8px; }
.login-kicker { margin: 0 0 6px; color: var(--color-text-3, #86909c); font-size: 13px; }
.login-title { margin: 0; font-size: 24px; font-weight: 650; color: var(--color-text-1, #1d2129); }
.login-description { margin: 8px 0 28px; color: var(--color-text-3, #86909c); font-size: 14px; }
.login-options { margin: -4px 0 20px; }
@keyframes panel-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .login-panel { animation: none; } }
@media (max-width: 480px) { .login-panel { padding: 28px 24px; } }
</style>
