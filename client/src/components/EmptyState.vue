<script setup>
defineProps({ title: String, description: String });
</script>

<template>
  <div class="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
    <h3 class="text-lg font-bold">{{ title }}</h3>
    <p class="mt-2 text-sm text-zinc-500">{{ description }}</p>
    <div class="mt-5">
      <slot />
    </div>
  </div>
</template>
