<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { CheckCircle2, Link2, ShieldAlert } from 'lucide-vue-next';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';
import { useUiStore } from '../stores/ui';
import { publishingPlatforms } from '../config/platforms';

const accounts = ref([]);
const ui = useUiStore();
const route = useRoute();
const platforms = publishingPlatforms;

const statusLabels = {
  connected: 'Đã kết nối',
  designed: 'Đã thiết kế',
  disconnected: 'Chưa kết nối'
};

const accountsByPlatform = computed(() =>
  accounts.value.reduce((map, account) => {
    if (!map[account.platform]) map[account.platform] = [];
    map[account.platform].push(account);
    return map;
  }, {})
);

async function load() {
  const { data } = await http.get('/social/accounts');
  accounts.value = data.accounts;
}

function getAvatar(account) {
  return account?.metadata?.profile?.profile_image_url || account?.metadata?.profile?.picture || '';
}

function getDisplayName(account) {
  return account?.accountName || account?.metadata?.profile?.name || '';
}

async function mockConnect(platform) {
  await http.post('/social/mock-connect', { platform });
  ui.notify(`${platform} đã được kết nối ở chế độ demo.`);
  await load();
}

async function connect(platform) {
  const endpoints = {
    facebook: '/social/connect-facebook',
    x: '/social/connect-x',
    youtube: '/social/connect-youtube'
  };

  if (endpoints[platform]) {
    const { data } = await http.get(endpoints[platform]);
    if (data.url) {
      window.location.href = data.url;
      return;
    }
  }

  await mockConnect(platform);
}

onMounted(async () => {
  if (route.query.x === 'connected') ui.notify('X.com đã kết nối thành công.');
  if (route.query.facebook === 'connected') {
    const pageCount = Number(route.query.pages || 0);
    ui.notify(pageCount > 1 ? `${pageCount} Facebook Pages đã kết nối thành công.` : 'Facebook Page đã kết nối thành công.');
  }
  if (route.query.facebook === 'missing-page') ui.notify('Không tìm thấy Facebook Page có thể kết nối.');
  if (route.query.facebook === 'oauth-error') ui.notify('Kết nối Facebook chưa hoàn tất. Vui lòng thử lại.');
  await load();
});
</script>

<template>
  <div class="space-y-5">
    <BaseCard>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-extrabold uppercase text-zinc-500">Publishing channels</p>
          <h2 class="mt-1 text-2xl font-extrabold">Kết nối kênh đăng chính thức</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Mỗi kênh có provider riêng, token riêng và trạng thái riêng. Luồng dài hạn là đăng tự động qua API, còn mobile chỉ dùng cho fallback khi nền tảng không mở API phù hợp.
          </p>
        </div>
        <RouterLink to="/create" class="btn-primary">
          <Link2 class="h-4 w-4" />
          Tạo bài đa kênh
        </RouterLink>
      </div>
    </BaseCard>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <BaseCard v-for="platform in platforms" :key="platform.id">
        <div class="flex items-start justify-between gap-3">
          <span :class="['grid h-11 w-11 place-items-center rounded-lg text-white', platform.bg]">
            <component :is="platform.icon" class="h-5 w-5" />
          </span>
          <img
            v-if="getAvatar(accountsByPlatform[platform.id]?.[0])"
            :src="getAvatar(accountsByPlatform[platform.id]?.[0])"
            :alt="getDisplayName(accountsByPlatform[platform.id]?.[0])"
            class="h-11 w-11 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-700"
          />
        </div>
        <h3 class="mt-4 text-xl font-bold">{{ platform.name }}</h3>
        <p class="mt-2 text-sm text-zinc-500">{{ platform.capability }}</p>
        <div class="mt-4 flex items-center gap-2 text-sm font-bold">
          <CheckCircle2 v-if="accountsByPlatform[platform.id]?.length" class="h-4 w-4 text-emerald-500" />
          <ShieldAlert v-else class="h-4 w-4 text-amber-500" />
          <span>{{ accountsByPlatform[platform.id]?.length ? `${accountsByPlatform[platform.id].length} kết nối` : 'Chưa có kết nối thật' }}</span>
        </div>

        <div v-if="accountsByPlatform[platform.id]?.length" class="mt-3 space-y-2">
          <div
            v-for="account in accountsByPlatform[platform.id]"
            :key="account._id"
            class="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          >
            <p class="truncate font-semibold">{{ getDisplayName(account) }}</p>
            <p class="mt-1 text-xs text-zinc-500">{{ statusLabels[account.status] || account.status }}</p>
          </div>
        </div>
        <button class="btn-soft mt-5 w-full" @click="connect(platform.id)">
          {{ accountsByPlatform[platform.id]?.length ? 'Kết nối lại' : 'Kết nối' }}
        </button>
      </BaseCard>
    </div>
  </div>
</template>
