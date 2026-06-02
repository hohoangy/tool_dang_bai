<script setup>
import { onMounted, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const loading = ref(true);
const stats = ref({});
const recentPosts = ref([]);

const chartData = {
  labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
  datasets: [{ label: 'Đã đăng', data: [3, 5, 2, 6, 4, 7, 5], backgroundColor: '#2563eb', borderRadius: 8 }]
};

const statusLabels = {
  draft: 'Bản nháp',
  queued: 'Đang chờ',
  scheduled: 'Đã lên lịch',
  published: 'Đã đăng',
  failed: 'Thất bại'
};

onMounted(async () => {
  const { data } = await http.get('/dashboard');
  stats.value = data.stats;
  recentPosts.value = data.recentPosts;
  loading.value = false;
});
</script>

<template>
  <LoadingSkeleton v-if="loading" />
  <div v-else class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <BaseCard v-for="card in [
        ['Tổng bài viết', stats.totalPosts],
        ['Đang chờ', stats.queuedPosts],
        ['Thất bại', stats.failedPosts],
        ['Đã đăng hôm nay', stats.publishedToday]
      ]" :key="card[0]">
        <p class="text-sm font-semibold text-zinc-500">{{ card[0] }}</p>
        <p class="mt-3 text-4xl font-extrabold">{{ card[1] }}</p>
      </BaseCard>
    </div>

    <div class="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <BaseCard>
        <div class="mb-5 flex items-center justify-between">
          <h2 class="text-xl font-bold">Nhịp đăng bài</h2>
          <span class="text-sm text-zinc-500">Tuần này</span>
        </div>
        <Bar :data="chartData" :options="{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }" />
      </BaseCard>
      <BaseCard>
        <h2 class="mb-4 text-xl font-bold">Nội dung gần đây</h2>
        <div class="space-y-3">
          <div v-for="post in recentPosts" :key="post._id" class="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-950">
            <div class="flex items-center justify-between gap-4">
              <p class="font-bold">{{ post.title }}</p>
              <span class="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">{{ statusLabels[post.status] || post.status }}</span>
            </div>
            <p class="mt-1 text-sm text-zinc-500">{{ post.platform }} · {{ post.tone }}</p>
          </div>
        </div>
      </BaseCard>
    </div>
  </div>
</template>
