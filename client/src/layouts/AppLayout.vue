<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LogOut, Menu, MonitorSmartphone, Moon, Sun, X } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import Toast from '../components/Toast.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const mobileOpen = ref(false);

const navGroups = [
  {
    label: 'Tool chính',
    items: [
      { to: '/mobile-lab', label: 'Automation Studio', icon: MonitorSmartphone }
    ]
  }
];

const allNavItems = computed(() => navGroups.flatMap((group) => group.items));
const title = computed(() => allNavItems.value.find((item) => item.to === route.path)?.label || 'Automation Studio');
const subtitle = computed(() => 'Đăng bài trực tiếp qua app thật trong LDPlayer: Facebook, X, TikTok, Instagram...');

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen bg-mist dark:bg-zinc-950">
    <aside :class="['fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-zinc-200 bg-white p-4 transition dark:border-zinc-800 dark:bg-zinc-950 lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full']">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xl font-extrabold">Social Auto Studio</p>
          <p class="text-sm text-zinc-500">LDPlayer automation</p>
        </div>
        <button class="btn-soft h-9 w-9 p-0 lg:hidden" @click="mobileOpen = false"><X class="h-4 w-4" /></button>
      </div>
      <nav class="mt-7 flex-1 space-y-5 overflow-y-auto pb-4 pr-1">
        <div v-for="group in navGroups" :key="group.label">
          <p class="mb-2 px-3 text-[11px] font-extrabold uppercase text-zinc-400">{{ group.label }}</p>
          <div class="space-y-1">
            <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" @click="mobileOpen = false" :class="['flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition', route.path === item.to ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900']">
              <component :is="item.icon" class="h-4 w-4 shrink-0" />
              <span class="min-w-0 truncate">{{ item.label }}</span>
            </RouterLink>
          </div>
        </div>
      </nav>
      <div class="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button class="btn-soft w-full justify-start" @click="ui.toggleDark">
          <component :is="ui.dark ? Sun : Moon" class="h-4 w-4" />
          {{ ui.dark ? 'Chế độ sáng' : 'Chế độ tối' }}
        </button>
        <button class="btn-soft w-full justify-start" @click="logout">
          <LogOut class="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </aside>

    <main class="lg:pl-72">
      <header class="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85 sm:px-8">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button class="btn-soft h-10 w-10 p-0 lg:hidden" @click="mobileOpen = true"><Menu class="h-5 w-5" /></button>
            <div>
              <h1 class="text-2xl font-extrabold">{{ title }}</h1>
              <p class="text-sm text-zinc-500">{{ subtitle }}</p>
            </div>
          </div>
        </div>
      </header>
      <div class="p-4 sm:p-8">
        <RouterView />
      </div>
    </main>
    <Toast />
  </div>
</template>
