<script setup>
defineProps({
  items: {
    type: Array,
    default: () => []
  },
  stats: {
    type: Object,
    required: true
  },
  progressPercent: {
    type: Number,
    default: 0
  }
});

function statusLabel(status) {
  if (status === 'done') return 'xong';
  if (status === 'failed') return 'lỗi';
  if (status === 'review') return 'kiểm tra';
  if (status === 'running') return 'đang chạy';
  if (status === 'waiting') return 'đợi';
  return 'chờ';
}
</script>

<template>
  <div v-if="items.length" class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Tiến trình đăng</p>
        <h3 class="mt-1 font-extrabold">{{ stats.done }} xong · {{ stats.review }} cần kiểm tra · {{ stats.failed }} lỗi</h3>
      </div>
      <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        {{ stats.total }} lượt
      </span>
    </div>
    <div class="mb-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
      <div class="h-full rounded-full bg-sky-500 transition-all" :style="{ width: `${progressPercent}%` }"></div>
    </div>
    <div class="app-scrollbar max-h-64 space-y-2 overflow-auto pr-1">
      <article v-for="item in items" :key="item.id" class="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-extrabold">{{ item.name }}</p>
            <p class="truncate text-xs text-zinc-500">{{ item.instanceName }}</p>
          </div>
          <span
            :class="[
              'rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase',
              item.status === 'done' ? 'bg-emerald-100 text-emerald-700' : item.status === 'failed' ? 'bg-red-100 text-red-700' : item.status === 'review' ? 'bg-amber-100 text-amber-700' : item.status === 'running' ? 'bg-sky-100 text-sky-700' : 'bg-zinc-100 text-zinc-700'
            ]"
          >
            {{ statusLabel(item.status) }}
          </span>
        </div>
        <p class="mt-2 text-zinc-500">{{ item.message }}</p>
        <div
          v-if="item.result?.screenshot?.imageBase64"
          class="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800"
        >
          <div class="flex items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1.5 text-[10px] font-extrabold uppercase text-zinc-400">
            <span>Ảnh kiểm tra</span>
            <span>{{ item.result.screenshotVerified ? 'Đã xác minh' : 'Chưa xác minh' }}</span>
          </div>
          <img
            :src="`data:image/png;base64,${item.result.screenshot.imageBase64}`"
            alt="Ảnh kiểm tra hàng loạt"
            class="max-h-56 w-full object-contain"
          />
        </div>
      </article>
    </div>
  </div>
</template>
