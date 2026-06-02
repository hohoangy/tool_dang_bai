<script setup>
import { onMounted, watch } from 'vue';
import { usePostsStore } from '../stores/posts';
import DataTable from '../components/DataTable.vue';
import EmptyState from '../components/EmptyState.vue';
import Pagination from '../components/Pagination.vue';

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

onMounted(() => posts.fetchPosts(props.status));
watch(() => props.status, () => posts.fetchPosts(props.status));
</script>

<template>
  <div class="space-y-4">
    <DataTable v-if="posts.posts.length" :columns="columns" :rows="posts.posts">
      <template #title="{ row }">
        <p class="font-bold">{{ row.title }}</p>
        <p class="mt-1 line-clamp-1 text-sm text-zinc-500">{{ row.content.caption }}</p>
      </template>
      <template #scheduledAt="{ row }">{{ row.scheduledAt ? new Date(row.scheduledAt).toLocaleString() : '-' }}</template>
      <template #tone="{ row }">{{ toneLabels[row.tone] || row.tone || '-' }}</template>
      <template #status="{ row }">
        <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold uppercase dark:bg-zinc-800">{{ statusLabels[row.status] || row.status }}</span>
      </template>
    </DataTable>
    <EmptyState v-else title="Chưa có bài viết" description="Tạo hoặc sinh nội dung để đưa vào hàng chờ.">
      <RouterLink to="/create" class="btn-primary">Tạo bài viết</RouterLink>
    </EmptyState>
    <Pagination :page="1" :total="1" />
  </div>
</template>
