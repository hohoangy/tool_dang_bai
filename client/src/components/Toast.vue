<script setup>
import { useUiStore } from '../stores/ui';
const ui = useUiStore();
</script>

<template>
  <Transition enter-active-class="transition duration-200" enter-from-class="translate-y-3 opacity-0" leave-active-class="transition duration-150" leave-to-class="translate-y-3 opacity-0">
    <div v-if="ui.toast" class="fixed bottom-5 right-5 z-50 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold shadow-soft dark:border-zinc-800 dark:bg-zinc-900">
      {{ ui.toast.message }}
    </div>
  </Transition>
</template>
