<script setup>
import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-vue-next';

defineProps({
  summary: {
    type: Object,
    default: null
  }
});
</script>

<template>
  <div v-if="summary" class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
    <div class="flex items-start gap-3">
      <CheckCircle2 v-if="summary.tone === 'ok'" class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
      <Clock3 v-else-if="summary.tone === 'run'" class="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
      <AlertTriangle v-else class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div>
        <p class="font-extrabold">{{ summary.title }}</p>
        <p class="mt-1 text-sm leading-6 text-zinc-500">{{ summary.detail }}</p>
      </div>
    </div>
  </div>
</template>
