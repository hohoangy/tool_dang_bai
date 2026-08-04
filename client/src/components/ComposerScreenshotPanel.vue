<script setup>
defineProps({
  screenshotSrc: {
    type: String,
    default: ''
  },
  verified: {
    type: Boolean,
    default: false
  },
  submitVerifiedWithoutScreenshot: {
    type: Boolean,
    default: false
  },
  restoredInfo: {
    type: Object,
    default: null
  },
  formatDate: {
    type: Function,
    required: true
  }
});
</script>

<template>
  <div v-if="screenshotSrc && verified" class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
    <div class="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
      <span class="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Bài đăng đã đối chiếu</span>
      <span class="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-extrabold uppercase text-emerald-400">Đúng nội dung</span>
    </div>
    <div class="grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400">
      <img :src="screenshotSrc" alt="Ảnh bài đăng đã được đối chiếu nội dung" class="h-full w-full object-contain" />
    </div>
  </div>

  <div v-else-if="screenshotSrc" class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
    <div class="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
      <span class="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Ảnh trạng thái Facebook</span>
      <span v-if="restoredInfo" class="rounded-full bg-sky-500/15 px-2 py-1 text-[10px] font-extrabold uppercase text-sky-300">
        Ảnh phiên trước
      </span>
    </div>
    <div v-if="restoredInfo" class="border-b border-zinc-800 px-3 py-2 text-[11px] leading-5 text-zinc-400">
      Khôi phục từ {{ formatDate(restoredInfo.savedAt) }} · {{ restoredInfo.accountLabel }}
    </div>
    <div class="grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400">
      <img :src="screenshotSrc" alt="Ảnh trạng thái Facebook" class="h-full w-full object-contain" />
    </div>
  </div>

  <div
    v-else-if="submitVerifiedWithoutScreenshot"
    class="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
  >
    Bài đã đăng thành công nhưng Facebook chưa đồng bộ bài mới lên feed để chụp ảnh xác minh. Hệ thống không hiển thị ảnh bài cũ để tránh gây nhầm lẫn.
  </div>
</template>
