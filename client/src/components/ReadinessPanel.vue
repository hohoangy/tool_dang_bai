<script setup>
import { AlertTriangle, CheckCircle2 } from 'lucide-vue-next';

const props = defineProps({
  tone: {
    type: String,
    default: 'idle'
  },
  label: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    required: true
  },
  summary: {
    type: String,
    required: true
  },
  preflightItems: {
    type: Array,
    default: () => []
  },
  actions: {
    type: Array,
    default: () => []
  }
});

function hasBlockedPreflight() {
  return props.preflightItems.some((item) => item.blocking && !item.ok);
}
</script>

<template>
  <div class="space-y-3">
    <div
      :class="[
        'overflow-hidden rounded-2xl border shadow-sm',
        tone === 'ok' ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/10' : tone === 'warn' ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/10' : tone === 'run' ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/10' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/20'
      ]"
    >
      <div class="border-b border-black/5 p-4 dark:border-white/10">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Publish readiness</p>
            <h3 class="mt-1 text-xl font-black">{{ label }}</h3>
          </div>
          <span
            :class="[
              'shrink-0 rounded-full px-3 py-1 text-xs font-extrabold uppercase',
              tone === 'ok' ? 'bg-emerald-100 text-emerald-700' : tone === 'warn' ? 'bg-amber-100 text-amber-700' : tone === 'run' ? 'bg-sky-100 text-sky-700' : 'bg-zinc-100 text-zinc-700'
            ]"
          >
            {{ score }}%
          </span>
        </div>
        <p class="mt-2 text-sm leading-5 text-zinc-500">{{ summary }}</p>
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            :class="[
              'h-full rounded-full transition-all',
              hasBlockedPreflight() ? 'bg-amber-400' : 'bg-emerald-500'
            ]"
            :style="{ width: `${score}%` }"
          ></div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800">
        <div
          v-for="item in preflightItems"
          :key="item.label"
          class="bg-white p-3 text-sm dark:bg-zinc-950"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="truncate text-xs font-extrabold uppercase tracking-wide text-zinc-500">{{ item.label }}</p>
            <CheckCircle2 v-if="item.ok" class="h-4 w-4 shrink-0 text-emerald-500" />
            <AlertTriangle v-else class="h-4 w-4 shrink-0 text-amber-500" />
          </div>
          <p class="line-clamp-2 text-xs leading-5 text-zinc-500">{{ item.detail }}</p>
        </div>
      </div>
    </div>

    <div v-if="actions.length" class="rounded-2xl border border-zinc-200 p-4 shadow-sm dark:border-zinc-800">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Pre-publish tasks</p>
          <h3 class="mt-1 font-extrabold">Việc cần làm</h3>
        </div>
        <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {{ actions.length }} mục
        </span>
      </div>
      <div class="space-y-2">
        <div
          v-for="action in actions"
          :key="action.title"
          class="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span
            :class="[
              'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black',
              action.tone === 'required' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
            ]"
          >
            {{ action.tone === 'required' ? '!' : 'i' }}
          </span>
          <div class="min-w-0">
            <p class="font-extrabold">{{ action.title }}</p>
            <p class="mt-1 text-xs leading-5 text-zinc-500">{{ action.detail }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
