<script setup>
import { onMounted, watch } from 'vue';
import { usePostsStore } from '../stores/posts';
import DataTable from '../components/DataTable.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';
import { platformMap } from '../config/platforms';

const props = defineProps({ status: String });
const posts = usePostsStore();
const columns = [
  { key: 'title', label: 'Bài viết' },
  { key: 'platform', label: 'Nền tảng' },
  { key: 'tone', label: 'Giọng văn' },
  { key: 'scheduledAt', label: 'Thời gian' },
  { key: 'status', label: 'Trạng thái' }
];

const statusLabels = {
  draft: 'Bản nháp',
  queued: 'Đang chờ',
  scheduled: 'Đã lên lịch',
  published: 'Đã đăng',
  failed: 'Thất bại'
};

const toneLabels = {
  viral: 'Lan truyền',
  storytelling: 'Kể chuyện',
  inspirational: 'Truyền cảm hứng',
  professional: 'Chuyên nghiệp',
  casual: 'Thân mật'
};

const statusClasses = {
  draft: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  queued: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200'
};

onMounted(() => posts.fetchPosts(props.status));
watch(() => props.status, () => posts.fetchPosts(props.status));
</script>

<template>
  <div class="space-y-4">
    <DataTable v-if="posts.posts.length" :columns="columns" :rows="posts.posts">
      <template #title="{ row }">
        <p class="font-bold">{{ row.title }}</p>
        <p class="mt-1 line-clamp-1 text-sm text-zinc-500">{{ row.errorMessage || row.content.caption }}</p>
      </template>
      <template #platform="{ row }">
        <span class="inline-flex items-center gap-2 font-bold">
          <component :is="platformMap[row.platform]?.icon" class="h-4 w-4" />
          {{ platformMap[row.platform]?.name || row.platform }}
        </span>
      </template>
      <template #scheduledAt="{ row }">{{ row.scheduledAt ? new Date(row.scheduledAt).toLocaleString() : '-' }}</template>
      <template #tone="{ row }">{{ toneLabels[row.tone] || row.tone || '-' }}</template>
      <template #status="{ row }">
        <span :class="['rounded-full px-3 py-1 text-xs font-bold uppercase', statusClasses[row.status] || statusClasses.draft]">{{ statusLabels[row.status] || row.status }}</span>
      </template>
    </DataTable>
    <EmptyState v-else title="Chưa có bài viết" description="Tạo hoặc sinh nội dung để đưa vào hàng chờ.">
      <RouterLink to="/create" class="btn-primary">Tạo bài viết</RouterLink>
    </EmptyState>
    <Pagination :page="1" :total="1" />
  </div>
</template>
