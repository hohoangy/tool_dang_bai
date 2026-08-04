<script setup>
import { Terminal } from 'lucide-vue-next';

defineProps({
  logs: {
    type: Array,
    default: () => []
  },
  platformLabel: {
    type: String,
    required: true
  },
  formatDate: {
    type: Function,
    required: true
  }
});
</script>

<template>
  <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <div class="mb-3 flex items-center gap-2">
      <Terminal class="h-4 w-4 text-zinc-500" />
      <h3 class="font-extrabold">Kết quả đăng gần nhất</h3>
    </div>
    <div class="space-y-2">
      <article v-for="log in logs" :key="log._id" class="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <p class="min-w-0 flex-1 font-bold leading-5">{{ log.summary.title }}</p>
          <span :class="['shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase leading-none', log.summary.tone === 'error' ? 'bg-red-100 text-red-700' : log.summary.tone === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
            {{ log.summary.badge }}
          </span>
        </div>
        <p class="mt-1 line-clamp-2 text-zinc-500">{{ log.summary.detail }}</p>
        <p class="mt-2 text-xs text-zinc-500">{{ formatDate(log.createdAt) }}</p>
      </article>
      <p v-if="!logs.length" class="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
        Chưa có kết quả đăng {{ platformLabel }}.
      </p>
    </div>
  </div>
</template>
