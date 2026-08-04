<script setup>
import { Eye, RefreshCcw, Terminal, XCircle } from 'lucide-vue-next';

defineProps({
  platformLabel: {
    type: String,
    required: true
  },
  logs: {
    type: Array,
    default: () => []
  },
  stats: {
    type: Object,
    required: true
  },
  open: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  formatDate: {
    type: Function,
    required: true
  }
});

defineEmits(['toggle', 'refresh']);
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex min-w-0 items-start gap-3">
      <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
        <Terminal class="h-5 w-5" />
      </div>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-lg font-extrabold">Nhật ký kỹ thuật</h3>
          <span class="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-extrabold uppercase text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            Debug
          </span>
        </div>
        <p class="mt-1 text-sm text-zinc-500">
          Ẩn mặc định để không làm rối màn hình vận hành. Mở khi cần kiểm tra lỗi automation, ADB hoặc {{ platformLabel }} UI.
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
        {{ stats.total }} log
      </span>
      <span v-if="stats.warnings" class="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
        {{ stats.warnings }} cảnh báo
      </span>
      <span v-if="stats.errors" class="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        {{ stats.errors }} lỗi
      </span>
      <button class="btn-soft h-9 px-3 text-sm" type="button" @click="$emit('toggle')">
        <Eye v-if="!open" class="h-4 w-4" />
        <XCircle v-else class="h-4 w-4" />
        {{ open ? 'Ẩn nhật ký' : 'Mở nhật ký' }}
      </button>
    </div>
  </div>

  <div v-if="open" class="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-bold text-zinc-500">
        Hiển thị {{ stats.shown }} log mới nhất trong {{ stats.total }} log.
      </p>
      <button class="btn-soft h-8 px-3 text-xs" :disabled="loading" type="button" @click="$emit('refresh')">
        <RefreshCcw class="h-3.5 w-3.5" />
        Làm mới log
      </button>
    </div>
    <div class="app-scrollbar max-h-80 space-y-2 overflow-auto pr-1">
      <article v-for="log in logs" :key="log._id" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="truncate font-bold">{{ log.accountLabel }} · {{ log.actionLabel }}</p>
          <span :class="['rounded-full px-2 py-1 text-xs font-bold uppercase', log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
            {{ log.levelLabel }}
          </span>
        </div>
        <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{{ log.message }}</p>
        <p class="mt-2 text-xs text-zinc-500">{{ formatDate(log.createdAt) }}</p>
      </article>
      <p v-if="!logs.length" class="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
        Chưa có log kỹ thuật.
      </p>
    </div>
  </div>
</template>
