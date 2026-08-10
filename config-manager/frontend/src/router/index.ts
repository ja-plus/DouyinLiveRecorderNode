import { createRouter, createWebHistory } from 'vue-router';
import UrlConfigView from '../views/UrlConfigView.vue';
import { getAuthStatus } from '../auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: { name: 'urlConfig' } },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: '登录' } },
    {
      path: '/url-config',
      name: 'urlConfig',
      component: UrlConfigView,
      meta: { title: '直播间管理' },
    },
    {
      path: '/app-config',
      name: 'appConfig',
      component: () => import('../views/AppConfigView.vue'),
      meta: { title: '系统配置' },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/LogsView.vue'),
      meta: { title: '系统日志' },
    },
    // 后续扩展页面在此添加路由，并在 App.vue 顶栏菜单中加对应菜单项
  ],
});

router.beforeEach(async (to) => {
  const status = await getAuthStatus();
  if (!status.loginEnabled) return to.name === 'login' ? { name: 'urlConfig' } : true;
  if (!status.authenticated && to.name !== 'login') return { name: 'login', query: { redirect: to.fullPath } };
  if (status.authenticated && to.name === 'login') return { name: 'urlConfig' };
  return true;
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  document.title = title ? `${title} - DouyinLiveRecorder` : 'DouyinLiveRecorder';
});

export default router;
