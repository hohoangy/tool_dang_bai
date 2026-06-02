<script setup>
import BaseCard from '../components/BaseCard.vue';
import { useUiStore } from '../stores/ui';
const ui = useUiStore();
</script>

<template>
  <div class="max-w-3xl space-y-4">
    <BaseCard>
      <h2 class="text-xl font-bold">Cài đặt không gian làm việc</h2>
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <label class="space-y-2">
          <span class="text-sm font-semibold text-zinc-500">Giọng văn mặc định</span>
          <select class="field">
            <option>Lan truyền</option>
            <option>Kể chuyện</option>
            <option>Truyền cảm hứng</option>
          </select>
        </label>
        <label class="space-y-2">
          <span class="text-sm font-semibold text-zinc-500">Múi giờ</span>
          <input class="field" value="Asia/Saigon" />
        </label>
      </div>
      <div class="mt-5 flex items-center justify-between rounded-lg bg-zinc-50 p-4 dark:bg-zinc-950">
        <div>
          <p class="font-bold">Chế độ tối</p>
          <p class="text-sm text-zinc-500">Giữ giao diện dễ nhìn khi lập kế hoạch trong thời gian dài.</p>
        </div>
        <button class="btn-soft" @click="ui.toggleDark">{{ ui.dark ? 'Bật' : 'Tắt' }}</button>
      </div>
    </BaseCard>
  </div>
</template>
