<template>
    <div class="page">
        <div class="header">
            <div class="title">config.ini 系统配置</div>
            <div class="toolbar">
                <a-button :loading="loading" @click="load">
                    <template #icon><icon-refresh /></template>
                </a-button>
                <a-button type="primary" :loading="saving" @click="save">
                    <template #icon><icon-save /><span v-if="dirty" class="dirty-tip">●</span></template>
                </a-button>
            </div>
        </div>

        <div class="sub-bar">
            <span>共 {{ sections.length }} 个分区，{{ totalCount }} 个配置项</span>
        </div>

        <a-spin :loading="loading" class="spin-wrap">
            <a-tabs v-if="sections.length" type="rounded" size="large">
                <a-tab-pane v-for="sec in sections" :key="sec.name" :title="sec.name">
                    <a-form :model="sec" layout="vertical" class="section-form">
                        <a-form-item
                            v-for="item in sec.items"
                            :key="item.key"
                            :label="item.key"
                            :class="{ 'span-all': controlOf(item) === 'textarea' }"
                        >
                            <!-- 是/否 → 开关 -->
                            <a-switch
                                v-if="controlOf(item) === 'switch'"
                                :model-value="item.value === '是'"
                                @change="(v: string | number | boolean) => (item.value = v ? '是' : '否')"
                            >
                                <template #checked>是</template>
                                <template #unchecked>否</template>
                            </a-switch>
                            <!-- 枚举 → 下拉 -->
                            <a-select
                                v-else-if="controlOf(item) === 'select'"
                                v-model="item.value"
                                :options="optionsOf(item)"
                                allow-clear
                            />
                            <!-- 数字 → 数字输入 -->
                            <a-input-number
                                v-else-if="controlOf(item) === 'number'"
                                :model-value="item.value === '' ? undefined : Number(item.value)"
                                :placeholder="item.key"
                                @update:model-value="(v?: number) => (item.value = v == null ? '' : String(v))"
                            />
                            <!-- cookie 等长文本 → 多行 -->
                            <a-textarea
                                v-else-if="controlOf(item) === 'textarea'"
                                v-model="item.value"
                                :auto-size="{ minRows: 2, maxRows: 6 }"
                                allow-clear
                            />
                            <!-- 密码/token → 密码框 -->
                            <a-input-password
                                v-else-if="controlOf(item) === 'password'"
                                v-model="item.value"
                                allow-clear
                            />
                            <!-- 默认 → 文本输入 -->
                            <a-input v-else v-model="item.value" allow-clear />
                        </a-form-item>
                    </a-form>
                </a-tab-pane>
            </a-tabs>
        </a-spin>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Message } from '@arco-design/web-vue';
import type {
    ApiGetAppConfigResp,
    ApiSaveConfigResp,
    AppConfigItem,
    AppConfigSection,
} from '../types';

const API = '/api/app-config';

const sections = ref<AppConfigSection[]>([]);
const loading = ref(false);
const saving = ref(false);

const totalCount = computed(() => sections.value.reduce((n, s) => n + s.items.length, 0));

type ControlType = 'switch' | 'select' | 'number' | 'textarea' | 'password' | 'input';

// 视频格式选项从键名中提取：视频保存格式ts|mkv|flv|mp4|mp3音频|m4a音频
const VIDEO_FORMAT_PREFIX = '视频保存格式';
const QUALITY_KEY = '原画|超清|高清|标清|流畅';

/** 根据键名/当前值推断该配置项用什么控件渲染 */
function controlOf(item: AppConfigItem): ControlType {
    const key = item.key;
    if (key === QUALITY_KEY || key.startsWith(VIDEO_FORMAT_PREFIX) || key.startsWith('language')) {
        return 'select';
    }
    // 键名带 (是/否) 提示，或当前值就是 是/否
    if (key.includes('是/否') || item.value === '是' || item.value === '否') return 'switch';
    if (key.toLowerCase().includes('cookie')) return 'textarea';
    if (key.includes('密码') || key.toLowerCase().includes('token')) return 'password';
    // 当前值是纯数字（含小数）→ 数字输入
    if (item.value !== '' && /^\d+(\.\d+)?$/.test(item.value)) return 'number';
    return 'input';
}

/** 下拉控件的选项列表 */
function optionsOf(item: AppConfigItem): string[] {
    const key = item.key;
    if (key === QUALITY_KEY) return key.split('|');
    if (key.startsWith(VIDEO_FORMAT_PREFIX)) return key.slice(VIDEO_FORMAT_PREFIX.length).split('|');
    if (key.startsWith('language')) return ['zh_cn', 'en'];
    return [];
}

async function load(): Promise<void> {
    loading.value = true;
    try {
        const res = await fetch(API, { credentials: 'include' });
        const data: ApiGetAppConfigResp = await res.json();
        if (!data.success) throw new Error(data.error || '未知错误');
        sections.value = data.sections || [];
        savedSnapshot.value = contentSnapshot.value;
        Message.success(`已加载 ${totalCount.value} 个配置项`);
    } catch (e) {
        Message.error('加载失败: ' + (e as Error).message);
    } finally {
        loading.value = false;
    }
}

async function save(): Promise<void> {
    saving.value = true;
    try {
        const res = await fetch(API, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sections: sections.value }),
        });
        const data: ApiSaveConfigResp = await res.json();
        if (!data.success) throw new Error(data.error || '未知错误');
        savedSnapshot.value = contentSnapshot.value;
        Message.success(`保存成功，共写入 ${data.count} 个配置项`);
    } catch (e) {
        Message.error('保存失败: ' + (e as Error).message);
    } finally {
        saving.value = false;
    }
}

// 未保存状态：当前内容与最近一次加载/保存的基线快照比较
const contentSnapshot = computed(() => JSON.stringify(sections.value));
const savedSnapshot = ref(contentSnapshot.value);
const dirty = computed(() => contentSnapshot.value !== savedSnapshot.value);

onMounted(load);
</script>

<style scoped>
.page {
    /* 父容器 .content 是 flex 列，需显式撑满宽度后再由 max-width 限宽居中 */
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 20px;
    box-sizing: border-box;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.title {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-1, #1d2129);
}

.toolbar {
    display: flex;
    gap: 12px;
}

.sub-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 13px;
    color: var(--color-text-3, #86909c);
    margin-bottom: 12px;
}

.dirty-tip {
    color: #ff7d00;
    position: absolute;
    right: 2px;
    top: -6px;
}

.spin-wrap {
    display: block;
    background: var(--color-bg-2, #fff);
    border-radius: 6px;
    padding: 16px 20px;
}

/* 双列表单，长文本控件独占一行 */
.section-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 32px;
}

.section-form .span-all {
    grid-column: 1 / -1;
}

.section-form :deep(.arco-input-number) {
    max-width: 220px;
}

@media (max-width: 800px) {
    .section-form {
        grid-template-columns: 1fr;
    }
}
</style>
