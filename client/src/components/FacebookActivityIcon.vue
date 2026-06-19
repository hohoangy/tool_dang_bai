<script setup>
defineProps({
  size: {
    type: String,
    default: 'sm'
  }
});
</script>

<template>
  <span
    :class="[
      'relative inline-grid shrink-0 place-items-center rounded-full bg-[#1877F2] text-white shadow-sm',
      size === 'lg' ? 'h-14 w-14' : size === 'md' ? 'h-7 w-7' : 'h-5 w-5'
    ]"
    aria-hidden="true"
  >
    <span class="absolute inset-[-3px] animate-ping rounded-full border border-[#1877F2]/55"></span>
    <span :class="['relative font-black leading-none', size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-base' : 'text-xs']">f</span>
  </span>
</template>
