import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: { name: 'urlConfig' } },
    {
      path: '/url-config',
      name: 'urlConfig',
      component: () => import('../views/UrlConfigView.vue'),
      meta: { title: '直播间管理' },
    },
    {
      path: '/app-config',
      name: 'appConfig',
      component: () => import('../views/AppConfigView.vue'),
      meta: { title: '系统配置' },
    },
    // 后续扩展页面在此添加路由，并在 App.vue 顶栏菜单中加对应菜单项
  ],
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  document.title = title ? `${title} - DouyinLiveRecorder` : 'DouyinLiveRecorder';
});

export default router;
