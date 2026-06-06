<script setup>
import { computed, ref } from 'vue';
import { Inbox, MessageSquare, RefreshCcw, Send, ShieldCheck } from 'lucide-vue-next';
import BaseCard from '../components/BaseCard.vue';
import { publishingPlatforms } from '../config/platforms';

const selectedPlatform = ref('facebook');
const activePlatform = computed(() => publishingPlatforms.find((platform) => platform.id === selectedPlatform.value));

const workflow = [
  ['Thu thập', 'Đồng bộ bình luận từ bài đã đăng theo từng nền tảng.'],
  ['Phân loại', 'Gắn nhãn cần phản hồi, spam, khách hàng tiềm năng hoặc đã xử lý.'],
  ['Phản hồi', 'Dùng mẫu trả lời hoặc AI suggestion, có duyệt trước khi gửi.'],
  ['Đo lường', 'Theo dõi tốc độ phản hồi, sentiment và chủ đề nổi bật.']
];
</script>

<template>
  <div class="space-y-5">
    <BaseCard>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-extrabold uppercase text-zinc-500">Roadmap tương tác</p>
          <h2 class="mt-1 text-2xl font-extrabold">Bình luận / Inbox đa kênh</h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Đây là lớp tiếp theo sau đăng tự động: gom comment từ X, Facebook, YouTube và TikTok về một hàng xử lý, có phân loại, phản hồi và thống kê.
          </p>
        </div>
        <button class="btn-soft">
          <RefreshCcw class="h-4 w-4" />
          Đồng bộ thử
        </button>
      </div>
    </BaseCard>

    <div class="grid gap-5 xl:grid-cols-[320px_1fr]">
      <BaseCard>
        <h3 class="mb-3 text-lg font-extrabold">Kênh theo dõi</h3>
        <div class="space-y-2">
          <button
            v-for="platform in publishingPlatforms"
            :key="platform.id"
            class="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-3 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            :class="selectedPlatform === platform.id ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950' : ''"
            @click="selectedPlatform = platform.id"
          >
            <span class="flex min-w-0 items-center gap-3">
              <component :is="platform.icon" class="h-4 w-4 shrink-0" />
              <span class="truncate font-bold">{{ platform.name }}</span>
            </span>
            <span class="text-xs font-bold opacity-70">0</span>
          </button>
        </div>
      </BaseCard>

      <div class="space-y-5">
        <BaseCard>
          <div class="flex items-center gap-3">
            <span :class="['grid h-11 w-11 place-items-center rounded-lg text-white', activePlatform?.bg || 'bg-zinc-950']">
              <component :is="activePlatform?.icon || Inbox" class="h-5 w-5" />
            </span>
            <div>
              <h3 class="text-xl font-extrabold">{{ activePlatform?.name }} interaction queue</h3>
              <p class="text-sm text-zinc-500">Chưa kết nối API bình luận thật cho kênh này.</p>
            </div>
          </div>

          <div class="mt-5 grid gap-3 md:grid-cols-3">
            <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <MessageSquare class="h-5 w-5 text-zinc-500" />
              <p class="mt-3 text-2xl font-extrabold">0</p>
              <p class="text-sm text-zinc-500">Cần phản hồi</p>
            </div>
            <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <ShieldCheck class="h-5 w-5 text-zinc-500" />
              <p class="mt-3 text-2xl font-extrabold">0</p>
              <p class="text-sm text-zinc-500">Đã phân loại</p>
            </div>
            <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <Send class="h-5 w-5 text-zinc-500" />
              <p class="mt-3 text-2xl font-extrabold">0</p>
              <p class="text-sm text-zinc-500">Đã phản hồi</p>
            </div>
          </div>
        </BaseCard>

        <BaseCard>
          <h3 class="mb-4 text-lg font-extrabold">Luồng triển khai chuyên nghiệp</h3>
          <div class="grid gap-3 md:grid-cols-4">
            <div v-for="item in workflow" :key="item[0]" class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p class="font-extrabold">{{ item[0] }}</p>
              <p class="mt-2 text-sm leading-6 text-zinc-500">{{ item[1] }}</p>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>
  </div>
</template>
