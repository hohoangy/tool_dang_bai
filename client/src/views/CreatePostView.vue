<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  BarChart3,
  CalendarClock,
  Globe2,
  Image,
  Laugh,
  ListChecks,
  LoaderCircle,
  MapPin,
  RefreshCcw,
  Sparkles,
  Timer,
  X as XIcon
} from 'lucide-vue-next';
import { usePostsStore } from '../stores/posts';
import { useUiStore } from '../stores/ui';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';
import { platformMap, publishingPlatforms } from '../config/platforms';

const posts = usePostsStore();
const ui = useUiStore();
const topic = ref('Cách nhà sáng tạo chuẩn bị nội dung 7 ngày chỉ trong 1 giờ');
const tone = ref('viral');
const platform = ref('x');
const socialAccounts = ref([]);
const selectedSocialAccountId = ref('');
const count = ref(1);
const scheduledAt = ref(new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
const selected = ref(null);
const editingCaption = ref('');
const imageUrl = ref('');
const imageAltText = ref('');
const images = ref([]);
const imageInput = ref(null);
const uploadingImages = ref(false);

const activePost = computed(() => selected.value || createDraftPost());
const activePlatform = computed(() => platformMap[platform.value] || platformMap.x);
const postText = computed(() => buildPlatformText(activePost.value));
const charLimit = computed(() => activePlatform.value.charLimit);
const availableAccounts = computed(() => socialAccounts.value.filter((account) => account.platform === platform.value && account.status === 'connected'));
const charsRemaining = computed(() => charLimit.value - postText.value.length);
const canSubmit = computed(() =>
  (postText.value.trim().length > 0 || images.value.length > 0)
  && charsRemaining.value >= 0
  && Boolean(selectedSocialAccountId.value)
  && !posts.loading
  && !uploadingImages.value
);
const progressStyle = computed(() => {
  const used = Math.min(1, Math.max(0, postText.value.length / charLimit.value));
  return {
    background: `conic-gradient(${charsRemaining.value < 0 ? '#ef4444' : '#1d9bf0'} ${used * 360}deg, rgba(148, 163, 184, 0.25) 0deg)`
  };
});

onMounted(async () => {
  await loadSocialAccounts();
});

watch(platform, (nextPlatform) => {
  if (nextPlatform !== 'x' && images.value.length) {
    images.value = [];
    imageUrl.value = '';
    syncMedia();
  }
  selectDefaultAccount();
});

async function loadSocialAccounts() {
  const { data } = await http.get('/social/accounts');
  socialAccounts.value = data.accounts || [];
  selectDefaultAccount();
}

function selectDefaultAccount() {
  const currentIsValid = availableAccounts.value.some((account) => account._id === selectedSocialAccountId.value);
  selectedSocialAccountId.value = currentIsValid ? selectedSocialAccountId.value : availableAccounts.value[0]?._id || '';
}

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
  if (images.value.length) imageUrl.value = images.value[0].url;
  if (selected.value) {
    selected.value.media = {
      imageUrl: imageUrl.value,
      altText: imageAltText.value,
      images: images.value.map((image) => ({ ...image, altText: image.altText || imageAltText.value }))
    };
  }
}

function openImagePicker() {
  if (platform.value !== 'x' || images.value.length >= 4 || uploadingImages.value) return;
  imageInput.value?.click();
}

async function selectImages(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  const remaining = 4 - images.value.length;
  if (files.length > remaining) ui.notify(`X chỉ cho phép tối đa 4 ảnh. Bạn có thể thêm ${remaining} ảnh nữa.`, 'error');

  const accepted = files.slice(0, remaining);
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff'];
  for (const file of accepted) {
    if (!allowedTypes.includes(file.type)) {
      ui.notify(`${file.name}: định dạng ảnh chưa được hỗ trợ.`, 'error');
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      ui.notify(`${file.name}: ảnh phải nhỏ hơn hoặc bằng 5 MB.`, 'error');
      continue;
    }

    uploadingImages.value = true;
    try {
      const { data } = await http.post('/media/images', file, {
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name)
        }
      });
      images.value.push({ ...data.image, altText: imageAltText.value });
      syncMedia();
    } catch (error) {
      ui.notify(error.message, 'error');
    } finally {
      uploadingImages.value = false;
    }
  }
}

