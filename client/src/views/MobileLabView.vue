<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { Home, Image, Keyboard, Loader2, MousePointer2, Play, RefreshCcw, Send, Smartphone, Terminal, Undo2, Wifi, XCircle } from 'lucide-vue-next';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const auth = useAuthStore();

const accounts = ref([]);
const logs = ref([]);
const loading = ref(false);
const running = ref(false);
const screenshotLoading = ref(false);
const posting = ref(false);
const mediaUploading = ref(false);
const selectedAccountId = ref('');
const selectedPlatformId = ref('facebook');
const screenshot = ref(null);
const postResult = ref(null);
const remoteTextInput = ref('');
const mediaInput = ref(null);
const composerTextarea = ref(null);
const showEmojiPicker = ref(false);

const maxPhotos = 4;

const platforms = [
  {
    id: 'facebook',
    label: 'Facebook',
    packageName: 'com.facebook.katana',
    status: 'ready',
    description: 'Mo composer, nhap text, gan anh va dang truc tiep bang Facebook app trong LDPlayer.'
  },
  {
    id: 'x',
    label: 'X',
    packageName: 'com.twitter.android',
    status: 'planned',
    description: 'Se dung cung LDPlayer engine, them workflow compose/post rieng cho X.'
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    packageName: 'com.zhiliaoapp.musically',
    status: 'planned',
    description: 'Se can workflow chon video, caption, next va post.'
  },
  {
    id: 'instagram',
    label: 'Instagram',
    packageName: 'com.instagram.android',
    status: 'planned',
    description: 'Se can workflow chon media, caption va share.'
  }
];

const defaultMobileAccount = {
  platform: 'facebook',
  displayName: 'LDPlayer Facebook',
  accountHandle: '',
  instanceName: 'LDPlayer-1',
  adbHost: '127.0.0.1:5555',
  deviceId: '',
  status: 'ready',
  notes: 'Default LDPlayer profile for direct Facebook posting tests.',
  metadata: {
    appPackage: 'com.facebook.katana',
    username: '',
    password: '',
    loginSteps: {
      usernameTap: { x: 540, y: 760 },
      passwordTap: { x: 540, y: 900 },
      submitTap: { x: 540, y: 1060 }
    }
  }
};

const post = reactive({
  text: 'Bài test đăng từ LDPlayer qua SocialPilot AI 😄',
  media: []
});

const emojiGroups = [
  {
    label: 'Da dung gan day',
    items: ['🤣', '😍', '😊', '😌', '😇', '😀', '😂', '☘️']
  },
  {
    label: 'Mat cuoi va hinh nguoi',
    items: ['😀', '😃', '😁', '😄', '😆', '🥺', '😅', '😂', '🤣', '🥲', '☺️', '😊', '😇', '🙂', '🙃', '😉', '😔', '😍', '🥰', '😘', '😗', '😙', '😚', '😋']
  },
  {
    label: 'Cam xuc pho bien',
    items: ['👍', '👏', '🙏', '💪', '🔥', '✨', '❤️', '💙', '💚', '💛', '🎉', '✅', '📌', '📷', '🚀', '⭐']
  }
];

const selectedPlatform = computed(() => platforms.find((item) => item.id === selectedPlatformId.value) || platforms[0]);
const selectedAccount = computed(() => {
  const exact = accounts.value.find((account) => account._id === selectedAccountId.value);
  if (exact) return exact;
  return accounts.value.find((account) => account.platform === selectedPlatformId.value) || accounts.value[0] || null;
});
const selectedAccountLabel = computed(() => selectedAccount.value ? `${selectedAccount.value.displayName} - ${selectedAccount.value.instanceName}` : 'Chua co LDPlayer profile');
const accountInitial = computed(() => selectedAccount.value?.displayName?.slice(0, 1)?.toUpperCase() || 'F');
const screenshotSrc = computed(() => screenshot.value?.imageBase64 ? `data:image/png;base64,${screenshot.value.imageBase64}` : '');
const composerScreenshotSrc = computed(() => postResult.value?.screenshot?.imageBase64 ? `data:image/png;base64,${postResult.value.screenshot.imageBase64}` : '');
const latestLogs = computed(() => logs.value.slice(0, 80));
const canUseRemote = computed(() => Boolean(selectedAccount.value));
const canRunWorkflow = computed(() => selectedPlatform.value.status === 'ready' && canUseRemote.value && post.text.trim() && !posting.value && !mediaUploading.value);

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get('/mobile/accounts');
    applyMobileAccounts(data);
  } catch (error) {
    if (isAuthError(error)) {
      await auth.login('creator@example.com', 'password123');
      const { data } = await http.get('/mobile/accounts');
      applyMobileAccounts(data);
      ui.notify('Da lam moi phien dang nhap local.');
      return;
    }
    ui.notify(error.message, 'error');
  } finally {
    loading.value = false;
  }
}

