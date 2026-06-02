<script setup>
defineProps({ post: Object });
</script>

<template>
  <article class="rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950">
    <div class="mb-4 flex items-center justify-between">
      <span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase text-blue-700 dark:bg-blue-950 dark:text-blue-200">{{ post?.platform || 'nền tảng' }}</span>
      <span class="text-xs text-zinc-500">{{ post?.tone || 'giọng văn' }}</span>
    </div>
    <img
      v-if="post?.media?.imageUrl"
      :src="post.media.imageUrl"
      :alt="post.media.altText || post.title || 'Ảnh bài viết'"
      class="mb-4 aspect-video w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
    />
    <h3 class="text-lg font-bold">{{ post?.content?.hook || 'Câu mở đầu 3 giây sẽ hiển thị ở đây.' }}</h3>
    <p class="mt-3 whitespace-pre-line text-base leading-7 text-zinc-700 dark:text-zinc-300">{{ post?.content?.caption || 'Tạo hoặc nhập nội dung để xem trước theo thời gian thực.' }}</p>
    <div class="mt-4 flex flex-wrap gap-2">
      <span v-for="tag in post?.content?.hashtags || []" :key="tag" class="rounded-full bg-white px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{{ tag }}</span>
    </div>
    <p class="mt-4 font-semibold">{{ post?.content?.cta || 'Xem trước lời kêu gọi hành động' }}</p>
  </article>
</template>
