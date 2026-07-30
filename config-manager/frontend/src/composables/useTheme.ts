import { ref } from 'vue';

/**
 * 跟随系统颜色自动切换亮色/暗色（模块级单例）
 */
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

export const isDark = ref(darkMedia.matches);

function applyTheme(dark: boolean): void {
  isDark.value = dark;
  // arco-design-vue 通过 body 上的 arco-theme 属性切换暗色变量
  if (dark) {
    document.body.setAttribute('arco-theme', 'dark');
  } else {
    document.body.removeAttribute('arco-theme');
  }
}

applyTheme(darkMedia.matches);
darkMedia.addEventListener('change', (e) => applyTheme(e.matches));