function applyMobileAccounts(data) {
  const nextAccounts = data.accounts || [];
  accounts.value = nextAccounts;
  logs.value = data.logs || [];
  if (nextAccounts[0] && !nextAccounts.some((account) => account._id === selectedAccountId.value)) {
    const preferred = findPreferredAccount(nextAccounts);
    selectedAccountId.value = preferred._id;
  }
}

function findPreferredAccount(items) {
  return items.find((account) => account.platform === selectedPlatformId.value && account.instanceName === 'LDPlayer')
    || items.find((account) => account.instanceName === 'LDPlayer')
    || items.find((account) => account.platform === selectedPlatformId.value)
    || items[0];
}

function isAuthError(error) {
  return /authentication required|invalid session/i.test(error?.message || '');
}

async function ensureDefaultProfile() {
  if (accounts.value.length) return;
  const { data } = await http.post('/mobile/accounts', defaultMobileAccount);
  accounts.value = [data.account];
  selectedAccountId.value = data.account._id;
  ui.notify('Da tao LDPlayer profile mac dinh.');
}

async function remoteLaunch() {
  if (!selectedAccount.value) return;
  running.value = true;
  try {
    await http.post(`/mobile/accounts/${selectedAccount.value._id}/remote/launch`);
    ui.notify('Da mo va noi LDPlayer.');
    await refreshScreenshot();
  } catch (error) {
    ui.notify(error.message, 'error');
  } finally {
    running.value = false;
  }
}

async function remoteOpenApp() {
  if (!selectedAccount.value) return;
  running.value = true;
  try {
    await http.post(`/mobile/accounts/${selectedAccount.value._id}/remote/open-app`, {
      appPackage: selectedAccount.value.metadata?.appPackage || selectedPlatform.value.packageName
    });
    ui.notify(`Da mo ${selectedPlatform.value.label} trong LDPlayer.`);
    await refreshScreenshot();
  } catch (error) {
    ui.notify(error.message, 'error');
  } finally {
    running.value = false;
  }
}

async function probeDevice() {
  if (!selectedAccount.value) return;
  running.value = true;
  try {
    await http.post(`/mobile/accounts/${selectedAccount.value._id}/probe`);
    ui.notify('ADB san sang.');
    await load();
  } catch (error) {
    ui.notify(error.message, 'error');
  } finally {
    running.value = false;
  }
}

async function refreshScreenshot() {
  if (!selectedAccount.value) return;
  screenshotLoading.value = true;
  try {
    const { data } = await http.get(`/mobile/accounts/${selectedAccount.value._id}/remote/screenshot`);
    screenshot.value = data.screenshot;
  } catch (error) {
    ui.notify(error.message, 'error');
  } finally {
    screenshotLoading.value = false;
  }
}

async function clickScreenshot(event) {
  if (!selectedAccount.value || !screenshot.value?.width || !screenshot.value?.height) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * screenshot.value.width;
  const y = ((event.clientY - rect.top) / rect.height) * screenshot.value.height;
  await http.post(`/mobile/accounts/${selectedAccount.value._id}/remote/tap`, { x, y });
  window.setTimeout(refreshScreenshot, 500);
}

