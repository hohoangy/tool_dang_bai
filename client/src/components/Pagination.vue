<script setup>
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
defineProps({ page: Number, total: Number });
defineEmits(['prev', 'next']);
</script>

<template>
  <div class="flex items-center justify-between text-sm text-zinc-500">
    <span>Trang {{ page }} / {{ total }}</span>
    <div class="flex gap-2">
      <button class="btn-soft h-9 w-9 p-0" @click="$emit('prev')" aria-label="Trang trước"><ChevronLeft class="h-4 w-4" /></button>
      <button class="btn-soft h-9 w-9 p-0" @click="$emit('next')" aria-label="Trang sau"><ChevronRight class="h-4 w-4" /></button>
    </div>
  </div>
</template>
