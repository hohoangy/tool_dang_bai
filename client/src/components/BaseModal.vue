<script setup>
import { X } from 'lucide-vue-next';
defineProps({ open: Boolean, title: String });
defineEmits(['close']);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
    <div class="panel w-full max-w-xl p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-xl font-bold">{{ title }}</h2>
        <button class="btn-soft h-9 w-9 p-0" @click="$emit('close')" aria-label="Đóng">
          <X class="h-4 w-4" />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>