async function sendRemoteText() {
  if (!selectedAccount.value || !remoteTextInput.value.trim()) return;
  await http.post(`/mobile/accounts/${selectedAccount.value._id}/remote/text`, { text: remoteTextInput.value });
  remoteTextInput.value = '';
  window.setTimeout(refreshScreenshot, 400);
}

async function sendRemoteKey(key) {
  if (!selectedAccount.value) return;
  await http.post(`/mobile/accounts/${selectedAccount.value._id}/remote/key`, { key });
  window.setTimeout(refreshScreenshot, 400);
}

async function runPostWorkflow() {
  if (!selectedAccount.value) {
    ui.notify('Chua co LDPlayer profile.', 'error');
    return;
  }
  if (selectedPlatform.value.status !== 'ready') {
    ui.notify(`Workflow ${selectedPlatform.value.label} se duoc them sau. Hien tai Facebook da san sang.`, 'error');
    return;
  }
  if (!post.text.trim()) {
    ui.notify('Thieu noi dung bai dang.', 'error');
    return;
  }

  posting.value = true;
  try {
    const { data } = await http.post(`/mobile/accounts/${selectedAccount.value._id}/facebook/post`, {
      text: post.text.trim(),
      appPackage: selectedAccount.value.metadata?.appPackage || selectedPlatform.value.packageName,
      autoSubmit: true,
      images: post.media
        .filter((item) => item.type === 'photo' && item.uploadedUrl)
        .slice(0, maxPhotos)
        .map((item) => ({
          url: item.uploadedUrl,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size
        }))
    });
    postResult.value = data.result;
    screenshot.value = data.result.screenshot || screenshot.value;
    if (data.result.submitVerified === false) {
      ui.notify('Đã bấm Đăng nhưng chưa xác nhận Facebook đã nhận bài. Hãy xem screenshot/log.', 'error');
    } else {
      ui.notify('Đã gửi lệnh đăng bài lên Facebook.');
    }
    await load();
  } catch (error) {
    ui.notify(error.message, 'error');
  } finally {
    posting.value = false;
  }
}

async function addMedia(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  const remaining = maxPhotos - post.media.filter((item) => item.type === 'photo').length;
  const selectedFiles = files.slice(0, remaining);
  if (!selectedFiles.length) return;
  if (files.length > remaining) ui.notify(`Chi nhan them ${remaining} anh de giu gioi han ${maxPhotos} anh.`, 'error');
  if (selectedFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    ui.notify('Anh phai nho hon hoac bang 5 MB.', 'error');
    return;
  }

  mediaUploading.value = true;
  try {
    for (const file of selectedFiles) {
      const previewUrl = URL.createObjectURL(file);
      try {
        const { data } = await http.post('/media/images', file, {
          headers: {
            'Content-Type': file.type,
            'X-File-Name': encodeURIComponent(file.name)
          }
        });
        post.media.push({
          id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          type: 'photo',
          url: previewUrl,
          uploadedUrl: data.image.url,
          mimeType: data.image.mimeType,
          size: data.image.size
        });
      } catch (error) {
        URL.revokeObjectURL(previewUrl);
        throw error;
      }
    }
    ui.notify(`Da tai ${selectedFiles.length} anh len server.`);
  } catch (error) {
    ui.notify(error.message, 'error');
  } finally {
    mediaUploading.value = false;
  }
}

function removeMedia(item) {
  URL.revokeObjectURL(item.url);
  post.media = post.media.filter((media) => media.id !== item.id);
}

async function insertEmoji(emoji) {
  const input = composerTextarea.value;
  if (!input) {
    post.text += emoji;
    return;
  }

  const start = input.selectionStart ?? post.text.length;
  const end = input.selectionEnd ?? post.text.length;
  post.text = `${post.text.slice(0, start)}${emoji}${post.text.slice(end)}`;
  await nextTick();
  input.focus();
  const nextCursor = start + emoji.length;
  input.setSelectionRange(nextCursor, nextCursor);
}

function resetComposer() {
  post.text = '';
  post.media.forEach((item) => URL.revokeObjectURL(item.url));
  post.media = [];
  postResult.value = null;
  showEmojiPicker.value = false;
}

