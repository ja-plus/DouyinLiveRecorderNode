import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

// 初始化主题（跟随系统颜色）
import './composables/useTheme';

// stk-table-vue 样式
import 'stk-table-vue/lib/style.css';
// Message 为函数式调用，需手动引入其样式（组件通过 ArcoResolver 按需自动引入）
import '@arco-design/web-vue/es/message/style/css.js';

createApp(App).use(router).mount('#app');
