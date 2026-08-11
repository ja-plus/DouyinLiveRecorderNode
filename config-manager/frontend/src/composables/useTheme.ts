import { ref } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'dlr-theme-mode';
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

function loadMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/** 用户选择的主题模式（持久化到 localStorage），auto 表示跟随系统 */
export const themeMode = ref<ThemeMode>(loadMode());

/** 当前实际是否暗色（auto 模式下随系统变化），供组件 theme 属性使用 */
export const isDark = ref(false);

function applyTheme(): void {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'auto' && darkMedia.matches);
  isDark.value = dark;
  // arco-design-vue 通过 body 上的 arco-theme 属性切换暗色变量
  if (dark) {
    document.body.setAttribute('arco-theme', 'dark');
  } else {
    document.body.removeAttribute('arco-theme');
  }
}

/** 切换主题模式并持久化 */
export function setThemeMode(mode: ThemeMode): void {
  themeMode.value = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage 不可用时静默忽略，不影响本次切换
  }
  applyTheme();
}

// 初始化：根据已持久化的模式应用主题
applyTheme();
// 仅在 auto 模式下跟随系统颜色变化
darkMedia.addEventListener('change', () => {
  if (themeMode.value === 'auto') applyTheme();
});
