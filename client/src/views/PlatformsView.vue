<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Facebook, Play, Plus, Youtube } from 'lucide-vue-next';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';
import { useUiStore } from '../stores/ui';

const accounts = ref([]);
const ui = useUiStore();
const route = useRoute();
const platforms = [
  { id: 'facebook', name: 'Trang Facebook', icon: Facebook },
  { id: 'x', name: 'X.com', icon: Plus },
  { id: 'youtube', name: 'YouTube', icon: Youtube },
  { id: 'tiktok', name: 'Mô-đun TikTok', icon: Play }
];

const statusLabels = {
  connected: 'Đã kết nối',
  designed: 'Đã thiết kế',
  disconnected: 'Chưa kết nối'
};

const accountsByPlatform = computed(() =>
  accounts.value.reduce((map, account) => {
    map[account.platform] = account;
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
  if (route.query.facebook === 'connected') ui.notify('Facebook Page đã kết nối thành công.');
  await load();
});
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <BaseCard v-for="platform in platforms" :key="platform.id">
      <div class="flex items-start justify-between gap-3">
        <component :is="platform.icon" class="h-7 w-7" />
        <img
          v-if="getAvatar(accountsByPlatform[platform.id])"
          :src="getAvatar(accountsByPlatform[platform.id])"
          :alt="getDisplayName(accountsByPlatform[platform.id])"
          class="h-11 w-11 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-700"
        />
      </div>
      <h3 class="mt-4 text-xl font-bold">{{ platform.name }}</h3>
      <p class="mt-2 text-sm text-zinc-500">{{ statusLabels[accountsByPlatform[platform.id]?.status] || 'Chưa kết nối' }}</p>
      <p v-if="getDisplayName(accountsByPlatform[platform.id])" class="mt-2 truncate text-sm font-semibold">
        {{ getDisplayName(accountsByPlatform[platform.id]) }}
      </p>
      <button class="btn-soft mt-5 w-full" @click="connect(platform.id)">
        {{ accountsByPlatform[platform.id]?.status === 'connected' ? 'Kết nối lại' : 'Kết nối' }}
      </button>
    </BaseCard>
  </div>
</template>
