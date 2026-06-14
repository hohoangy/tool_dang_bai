<script setup>
import { useRouter } from 'vue-router';
import { LogOut, Moon, Sun } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import Toast from '../components/Toast.vue';

const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen bg-mist dark:bg-zinc-950">
    <header class="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85 sm:px-8">
      <div class="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold">Đăng bài Facebook</h1>
          <p class="text-sm text-zinc-500">Đăng bài trực tiếp qua ứng dụng Facebook trong LDPlayer.</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-soft h-10 px-3" title="Đổi giao diện" @click="ui.toggleDark">
            <component :is="ui.dark ? Sun : Moon" class="h-4 w-4" />
            <span class="hidden sm:inline">{{ ui.dark ? 'Chế độ sáng' : 'Chế độ tối' }}</span>
          </button>
          <button class="btn-soft h-10 px-3" @click="logout">
            <LogOut class="h-4 w-4" />
            <span class="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
    <main>
      <div class="mx-auto max-w-[1600px] p-4 sm:p-8">
        <RouterView />
      </div>
    </main>
    <Toast />
  </div>
</template>
