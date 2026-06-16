<script setup>
import Toast from '../components/Toast.vue';
</script>

<template>
  <div class="min-h-screen bg-mist dark:bg-zinc-950">
    <header class="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85 sm:px-8">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold">Đăng bài mạng xã hội</h1>
        </div>
      </div>
    </header>
    <main>
      <div>
        <RouterView />
      </div>
    </main>
    <Toast />
  </div>
</template>