function removeImage(index) {
  images.value.splice(index, 1);
  syncMedia();
}

async function schedule() {
  if (!canSubmit.value) return;
  try {
    await posts.schedule(buildPostPayload(new Date(scheduledAt.value).toISOString()));
    ui.notify(`Đã lên lịch bài viết cho ${activePlatform.value.name}.`);
  } catch (error) {
    ui.notify(error.message, 'error');
  }
}

async function publishNow() {
  if (!canSubmit.value) return;
  try {
    const post = await posts.schedule(buildPostPayload(new Date().toISOString()));
    await posts.publish(post._id);
    ui.notify(`Đã gửi bài lên ${activePlatform.value.name}.`);
  } catch (error) {
    ui.notify(error.message, 'error');
  }
}

function buildPostPayload(date) {
  const draft = activePost.value;
  return {
    ...draft,
    platform: platform.value,
    socialAccountId: selectedSocialAccountId.value,
    tone: tone.value,
    topic: topic.value,
    content: {
      ...draft.content,
      caption: editingCaption.value,
      hashtags: normalizeHashtags(draft.content.hashtags)
    },
    media: {
      imageUrl: imageUrl.value,
      altText: imageAltText.value,
      images: images.value.map((image) => ({ ...image, altText: image.altText || imageAltText.value }))
    },
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
    media: {
      imageUrl: imageUrl.value,
      altText: imageAltText.value,
      images: images.value.map((image) => ({ ...image, altText: image.altText || imageAltText.value }))
    }
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
          <h2 class="text-2xl font-extrabold">Tạo bài đa kênh</h2>
          <p class="mt-1 text-zinc-500">Chọn kênh, chọn tài khoản đã kết nối, rồi đăng ngay hoặc đưa vào lịch tự động.</p>
        </div>
        <button class="btn-soft" :disabled="posts.loading" @click="generate">
          <Sparkles class="h-4 w-4" />
          AI
        </button>
      </div>

      <div class="space-y-4">
        <textarea v-model="topic" class="field min-h-28 resize-none text-lg leading-8" placeholder="Chủ đề hoặc ý tưởng chính"></textarea>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <select v-model="platform" class="field">
            <option v-for="item in publishingPlatforms" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <select v-model="selectedSocialAccountId" class="field" :disabled="!availableAccounts.length">
            <option value="">{{ availableAccounts.length ? activePlatform.accountLabel : 'Chưa kết nối tài khoản' }}</option>
            <option v-for="account in availableAccounts" :key="account._id" :value="account._id">
              {{ account.accountName }}
            </option>
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

        <input
          ref="imageInput"
          class="hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff"
          multiple
          @change="selectImages"
        />
        <div v-if="platform !== 'x'" class="grid gap-3 sm:grid-cols-[1fr_0.7fr]">
          <label class="relative block">
            <Image class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input v-model.trim="imageUrl" type="url" class="field pl-11" placeholder="URL ảnh công khai" @input="syncMedia" />
          </label>
          <input v-model.trim="imageAltText" class="field" placeholder="Mô tả ảnh" @input="syncMedia" />
        </div>
        <p v-if="!selectedSocialAccountId" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Chưa chọn tài khoản xuất bản cho {{ activePlatform.name }}. Vào Nền tảng để kết nối hoặc chọn account đã có.
        </p>

        <div class="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex gap-4 p-4">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-zinc-950 text-base font-extrabold text-white">
              S
            </div>
            <div class="min-w-0 flex-1">
              <textarea
                v-model="editingCaption"
                class="min-h-52 w-full resize-none bg-transparent text-xl leading-8 outline-none placeholder:text-zinc-500"
                :placeholder="`Soạn nội dung cho ${activePlatform.name}`"
                @input="syncEdit"
              ></textarea>

              <div
                v-if="images.length"
                :class="[
                  'mt-3 grid gap-1 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800',
                  images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                ]"
              >
                <div
                  v-for="(image, index) in images"
                  :key="image.url"
                  :class="['group relative bg-zinc-100 dark:bg-zinc-900', images.length === 3 && index === 0 ? 'row-span-2' : '']"
                >
                  <img
                    :src="image.url"
                    :alt="image.altText || image.name || 'Ảnh bài đăng'"
                    :class="['h-full w-full object-cover', images.length === 1 ? 'max-h-[430px] min-h-64' : 'aspect-square']"
                  />
                  <button
                    type="button"
                    class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black"
                    aria-label="Xóa ảnh"
                    @click="removeImage(index)"
                  >
                    <XIcon class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <img
                v-else-if="imageUrl"
                :src="imageUrl"
                :alt="imageAltText || 'Ảnh bài đăng'"
                class="mt-3 aspect-video w-full rounded-2xl border border-zinc-200 object-cover dark:border-zinc-800"
              />

              <div v-if="platform === 'x' && images.length" class="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  v-for="(image, index) in images"
                  :key="`alt-${image.url}`"
                  v-model.trim="image.altText"
                  class="field"
                  maxlength="1000"
                  :placeholder="`Mô tả ảnh ${index + 1} cho trình đọc màn hình`"
                  @input="syncMedia"
                />
              </div>

              <div class="mt-4 inline-flex items-center gap-2 rounded-full px-1 text-sm font-bold text-sky-500">
                <Globe2 class="h-4 w-4" />
                {{ activePlatform.name }} publishing workflow
              </div>
            </div>
          </div>

          <div class="mx-4 border-t border-zinc-200 dark:border-zinc-800"></div>

          <div class="flex flex-wrap items-center justify-between gap-3 p-4 pl-[76px]">
            <div class="flex items-center gap-4 text-sky-500">
              <button
                type="button"
                class="rounded-full p-1 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="platform !== 'x' || images.length >= 4 || uploadingImages"
                :title="platform !== 'x' ? 'Upload trực tiếp hiện dùng cho X.com' : images.length >= 4 ? 'Đã đủ 4 ảnh' : 'Thêm ảnh'"
                @click="openImagePicker"
              >
                <LoaderCircle v-if="uploadingImages" class="h-5 w-5 animate-spin" />
                <Image v-else class="h-5 w-5" />
              </button>
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
                Đăng ngay
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
          <h3 class="text-lg font-extrabold">{{ activePlatform.previewLabel }}</h3>
          <span class="text-sm text-zinc-500">{{ activePlatform.shortName }}</span>
        </div>
        <article class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex gap-3">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-zinc-950 font-extrabold text-white">S</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1">
                <span class="font-extrabold">{{ availableAccounts.find((account) => account._id === selectedSocialAccountId)?.accountName || 'SocialPilot AI' }}</span>
                <span class="text-zinc-500">{{ activePlatform.shortName }}</span>
                <span class="text-zinc-500">· now</span>
              </div>
              <p class="mt-1 whitespace-pre-line text-[15px] leading-6">{{ postText || 'Nội dung bài đăng sẽ hiển thị ở đây.' }}</p>
              <div
                v-if="images.length"
                :class="[
                  'mt-3 grid gap-1 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800',
                  images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                ]"
              >
                <div
                  v-for="(image, index) in images"
                  :key="`preview-${image.url}`"
                  :class="['bg-zinc-100 dark:bg-zinc-900', images.length === 3 && index === 0 ? 'row-span-2' : '']"
                >
                  <img
                    :src="image.url"
                    :alt="image.altText || image.name || 'Ảnh bài đăng'"
                    :class="['h-full w-full object-cover', images.length === 1 ? 'max-h-[430px]' : 'aspect-square']"
                  />
                </div>
              </div>
              <img
                v-else-if="imageUrl"
                :src="imageUrl"
                :alt="imageAltText || 'Ảnh bài đăng'"
                class="mt-3 aspect-video w-full rounded-2xl border border-zinc-200 object-cover dark:border-zinc-800"
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
