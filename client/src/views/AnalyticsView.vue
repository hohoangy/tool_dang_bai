<script setup>
import { onMounted, ref } from 'vue';
import { Line } from 'vue-chartjs';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

const totals = ref({});
const chartData = ref({ labels: [], datasets: [] });

onMounted(async () => {
  const { data } = await http.get('/analytics');
  totals.value = data.totals;
  chartData.value = {
    labels: data.series.map((item) => ({ Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7', Sun: 'CN' }[item.day] || item.day)),
    datasets: [{ label: 'Tương tác', data: data.series.map((item) => item.engagement), borderColor: '#2563eb', tension: 0.35 }]
  };
});
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-4">
      <BaseCard v-for="item in [['Lượt hiển thị', totals.impressions], ['Lượt thích', totals.likes], ['Bình luận', totals.comments], ['Chia sẻ', totals.shares]]" :key="item[0]">
        <p class="text-sm font-semibold text-zinc-500">{{ item[0] }}</p>
        <p class="mt-3 text-3xl font-extrabold">{{ item[1] || 0 }}</p>
      </BaseCard>
    </div>
    <BaseCard>
      <h2 class="mb-5 text-xl font-bold">Xu hướng tương tác</h2>
      <Line :data="chartData" :options="{ responsive: true, plugins: { legend: { display: false } } }" />
    </BaseCard>
  </div>
</template>