function formatDate(value) {
  if (!value) return 'Chua co';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatLog(log) {
  const target = accounts.value.find((account) => account._id === log.accountId);
  return target?.displayName || log.accountId;
}

onMounted(async () => {
  await load();
  await ensureDefaultProfile();
});

onUnmounted(() => {
  post.media.forEach((item) => URL.revokeObjectURL(item.url));
});
</script>

<template>
  <div class="space-y-5">
    <BaseCard>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-3xl">
          <p class="text-sm font-extrabold uppercase tracking-wide text-emerald-500">Mobile fallback</p>
          <h2 class="mt-1 text-2xl font-extrabold">LDPlayer Composer Test</h2>
          <p class="mt-2 text-sm leading-6 text-zinc-500">
            Kiểm tra bài đăng thủ công qua LDPlayer khi API không khả dụng hoặc cần xử lý checkpoint.
          </p>
        </div>
        <button class="btn-soft" :disabled="loading" @click="load">
          <RefreshCcw class="h-4 w-4" />
          Lam moi profile
        </button>
      </div>
    </BaseCard>

    <div class="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
      <BaseCard>
        <div class="mb-4 flex items-center gap-2">
          <Smartphone class="h-5 w-5 text-zinc-500" />
          <h2 class="text-xl font-extrabold">Profile dang dung</h2>
        </div>

        <label class="space-y-2 text-sm font-bold text-zinc-500">
          Nen tang
          <select v-model="selectedPlatformId" class="field">
            <option v-for="platform in platforms" :key="platform.id" :value="platform.id">
              {{ platform.label }}
            </option>
          </select>
        </label>

        <label class="mt-3 block space-y-2 text-sm font-bold text-zinc-500">
          LDPlayer profile
          <select v-model="selectedAccountId" class="field">
            <option v-for="account in accounts" :key="account._id" :value="account._id">
              {{ account.displayName }} - {{ account.instanceName }}
            </option>
          </select>
        </label>

        <div class="mt-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p class="font-extrabold text-white">{{ selectedAccountLabel }}</p>
          <p class="mt-2 text-zinc-500">Package: {{ selectedAccount?.metadata?.appPackage || selectedPlatform.packageName }}</p>
          <p class="text-zinc-500">ADB: {{ selectedAccount?.deviceId || selectedAccount?.adbHost || '127.0.0.1:5555' }}</p>
          <p class="text-zinc-500">Trang thai: {{ selectedAccount?.status || 'ready' }}</p>
        </div>

        <div class="mt-4 rounded-lg bg-zinc-100 p-4 text-sm leading-6 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          <p class="font-extrabold text-zinc-900 dark:text-white">Huong phat trien</p>
          <p>1. Facebook workflow dang san sang.</p>
          <p>2. X/TikTok/Instagram se them workflow rieng, dung chung LDPlayer engine.</p>
          <p>3. Khi can scale, moi profile se la mot LDPlayer/token automation rieng.</p>
        </div>
      </BaseCard>

      <BaseCard>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-extrabold">Remote Control</h2>
            <p class="mt-1 text-sm text-zinc-500">Dieu khien app that trong LDPlayer: mo app, chup man hinh, tap va nhap text.</p>
          </div>
          <span :class="['rounded-full px-3 py-1 text-xs font-extrabold uppercase', selectedPlatform.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700']">
            {{ selectedPlatform.status === 'ready' ? 'Ready' : 'Planned' }}
          </span>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <div class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            <button
              class="relative grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400"
              :disabled="screenshotLoading || !canUseRemote"
              @click="clickScreenshot"
            >
              <img v-if="screenshotSrc" :src="screenshotSrc" alt="LDPlayer screenshot" class="h-full w-full object-contain" />
              <span v-else>{{ screenshotLoading ? 'Dang tai man hinh...' : 'Bam Lam moi man hinh de remote' }}</span>
              <span v-if="screenshotLoading" class="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">Loading</span>
            </button>
          </div>

          <div class="space-y-3">
            <div class="grid gap-2 sm:grid-cols-2">
              <button class="btn-primary" :disabled="running || !canUseRemote" @click="remoteLaunch">
                <Smartphone class="h-4 w-4" />
                Mo LDPlayer
              </button>
              <button class="btn-soft" :disabled="running || !canUseRemote" @click="remoteOpenApp">
                <Play class="h-4 w-4" />
                Mo app {{ selectedPlatform.label }}
              </button>
              <button class="btn-soft" :disabled="screenshotLoading || !canUseRemote" @click="refreshScreenshot">
                <RefreshCcw class="h-4 w-4" />
                Lam moi man hinh
              </button>
              <button class="btn-soft" :disabled="!canUseRemote" @click="probeDevice">
                <Wifi class="h-4 w-4" />
                Kiem tra ADB
              </button>
            </div>

            <div class="grid gap-2 sm:grid-cols-3">
              <button class="btn-soft" :disabled="!canUseRemote" @click="sendRemoteKey('back')">
                <Undo2 class="h-4 w-4" />
                Back
              </button>
              <button class="btn-soft" :disabled="!canUseRemote" @click="sendRemoteKey('home')">
                <Home class="h-4 w-4" />
                Home
              </button>
              <button class="btn-soft" :disabled="!canUseRemote" @click="sendRemoteKey('enter')">
                <Keyboard class="h-4 w-4" />
                Enter
              </button>
            </div>

            <form class="grid gap-2 sm:grid-cols-[1fr_auto]" @submit.prevent="sendRemoteText">
              <input v-model="remoteTextInput" class="field" placeholder="Nhap text vao o dang focus trong LDPlayer" />
              <button class="btn-primary" :disabled="!remoteTextInput.trim() || !canUseRemote">
                <Send class="h-4 w-4" />
                Gui
              </button>
            </form>

            <div class="rounded-lg border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800">
              <div class="mb-2 flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-200">
                <MousePointer2 class="h-4 w-4" />
                Cach dung nhanh
              </div>
              <p>1. Bam Mo LDPlayer, sau do Kiem tra ADB.</p>
              <p>2. Bam Mo app {{ selectedPlatform.label }} va Lam moi man hinh.</p>
              <p>3. Click truc tiep vao screenshot de tap, dung o text de nhap thu cong khi can.</p>
            </div>
          </div>
        </div>
      </BaseCard>
    </div>

    <BaseCard>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-xl font-extrabold">Facebook Mobile Fallback</h2>
          <p class="mt-1 text-sm text-zinc-500">Soạn nội dung và mở composer trên LDPlayer để kiểm tra trước khi đăng thủ công.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-soft h-10 px-3" title="Xóa nội dung đang soạn" @click="resetComposer">
            <RefreshCcw class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-3">
          <div class="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-[#242526] dark:text-white">
            <div class="relative border-b border-zinc-200 px-4 py-4 text-center dark:border-zinc-700">
              <h3 class="text-xl font-extrabold">Tạo bài viết</h3>
              <button
                class="absolute right-3 top-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-extrabold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="posting || mediaUploading || !selectedAccount || !post.text.trim()"
                @click="runPostWorkflow()"
              >
                <Loader2 v-if="posting" class="h-4 w-4 animate-spin" />
                <Send v-else class="h-4 w-4" />
                Đăng
              </button>
            </div>

            <div class="space-y-4 p-4">
              <div class="flex items-center gap-3">
                <div class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-sm font-extrabold text-white">
                  {{ accountInitial }}
                </div>
                <div class="min-w-0">
                  <p class="truncate font-extrabold">{{ selectedAccount?.displayName || 'Facebook profile' }}</p>
                </div>
              </div>

              <div class="relative">
                <textarea
                  ref="composerTextarea"
                  v-model="post.text"
                  class="min-h-40 w-full resize-y bg-transparent pr-12 text-2xl leading-9 outline-none placeholder:text-zinc-400"
                  placeholder="Bạn đang nghĩ gì?"
                  @focus="showEmojiPicker = false"
                ></textarea>
                <button
                  class="absolute bottom-2 right-1 grid h-9 w-9 place-items-center rounded-full border border-zinc-300 text-lg hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                  title="Chọn icon cảm xúc"
                  type="button"
                  @click="showEmojiPicker = !showEmojiPicker"
                >
                  ☺
                </button>
                <div
                  v-if="showEmojiPicker"
                  class="absolute bottom-12 right-0 z-20 w-[330px] max-w-[calc(100vw-5rem)] rounded-2xl border border-zinc-700 bg-zinc-900 p-3 text-white shadow-2xl"
                >
                  <div v-for="group in emojiGroups" :key="group.label" class="mb-3 last:mb-0">
                    <p class="mb-2 text-xs font-bold text-zinc-400">{{ group.label }}</p>
                    <div class="grid grid-cols-8 gap-1">
                      <button
                        v-for="emoji in group.items"
                        :key="`${group.label}-${emoji}`"
                        class="grid h-8 w-8 place-items-center rounded-lg text-xl hover:bg-zinc-700"
                        type="button"
                        @click="insertEmoji(emoji)"
                      >
                        {{ emoji }}
                      </button>
                    </div>
                  </div>
                  <div class="mt-3 flex items-center justify-between border-t border-zinc-700 pt-2 text-xs text-zinc-500">
                    <span>Emoji se chen vao noi dung bai viet</span>
                    <button class="font-bold text-zinc-300 hover:text-white" type="button" @click="showEmojiPicker = false">Dong</button>
                  </div>
                </div>
              </div>

              <div v-if="post.media.length" class="grid gap-2 sm:grid-cols-2">
                <div
                  v-for="item in post.media"
                  :key="item.id"
                  class="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <img v-if="item.type === 'photo'" :src="item.url" :alt="item.name" class="h-52 w-full object-cover" />
                  <button
                    class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"
                    title="Xóa tệp"
                    @click="removeMedia(item)"
                  >
                    <XCircle class="h-5 w-5" />
                  </button>
                  <p class="truncate px-3 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">{{ item.name }}</p>
                </div>
              </div>

              <div class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <p class="text-sm font-extrabold">Thêm vào bài viết của bạn</p>
                  <div class="flex items-center gap-2">
                    <button
                      class="grid h-10 w-10 place-items-center rounded-lg text-emerald-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-700"
                      title="Thêm ảnh"
                      :disabled="mediaUploading || post.media.length >= maxPhotos"
                      @click="mediaInput?.click()"
                    >
                      <Loader2 v-if="mediaUploading" class="h-5 w-5 animate-spin" />
                      <Image v-else class="h-5 w-5" />
                    </button>
                    <button
                      class="grid h-10 w-10 place-items-center rounded-lg text-orange-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      title="Chọn icon cảm xúc"
                      type="button"
                      @click="showEmojiPicker = !showEmojiPicker"
                    >
                      ☺
                    </button>
                  </div>
                </div>
              </div>
              <input ref="mediaInput" class="hidden" type="file" accept="image/*" multiple @change="addMedia" />
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div v-if="composerScreenshotSrc" class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            <div class="grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400">
              <img :src="composerScreenshotSrc" alt="Composer screenshot" class="h-full w-full object-contain" />
            </div>
          </div>
        </div>
      </div>
    </BaseCard>

    <BaseCard>
      <div class="mb-4 flex items-center gap-2">
        <Terminal class="h-5 w-5 text-zinc-500" />
        <h3 class="text-lg font-extrabold">Automation Logs</h3>
      </div>
      <div class="max-h-[440px] space-y-2 overflow-auto pr-1">
        <article v-for="log in latestLogs" :key="log._id" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-bold">{{ formatLog(log) }} - {{ log.action }}</p>
            <span :class="['rounded-full px-2 py-1 text-xs font-bold uppercase', log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
              {{ log.level }}
            </span>
          </div>
          <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{{ log.message }}</p>
          <p class="mt-2 text-xs text-zinc-500">{{ formatDate(log.createdAt) }}</p>
        </article>
        <p v-if="!latestLogs.length" class="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
          Chua co log automation.
        </p>
      </div>
    </BaseCard>
  </div>
</template>
