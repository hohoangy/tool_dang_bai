<script setup>
import { computed, ref } from 'vue';
import {
  BarChart3,
  CalendarClock,
  Globe2,
  Image,
  Laugh,
  ListChecks,
  MapPin,
  RefreshCcw,
  Sparkles,
  Timer
} from 'lucide-vue-next';
import { usePostsStore } from '../stores/posts';
import { useUiStore } from '../stores/ui';
import BaseCard from '../components/BaseCard.vue';

const posts = usePostsStore();
const ui = useUiStore();
const topic = ref('Cách nhà sáng tạo chuẩn bị nội dung 7 ngày chỉ trong 1 giờ');
const tone = ref('viral');
const platform = ref('x');
const count = ref(1);
const scheduledAt = ref(new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
const selected = ref(null);
const editingCaption = ref('');
const imageUrl = ref('');
const imageAltText = ref('');

const activePost = computed(() => selected.value || createDraftPost());
const postText = computed(() => buildPlatformText(activePost.value));
const charLimit = computed(() => platform.value === 'x' ? 280 : 2200);
const charsRemaining = computed(() => charLimit.value - postText.value.length);
const canSubmit = computed(() => postText.value.trim().length > 0 && charsRemaining.value >= 0 && !posts.loading);
const progressStyle = computed(() => {
  const used = Math.min(1, Math.max(0, postText.value.length / charLimit.value));
  return {
    background: `conic-gradient(${charsRemaining.value < 0 ? '#ef4444' : '#1d9bf0'} ${used * 360}deg, rgba(148, 163, 184, 0.25) 0deg)`
  };
});

async function generate() {
  const items = await posts.generate({ topic: topic.value, tone: tone.value, platform: platform.value, count: count.value });
  selected.value = items[0];
  editingCaption.value = items[0].content.caption;
  syncMedia();
}

function syncEdit() {
  if (selected.value) selected.value.content.caption = editingCaption.value;
}

function syncMedia() {
  if (selected.value) selected.value.media = { imageUrl: imageUrl.value, altText: imageAltText.value };
}

async function schedule() {
  if (!canSubmit.value) return;
  await posts.schedule(buildPostPayload(new Date(scheduledAt.value).toISOString()));
  ui.notify('Đã lên lịch bài viết.');
}

async function publishNow() {
  if (!canSubmit.value) return;
  const post = await posts.schedule(buildPostPayload(new Date().toISOString()));
  await posts.publish(post._id);
  ui.notify(platform.value === 'x' ? 'Đã gửi bài lên X.com.' : 'Đã gửi bài viết để đăng lên nền tảng.');
}

function buildPostPayload(date) {
  const draft = activePost.value;
  return {
    ...draft,
    platform: platform.value,
    tone: tone.value,
    topic: topic.value,
    content: {
      ...draft.content,
      caption: editingCaption.value,
      hashtags: normalizeHashtags(draft.content.hashtags)
    },
    media: { imageUrl: imageUrl.value, altText: imageAltText.value },
    scheduledAt: date
  };
}

function createDraftPost() {
  return {
    title: topic.value.slice(0, 80) || 'Bài viết mới',
    topic: topic.value,
    tone: tone.value,
    platform: platform.value,
    content: {
      hook: '',
      caption: editingCaption.value,
      hashtags: extractHashtags(editingCaption.value),
      cta: '',
      outline: []
    },
    media: { imageUrl: imageUrl.value, altText: imageAltText.value }
  };
}

function buildPlatformText(post) {
  const content = post.content || {};
  const tags = normalizeHashtags(content.hashtags).join(' ');
  return [content.hook, content.caption, tags, content.cta].filter(Boolean).join('\n\n');
}

function normalizeHashtags(tags = []) {
  const fromCaption = extractHashtags(editingCaption.value);
  return [...new Set([...(tags || []), ...fromCaption])].filter(Boolean);
}

function extractHashtags(text = '') {
  return Array.from(text.matchAll(/#[\p{L}\p{N}_]+/gu)).map((match) => match[0]);
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(460px,0.75fr)]">
    <BaseCard>
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-extrabold">Tạo bài đăng</h2>
          <p class="mt-1 text-zinc-500">Soạn nội dung, kiểm tra giới hạn ký tự và đăng thử trên nền tảng đã kết nối.</p>
        </div>
        <button class="btn-soft" :disabled="posts.loading" @click="generate">
          <Sparkles class="h-4 w-4" />
          AI
        </button>
      </div>

      <div class="space-y-4">
        <textarea v-model="topic" class="field min-h-28 resize-none text-lg leading-8" placeholder="Chủ đề hoặc ý tưởng chính"></textarea>

        <div class="grid gap-3 sm:grid-cols-4">
          <select v-model="platform" class="field">
            <option value="x">X.com</option>
            <option value="facebook">Trang Facebook</option>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
          </select>
          <select v-model="tone" class="field">
            <option value="viral">Lan truyền</option>
            <option value="storytelling">Kể chuyện</option>
            <option value="inspirational">Truyền cảm hứng</option>
            <option value="professional">Chuyên nghiệp</option>
            <option value="casual">Thân mật</option>
          </select>
          <input v-model.number="count" type="number" min="1" max="10" class="field" />
          <input v-model="scheduledAt" type="datetime-local" class="field" />
        </div>

        <div class="grid gap-3 sm:grid-cols-[1fr_0.7fr]">
          <label class="relative block">
            <Image class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input v-model.trim="imageUrl" type="url" class="field pl-11" placeholder="URL ảnh công khai" @input="syncMedia" />
          </label>
          <input v-model.trim="imageAltText" class="field" placeholder="Mô tả ảnh" @input="syncMedia" />
        </div>

        <div class="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex gap-4 p-4">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-zinc-950 text-base font-extrabold text-white">
              S
            </div>
            <div class="min-w-0 flex-1">
              <textarea
                v-model="editingCaption"
                class="min-h-52 w-full resize-none bg-transparent text-xl leading-8 outline-none placeholder:text-zinc-500"
                placeholder="What is happening?!"
                @input="syncEdit"
              ></textarea>

              <img
                v-if="imageUrl"
                :src="imageUrl"
                :alt="imageAltText || 'Ảnh bài đăng'"
                class="mt-3 aspect-video w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
              />

              <div class="mt-4 inline-flex items-center gap-2 rounded-full px-1 text-sm font-bold text-sky-500">
                <Globe2 class="h-4 w-4" />
                Everyone can reply
              </div>
            </div>
          </div>

          <div class="mx-4 border-t border-zinc-200 dark:border-zinc-800"></div>

          <div class="flex flex-wrap items-center justify-between gap-3 p-4 pl-[76px]">
            <div class="flex items-center gap-4 text-sky-500">
              <Image class="h-5 w-5" />
              <span class="rounded text-[11px] font-bold leading-none">GIF</span>
              <BarChart3 class="h-5 w-5" />
              <ListChecks class="h-5 w-5" />
              <Laugh class="h-5 w-5" />
              <CalendarClock class="h-5 w-5" />
              <MapPin class="h-5 w-5 text-zinc-400" />
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold" :class="charsRemaining < 0 ? 'text-red-500' : 'text-zinc-500'">{{ charsRemaining }}</span>
                <span class="h-8 w-px bg-zinc-200 dark:bg-zinc-800"></span>
                <span class="grid h-8 w-8 place-items-center rounded-full" :style="progressStyle">
                  <span class="h-5 w-5 rounded-full bg-white dark:bg-zinc-950"></span>
                </span>
              </div>
              <button class="rounded-full bg-zinc-950 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100" :disabled="!canSubmit" @click="publishNow">
                Post
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <button class="btn-soft" :disabled="posts.loading" @click="generate">
            <RefreshCcw class="h-4 w-4" />
            Tạo lại
          </button>
          <button class="btn-soft" :disabled="!canSubmit" @click="schedule">
            <Timer class="h-4 w-4" />
            Lên lịch
          </button>
        </div>
      </div>
    </BaseCard>

    <div class="space-y-4">
      <BaseCard>
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-extrabold">X.com preview</h3>
          <span class="text-sm text-zinc-500">{{ platform }}</span>
        </div>
        <article class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex gap-3">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-zinc-950 font-extrabold text-white">S</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1">
                <span class="font-extrabold">SocialPilot AI</span>
                <span class="text-zinc-500">@socialpilot_ai</span>
                <span class="text-zinc-500">· now</span>
              </div>
              <p class="mt-1 whitespace-pre-line text-[15px] leading-6">{{ postText || 'Nội dung bài đăng sẽ hiển thị ở đây.' }}</p>
              <img
                v-if="imageUrl"
                :src="imageUrl"
                :alt="imageAltText || 'Ảnh bài đăng'"
                class="mt-3 aspect-video w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
              />
              <div class="mt-4 flex max-w-sm justify-between text-zinc-500">
                <span>0</span>
                <span>0</span>
                <span>0</span>
                <span>0</span>
              </div>
            </div>
          </div>
        </article>
      </BaseCard>

      <BaseCard v-if="posts.generated.length > 1">
        <h3 class="mb-3 text-lg font-bold">Các phương án đã tạo</h3>
        <button
          v-for="item in posts.generated"
          :key="item.title"
          class="mb-2 w-full rounded-lg border border-zinc-200 p-3 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-950"
          @click="selected = item; editingCaption = item.content.caption; syncMedia()"
        >
          <p class="font-bold">{{ item.title }}</p>
          <p class="text-sm text-zinc-500">{{ item.content.hook }}</p>
        </button>
      </BaseCard>
    </div>
  </div>
</template>
