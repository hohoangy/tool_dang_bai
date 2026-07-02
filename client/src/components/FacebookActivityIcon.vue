<script setup>
import { computed } from 'vue';
import { Instagram } from 'lucide-vue-next';

const props = defineProps({
  size: {
    type: String,
    default: 'sm'
  },
  platform: {
    type: String,
    default: 'facebook'
  }
});

const isInstagram = computed(() => props.platform === 'instagram');
const iconClass = computed(() => (isInstagram.value
  ? 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]'
  : 'bg-[#1877F2]'));
const ringClass = computed(() => (isInstagram.value ? 'border-[#DD2A7B]/55' : 'border-[#1877F2]/55'));
</script>

<template>
  <span
    :class="[
      'relative inline-grid shrink-0 place-items-center rounded-full text-white shadow-sm',
      iconClass,
      size === 'lg' ? 'h-14 w-14' : size === 'md' ? 'h-7 w-7' : 'h-5 w-5'
    ]"
    aria-hidden="true"
  >
    <span :class="['absolute inset-[-3px] animate-ping rounded-full border', ringClass]"></span>
    <Instagram
      v-if="isInstagram"
      :class="['relative', size === 'lg' ? 'h-7 w-7' : size === 'md' ? 'h-4 w-4' : 'h-3 w-3']"
    />
    <span v-else :class="['relative font-black leading-none', size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-base' : 'text-xs']">f</span>
  </span>
</template>
