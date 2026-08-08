<template>
  <main class="login-page">
    <a-card class="login-panel" :bordered="true">
      <div class="login-title">DLR 管理台</div>
      <a-form :model="form" layout="vertical" @submit="submit">
        <a-form-item field="username" label="用户名" required>
          <a-input v-model="form.username" autocomplete="username" />
        </a-form-item>
        <a-form-item field="password" label="密码" required>
          <a-input-password v-model="form.password" autocomplete="current-password" @press-enter="submit" />
        </a-form-item>
        <a-button type="primary" long html-type="submit" :loading="loading">登录</a-button>
      </a-form>
    </a-card>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const form = reactive({ username: '', password: '' });
const loading = ref(false);

async function submit(): Promise<void> {
  if (!form.username || !form.password) {
    Message.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || '登录失败');
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
}
.login-panel { width: min(100%, 380px); }
.login-title { margin-bottom: 24px; font-size: 20px; font-weight: 600; }
</style>
