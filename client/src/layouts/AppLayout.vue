<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BarChart3, CalendarClock, CheckCircle2, LayoutDashboard, LogOut, Menu, MonitorSmartphone, Moon, PenLine, Settings, Share2, Sparkles, Sun, X } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import Toast from '../components/Toast.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const mobileOpen = ref(false);

const nav = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/create', label: 'Tạo bài viết', icon: PenLine },
  { to: '/scheduled', label: 'Bài đã lên lịch', icon: CalendarClock },
  { to: '/published', label: 'Bài đã đăng', icon: CheckCircle2 },
  { to: '/ai-generator', label: 'Tạo nội dung AI', icon: Sparkles },
  { to: '/platforms', label: 'Nền tảng', icon: Share2 },
  { to: '/mobile-lab', label: 'Mobile ảo', icon: MonitorSmartphone },
  { to: '/analytics', label: 'Phân tích', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', icon: Settings }
];

const title = computed(() => nav.find((item) => item.to === route.path)?.label || 'Tổng quan');

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen bg-mist dark:bg-zinc-950">
    <aside :class="['fixed inset-y-0 left-0 z-40 w-72 border-r border-zinc-200 bg-white p-4 transition dark:border-zinc-800 dark:bg-zinc-950 lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full']">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xl font-extrabold">SocialPilot AI</p>
          <p class="text-sm text-zinc-500">Tự động hóa sáng tạo</p>
        </div>
        <button class="btn-soft h-9 w-9 p-0 lg:hidden" @click="mobileOpen = false"><X class="h-4 w-4" /></button>
      </div>
      <nav class="mt-8 space-y-1">
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to" @click="mobileOpen = false" :class="['flex items-center gap-3 rounded-lg px-3 py-3 text-base font-semibold transition', route.path === item.to ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900']">
          <component :is="item.icon" class="h-5 w-5" />
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="absolute bottom-4 left-4 right-4 space-y-2">
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
              <p class="text-sm text-zinc-500">Lên ý tưởng, tạo nội dung, đặt lịch và đăng bài trong một quy trình.</p>
            </div>
          </div>
          <RouterLink to="/create" class="btn-primary hidden sm:inline-flex">
            <PenLine class="h-4 w-4" />
            Bài viết mới
          </RouterLink>
        </div>
      </header>
      <div class="p-4 sm:p-8">
        <RouterView />
      </div>
    </main>
    <Toast />
  </div>
</template>
