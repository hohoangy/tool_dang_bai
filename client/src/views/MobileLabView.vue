<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ClipboardList, Home, Image, Keyboard, Laugh, Loader2, MapPin, MousePointer2, Play, RefreshCcw, Send, Smartphone, Tag, Terminal, Trash2, Undo2, UserRoundPlus, Video, Wifi, XCircle } from 'lucide-vue-next';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const accounts = ref([]);
const logs = ref([]);
const loading = ref(false);
const running = ref(false);
const selectedIds = ref([]);
const activeJob = ref(null);
const selectedRemoteId = ref('');
const selectedFacebookId = ref('');
const screenshot = ref(null);
const facebookPostResult = ref(null);
const screenshotLoading = ref(false);
const facebookPosting = ref(false);
const remoteTextInput = ref('');
const facebookToolMode = ref('');
const facebookImageInput = ref(null);
const facebookVideoInput = ref(null);
let jobTimer = null;

const defaultPackages = {
  facebook: 'com.facebook.katana',
  x: 'com.twitter.android',
  youtube: 'com.google.android.youtube',
  tiktok: 'com.zhiliaoapp.musically',
  other: ''
};

const form = reactive({
  platform: 'x',
  displayName: '',
  accountHandle: '',
  instanceName: 'LDPlayer-1',
  adbHost: '127.0.0.1:5555',
  deviceId: '',
  notes: '',
  metadata: {
    appPackage: defaultPackages.x,
    username: '',
    password: '',
    loginSteps: {
      usernameTap: { x: 540, y: 760 },
      passwordTap: { x: 540, y: 900 },
      submitTap: { x: 540, y: 1060 }
    }
  }
});

const selectedAccounts = computed(() => accounts.value.filter((account) => selectedIds.value.includes(account._id)));
const selectedRemoteAccount = computed(() => accounts.value.find((account) => account._id === selectedRemoteId.value) || accounts.value[0]);
const selectedFacebookAccount = computed(() => accounts.value.find((account) => account._id === selectedFacebookId.value) || accounts.value.find((account) => account.platform === 'facebook') || accounts.value[0]);
const screenshotSrc = computed(() => screenshot.value?.imageBase64 ? `data:image/png;base64,${screenshot.value.imageBase64}` : '');
const facebookScreenshotSrc = computed(() => facebookPostResult.value?.screenshot?.imageBase64 ? `data:image/png;base64,${facebookPostResult.value.screenshot.imageBase64}` : '');
const latestLogs = computed(() => logs.value.slice(0, 120));
const readyCount = computed(() => accounts.value.filter((account) => ['ready', 'login_required', 'connected'].includes(account.status)).length);
const runningCount = computed(() => accounts.value.filter((account) => account.status === 'logging_in').length);
const issueCount = computed(() => accounts.value.filter((account) => ['checkpoint', 'error'].includes(account.status)).length);
const canRunBatch = computed(() => selectedIds.value.length > 0 && !running.value);
const jobProgress = computed(() => {
  if (!activeJob.value?.total) return 0;
  return Math.round(((activeJob.value.completed + activeJob.value.failed) / activeJob.value.total) * 100);
});
const jobIsActive = computed(() => ['queued', 'running', 'canceling'].includes(activeJob.value?.status));

const statusLabels = {
  ready: 'Sẵn sàng',
  login_required: 'Cần đăng nhập',
  logging_in: 'Đang chạy',
  connected: 'Đã đăng nhập',
  checkpoint: 'Checkpoint',
  error: 'Lỗi',
  paused: 'Tạm dừng'
};

const facebookPost = reactive({
  text: 'Bài test đăng từ LDPlayer qua SocialPilot AI.',
  audience: 'Bạn bè',
  album: 'Album',
  feeling: '',
  location: '',
  tags: '',
  topic: '',
  attachments: [],
  autoSubmit: false,
  composerTap: { x: 390, y: 145 },
  submitTap: { x: 818, y: 1552 }
});

const feelingOptions = [
  { label: 'vui vẻ', icon: '😊', tone: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  { label: 'biết ơn', icon: '💙', tone: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-950/30' },
  { label: 'hào hứng', icon: '🤩', tone: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30' },
  { label: 'thư giãn', icon: '😌', tone: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' }
];

const selectedFeeling = computed(() => feelingOptions.find((item) => item.label === facebookPost.feeling));
const facebookPostMeta = computed(() => [
  selectedFeeling.value ? { key: 'feeling', icon: selectedFeeling.value.icon, text: `đang cảm thấy ${selectedFeeling.value.label}`, tone: selectedFeeling.value.tone, bg: selectedFeeling.value.bg } : null,
  facebookPost.location ? { key: 'location', icon: '📍', text: `tại ${facebookPost.location}`, tone: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/30' } : null,
  facebookPost.tags ? { key: 'tags', icon: '👥', text: `cùng với ${facebookPost.tags}`, tone: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-950/30' } : null,
  facebookPost.topic ? { key: 'topic', icon: '#', text: facebookPost.topic, tone: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' } : null
].filter(Boolean));
const facebookMetaTitle = computed(() => facebookPostMeta.value.map((item) => item.text).join(' · '));
const facebookAutomationText = computed(() => facebookPost.text.trim());

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get('/mobile/accounts');
    accounts.value = data.accounts;
    logs.value = data.logs;
    if (!selectedRemoteId.value && data.accounts[0]) selectedRemoteId.value = data.accounts[0]._id;
    if (!selectedFacebookId.value) {
      const facebookAccount = data.accounts.find((account) => account.platform === 'facebook') || data.accounts[0];
      if (facebookAccount) selectedFacebookId.value = facebookAccount._id;
    }
    selectedIds.value = selectedIds.value.filter((id) => data.accounts.some((account) => account._id === id));
  } finally {
    loading.value = false;
  }
}

function syncPackage() {
  form.metadata.appPackage = defaultPackages[form.platform] || '';
}

async function createAccount() {
  const { data } = await http.post('/mobile/accounts', form);
  accounts.value.unshift(data.account);
  selectedIds.value = [data.account._id, ...selectedIds.value];
  resetForm();
  ui.notify('Đã thêm nick vào hàng điều khiển.');
  await load();
}

async function probe(account) {
  running.value = true;
  try {
    await http.post(`/mobile/accounts/${account._id}/probe`);
    ui.notify(`Đã kiểm tra thiết bị cho ${account.displayName}.`);
    await load();
  } finally {
    running.value = false;
  }
}

async function runOne(account) {
  running.value = true;
  try {
    await http.post(`/mobile/accounts/${account._id}/run-login`, {});
    ui.notify(`Đã chạy đăng nhập cho ${account.displayName}.`);
    await load();
  } finally {
    running.value = false;
  }
}

async function runBatch() {
  if (!canRunBatch.value) return;
  running.value = true;
  try {
    const { data } = await http.post('/mobile/batch/run-login', { accountIds: selectedIds.value });
    activeJob.value = data.job;
    startJobPolling(data.job.id);
    ui.notify('Batch đã được đưa vào hàng chạy nền.');
    await load();
  } finally {
    if (!jobIsActive.value) running.value = false;
  }
}

async function cancelJob() {
  if (!activeJob.value) return;
  const { data } = await http.post(`/mobile/jobs/${activeJob.value.id}/cancel`);
  activeJob.value = data.job;
  ui.notify('Đã gửi yêu cầu hủy batch.');
}

async function deleteAccount(account) {
  await http.delete(`/mobile/accounts/${account._id}`);
  selectedIds.value = selectedIds.value.filter((id) => id !== account._id);
  ui.notify(`Đã xóa ${account.displayName}.`);
  await load();
}

async function remoteLaunch() {
  if (!selectedRemoteAccount.value) return;
  running.value = true;
  try {
    await http.post(`/mobile/accounts/${selectedRemoteAccount.value._id}/remote/launch`);
    ui.notify('Đã mở và nối LDPlayer.');
    await refreshScreenshot();
  } finally {
    running.value = false;
  }
}

async function remoteOpenApp() {
  if (!selectedRemoteAccount.value) return;
  running.value = true;
  try {
    await http.post(`/mobile/accounts/${selectedRemoteAccount.value._id}/remote/open-app`, {
      appPackage: selectedRemoteAccount.value.metadata?.appPackage || ''
    });
    ui.notify('Đã mở app trong LDPlayer.');
    await refreshScreenshot();
  } finally {
    running.value = false;
  }
}

async function refreshScreenshot() {
  if (!selectedRemoteAccount.value) return;
  screenshotLoading.value = true;
  try {
    const { data } = await http.get(`/mobile/accounts/${selectedRemoteAccount.value._id}/remote/screenshot`);
    screenshot.value = data.screenshot;
  } finally {
    screenshotLoading.value = false;
  }
}

async function clickScreenshot(event) {
  if (!selectedRemoteAccount.value || !screenshot.value?.width || !screenshot.value?.height) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * screenshot.value.width;
  const y = ((event.clientY - rect.top) / rect.height) * screenshot.value.height;
  await http.post(`/mobile/accounts/${selectedRemoteAccount.value._id}/remote/tap`, { x, y });
  window.setTimeout(refreshScreenshot, 500);
}

async function sendRemoteText() {
  if (!selectedRemoteAccount.value || !remoteTextInput.value.trim()) return;
  await http.post(`/mobile/accounts/${selectedRemoteAccount.value._id}/remote/text`, { text: remoteTextInput.value });
  remoteTextInput.value = '';
  window.setTimeout(refreshScreenshot, 400);
}

async function sendRemoteKey(key) {
  if (!selectedRemoteAccount.value) return;
  await http.post(`/mobile/accounts/${selectedRemoteAccount.value._id}/remote/key`, { key });
  window.setTimeout(refreshScreenshot, 400);
}

async function publishFacebookPost(options = {}) {
  if (!selectedFacebookAccount.value || !facebookAutomationText.value.trim()) return;
  const autoSubmit = options.forceAutoSubmit || facebookPost.autoSubmit;
  facebookPosting.value = true;
  try {
    const { data } = await http.post(`/mobile/accounts/${selectedFacebookAccount.value._id}/facebook/post`, {
      text: facebookAutomationText.value,
      appPackage: selectedFacebookAccount.value.metadata?.appPackage || defaultPackages.facebook,
      autoSubmit,
      composerTap: facebookPost.composerTap,
      submitTap: facebookPost.submitTap
    });
    facebookPostResult.value = data.result;
    screenshot.value = data.result.screenshot || screenshot.value;
    selectedRemoteId.value = selectedFacebookAccount.value._id;
    ui.notify(data.result.composerPending ? 'Đã tap mở composer nhưng chưa thấy màn soạn ổn định. Kiểm tra screenshot rồi bấm lại.' : autoSubmit ? 'Đã chạy lệnh tự đăng Facebook.' : 'Đã mở composer Facebook để kiểm tra.');
    await load();
  } catch (error) {
    ui.notify(error.message, 'error');
  } finally {
    facebookPosting.value = false;
  }
}

function setFacebookToolMode(mode) {
  facebookToolMode.value = facebookToolMode.value === mode ? '' : mode;
}

function triggerFacebookAttachment(type) {
  facebookToolMode.value = type;
  if (type === 'photo') facebookImageInput.value?.click();
  if (type === 'video') facebookVideoInput.value?.click();
}

function addFacebookAttachments(event, type) {
  const files = Array.from(event.target.files || []);
  const nextItems = files.map((file) => ({
    id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    type,
    url: URL.createObjectURL(file)
  }));
  facebookPost.attachments.push(...nextItems);
  event.target.value = '';
}

function removeFacebookAttachment(item) {
  URL.revokeObjectURL(item.url);
  facebookPost.attachments = facebookPost.attachments.filter((attachment) => attachment.id !== item.id);
}

function resetFacebookComposer() {
  facebookPost.text = '';
  facebookPost.feeling = '';
  facebookPost.location = '';
  facebookPost.tags = '';
  facebookPost.topic = '';
  facebookToolMode.value = '';
  facebookPost.attachments.forEach((item) => URL.revokeObjectURL(item.url));
  facebookPost.attachments = [];
}

function toggleAccount(account) {
  if (selectedIds.value.includes(account._id)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== account._id);
  } else {
    selectedIds.value = [...selectedIds.value, account._id];
  }
}

function resetForm() {
  Object.assign(form, {
    platform: 'x',
    displayName: '',
    accountHandle: '',
    instanceName: 'LDPlayer-1',
    adbHost: '127.0.0.1:5555',
    deviceId: '',
    notes: '',
    metadata: {
      appPackage: defaultPackages.x,
      username: '',
      password: '',
      loginSteps: {
        usernameTap: { x: 540, y: 760 },
        passwordTap: { x: 540, y: 900 },
        submitTap: { x: 540, y: 1060 }
      }
    }
  });
}

function startJobPolling(jobId) {
  if (jobTimer) window.clearInterval(jobTimer);
  running.value = true;
  jobTimer = window.setInterval(async () => {
    try {
      const { data } = await http.get(`/mobile/jobs/${jobId}`);
      activeJob.value = data.job;
      await load();
      if (!['queued', 'running', 'canceling'].includes(data.job.status)) {
        window.clearInterval(jobTimer);
        jobTimer = null;
        running.value = false;
        ui.notify(data.job.failed ? `Batch kết thúc, ${data.job.failed} nick lỗi.` : 'Batch đăng nhập hoàn tất.');
      }
    } catch (error) {
      window.clearInterval(jobTimer);
      jobTimer = null;
      running.value = false;
    }
  }, 1800);
}

function formatDate(value) {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatLog(log) {
  const target = accounts.value.find((account) => account._id === log.accountId);
  return target?.displayName || log.accountId;
}

onMounted(load);
onUnmounted(() => {
  if (jobTimer) window.clearInterval(jobTimer);
  facebookPost.attachments.forEach((item) => URL.revokeObjectURL(item.url));
});
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-3 sm:grid-cols-3">
      <BaseCard>
        <p class="text-sm font-semibold text-zinc-500">Nick sẵn sàng</p>
        <p class="mt-2 text-3xl font-extrabold">{{ readyCount }}</p>
      </BaseCard>
      <BaseCard>
        <p class="text-sm font-semibold text-zinc-500">Đang chạy</p>
        <p class="mt-2 text-3xl font-extrabold">{{ runningCount }}</p>
      </BaseCard>
      <BaseCard>
        <p class="text-sm font-semibold text-zinc-500">Cần xử lý</p>
        <p class="mt-2 text-3xl font-extrabold">{{ issueCount }}</p>
      </BaseCard>
    </div>

    <div class="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <BaseCard>
        <div class="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-extrabold">Thêm nick LDPlayer</h2>
            <p class="mt-1 text-sm text-zinc-500">Mỗi nick gắn với một instance, ADB target và cấu hình đăng nhập.</p>
          </div>
          <Smartphone class="h-6 w-6 text-zinc-500" />
        </div>

        <form class="space-y-3" @submit.prevent="createAccount">
          <div class="grid gap-3 sm:grid-cols-2">
            <select v-model="form.platform" class="field" @change="syncPackage">
              <option value="x">X.com</option>
              <option value="facebook">Facebook</option>
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="other">Khác</option>
            </select>
            <input v-model.trim="form.displayName" class="field" required placeholder="Tên nick" />
          </div>
          <input v-model.trim="form.accountHandle" class="field" placeholder="@username hoặc UID" />
          <input v-model.trim="form.metadata.appPackage" class="field" required placeholder="Android package name" />
          <div class="grid gap-3 sm:grid-cols-2">
            <input v-model.trim="form.instanceName" class="field" required placeholder="LDPlayer instance" />
            <input v-model.trim="form.adbHost" class="field" placeholder="127.0.0.1:5555" />
          </div>
          <input v-model.trim="form.deviceId" class="field" placeholder="Device ID nếu khác ADB host" />
          <div class="grid gap-3 sm:grid-cols-2">
            <input v-model.trim="form.metadata.username" class="field" required placeholder="Tài khoản đăng nhập" />
            <input v-model="form.metadata.password" class="field" required type="password" placeholder="Mật khẩu" />
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <label class="space-y-1 text-xs font-bold uppercase text-zinc-500">
              User tap
              <div class="grid grid-cols-2 gap-2">
                <input v-model.number="form.metadata.loginSteps.usernameTap.x" class="field px-2 py-2 text-sm" type="number" />
                <input v-model.number="form.metadata.loginSteps.usernameTap.y" class="field px-2 py-2 text-sm" type="number" />
              </div>
            </label>
            <label class="space-y-1 text-xs font-bold uppercase text-zinc-500">
              Pass tap
              <div class="grid grid-cols-2 gap-2">
                <input v-model.number="form.metadata.loginSteps.passwordTap.x" class="field px-2 py-2 text-sm" type="number" />
                <input v-model.number="form.metadata.loginSteps.passwordTap.y" class="field px-2 py-2 text-sm" type="number" />
              </div>
            </label>
            <label class="space-y-1 text-xs font-bold uppercase text-zinc-500">
              Login tap
              <div class="grid grid-cols-2 gap-2">
                <input v-model.number="form.metadata.loginSteps.submitTap.x" class="field px-2 py-2 text-sm" type="number" />
                <input v-model.number="form.metadata.loginSteps.submitTap.y" class="field px-2 py-2 text-sm" type="number" />
              </div>
            </label>
          </div>
          <textarea v-model.trim="form.notes" class="field min-h-20 resize-none" placeholder="Ghi chú checkpoint/proxy/2FA nếu có"></textarea>
          <button class="btn-primary w-full" :disabled="loading || !form.displayName || !form.instanceName || !form.metadata.username || !form.metadata.password">
            <ClipboardList class="h-4 w-4" />
            Thêm vào hàng điều khiển
          </button>
        </form>
      </BaseCard>

      <div class="space-y-5">
        <BaseCard>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-extrabold">Remote LDPlayer</h2>
              <p class="mt-1 text-sm text-zinc-500">Mở giả lập, xem màn hình, click để tap và nhập liệu trực tiếp qua ADB.</p>
            </div>
            <select v-model="selectedRemoteId" class="field max-w-xs" @change="screenshot = null">
              <option v-for="account in accounts" :key="account._id" :value="account._id">
                {{ account.displayName }} - {{ account.instanceName }}
              </option>
            </select>
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
            <div class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
              <button
                class="relative grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400"
                :disabled="screenshotLoading || !selectedRemoteAccount"
                @click="clickScreenshot"
              >
                <img v-if="screenshotSrc" :src="screenshotSrc" alt="LDPlayer screenshot" class="h-full w-full object-contain" />
                <span v-else>{{ screenshotLoading ? 'Đang tải màn hình...' : 'Bấm Làm mới màn hình để remote' }}</span>
                <span v-if="screenshotLoading" class="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">Loading</span>
              </button>
            </div>

            <div class="space-y-3">
              <div class="grid gap-2 sm:grid-cols-2">
                <button class="btn-primary" :disabled="running || !selectedRemoteAccount" @click="remoteLaunch">
                  <Smartphone class="h-4 w-4" />
                  Mở LDPlayer
                </button>
                <button class="btn-soft" :disabled="running || !selectedRemoteAccount" @click="remoteOpenApp">
                  <Play class="h-4 w-4" />
                  Mở app
                </button>
                <button class="btn-soft" :disabled="screenshotLoading || !selectedRemoteAccount" @click="refreshScreenshot">
                  <RefreshCcw class="h-4 w-4" />
                  Làm mới màn hình
                </button>
                <button class="btn-soft" :disabled="!selectedRemoteAccount" @click="probe(selectedRemoteAccount)">
                  <Wifi class="h-4 w-4" />
                  Kiểm tra ADB
                </button>
              </div>

              <div class="grid gap-2 sm:grid-cols-3">
                <button class="btn-soft" :disabled="!selectedRemoteAccount" @click="sendRemoteKey('back')">
                  <Undo2 class="h-4 w-4" />
                  Back
                </button>
                <button class="btn-soft" :disabled="!selectedRemoteAccount" @click="sendRemoteKey('home')">
                  <Home class="h-4 w-4" />
                  Home
                </button>
                <button class="btn-soft" :disabled="!selectedRemoteAccount" @click="sendRemoteKey('enter')">
                  <Keyboard class="h-4 w-4" />
                  Enter
                </button>
              </div>

              <form class="grid gap-2 sm:grid-cols-[1fr_auto]" @submit.prevent="sendRemoteText">
                <input v-model="remoteTextInput" class="field" placeholder="Nhập text vào ô đang focus trong LDPlayer" />
                <button class="btn-primary" :disabled="!remoteTextInput.trim() || !selectedRemoteAccount">
                  <Send class="h-4 w-4" />
                  Gửi
                </button>
              </form>

              <div class="rounded-lg border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800">
                <div class="mb-2 flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-200">
                  <MousePointer2 class="h-4 w-4" />
                  Cách dùng
                </div>
                <p>1. Chọn nick, bấm Mở LDPlayer.</p>
                <p>2. Bấm Mở app hoặc tự mở app trong giả lập.</p>
                <p>3. Làm mới màn hình, click vào ảnh để tap, dùng ô nhập text để đăng nhập.</p>
              </div>
            </div>
          </div>
        </BaseCard>

        <BaseCard>
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-xl font-extrabold">Đăng Facebook qua LDPlayer</h2>
              <p class="mt-1 text-sm text-zinc-500">Mở composer trong app Facebook đã đăng nhập, kiểm tra màn hình rồi mới tự bấm đăng khi bật Auto post.</p>
            </div>
            <select v-model="selectedFacebookId" class="field max-w-xs">
              <option v-for="account in accounts" :key="account._id" :value="account._id">
                {{ account.displayName }} - {{ account.instanceName }}
              </option>
            </select>
          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div class="space-y-3">
              <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
                <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <button class="text-sm font-bold text-zinc-500" @click="resetFacebookComposer">Hủy</button>
                  <p class="font-extrabold">Bài viết mới</p>
                  <button
                    class="inline-flex items-center gap-2 rounded-full bg-[#1877f2] px-4 py-1.5 text-sm font-extrabold text-white disabled:opacity-50"
                    :disabled="facebookPosting || !facebookAutomationText.trim()"
                    @click="publishFacebookPost({ forceAutoSubmit: true })"
                  >
                    <Loader2 v-if="facebookPosting" class="h-4 w-4 animate-spin" />
                    Đăng
                  </button>
                </div>

                <div class="p-4">
                  <div class="mb-3 flex items-center gap-3">
                    <div class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-sm font-extrabold text-white">
                      {{ selectedFacebookAccount?.displayName?.slice(0, 1)?.toUpperCase() || 'F' }}
                    </div>
                    <div class="min-w-0">
                      <p class="font-extrabold">
                        {{ selectedFacebookAccount?.displayName || 'Facebook account' }}
                        <span v-if="facebookMetaTitle" class="font-semibold text-zinc-500 dark:text-zinc-400">
                          {{ facebookMetaTitle }}
                        </span>
                      </p>
                      <div class="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                        <select v-model="facebookPost.audience" class="rounded-md border-0 bg-zinc-100 px-2 py-1 text-[11px] font-bold outline-none dark:bg-zinc-800">
                          <option>Bạn bè</option>
                          <option>Công khai</option>
                          <option>Chỉ mình tôi</option>
                        </select>
                        <select v-model="facebookPost.album" class="rounded-md border-0 bg-zinc-100 px-2 py-1 text-[11px] font-bold outline-none dark:bg-zinc-800">
                          <option>Album</option>
                          <option>Dòng thời gian</option>
                          <option>Ảnh đại diện</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <textarea
                    v-model="facebookPost.text"
                    class="min-h-44 w-full resize-y bg-transparent text-xl leading-8 outline-none placeholder:text-zinc-400"
                    placeholder="Bạn đang nghĩ gì?"
                  ></textarea>

                  <div v-if="facebookPost.text.trim()" class="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <p class="whitespace-pre-line text-base leading-7">{{ facebookPost.text }}</p>
                    <div v-if="facebookPostMeta.length" class="mt-3 flex flex-wrap gap-2">
                      <span
                        v-for="item in facebookPostMeta"
                        :key="item.key"
                        :class="['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold', item.bg, item.tone]"
                      >
                        <span class="text-sm leading-none">{{ item.icon }}</span>
                        {{ item.text }}
                      </span>
                    </div>
                  </div>

                  <div v-if="facebookPost.attachments.length" class="mt-3 grid gap-2 sm:grid-cols-2">
                    <div
                      v-for="item in facebookPost.attachments"
                      :key="item.id"
                      class="group relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <img v-if="item.type === 'photo'" :src="item.url" :alt="item.name" class="h-40 w-full object-cover" />
                      <video v-else :src="item.url" class="h-40 w-full object-cover" muted controls></video>
                      <button
                        class="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"
                        title="Xóa tệp"
                        @click="removeFacebookAttachment(item)"
                      >
                        <XCircle class="h-4 w-4" />
                      </button>
                      <p class="truncate px-3 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">{{ item.name }}</p>
                    </div>
                  </div>

                  <div class="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <div class="mb-3 flex items-center justify-between">
                      <p class="text-sm font-extrabold">Thêm vào bài viết của bạn</p>
                      <span class="text-xs font-bold text-zinc-500">Facebook composer</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      <button class="grid h-11 place-items-center rounded-lg bg-zinc-100 text-emerald-500 dark:bg-zinc-900" title="Ảnh/video" @click="triggerFacebookAttachment('photo')"><Image class="h-5 w-5" /></button>
                      <button class="grid h-11 place-items-center rounded-lg bg-zinc-100 text-sky-500 dark:bg-zinc-900" title="Gắn thẻ" @click="setFacebookToolMode('tag')"><UserRoundPlus class="h-5 w-5" /></button>
                      <button class="grid h-11 place-items-center rounded-lg bg-zinc-100 text-amber-500 dark:bg-zinc-900" title="Cảm xúc" @click="setFacebookToolMode('feeling')"><Laugh class="h-5 w-5" /></button>
                      <button class="grid h-11 place-items-center rounded-lg bg-zinc-100 text-red-500 dark:bg-zinc-900" title="Vị trí" @click="setFacebookToolMode('location')"><MapPin class="h-5 w-5" /></button>
                      <button class="grid h-11 place-items-center rounded-lg bg-zinc-100 text-violet-500 dark:bg-zinc-900" title="Video" @click="triggerFacebookAttachment('video')"><Video class="h-5 w-5" /></button>
                      <button class="grid h-11 place-items-center rounded-lg bg-zinc-100 text-blue-500 dark:bg-zinc-900" title="Chủ đề" @click="setFacebookToolMode('topic')"><Tag class="h-5 w-5" /></button>
                    </div>
                    <input ref="facebookImageInput" class="hidden" type="file" accept="image/*" multiple @change="addFacebookAttachments($event, 'photo')" />
                    <input ref="facebookVideoInput" class="hidden" type="file" accept="video/*" multiple @change="addFacebookAttachments($event, 'video')" />

                    <div v-if="facebookToolMode" class="mt-3 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900">
                      <input
                        v-if="facebookToolMode === 'tag'"
                        v-model="facebookPost.tags"
                        class="field"
                        placeholder="Nhập tên bạn bè muốn gắn thẻ"
                      />
                      <div v-else-if="facebookToolMode === 'feeling'" class="grid gap-2 sm:grid-cols-4">
                        <button
                          v-for="feeling in feelingOptions"
                          :key="feeling.label"
                          class="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-extrabold transition hover:bg-white dark:border-zinc-800 dark:hover:bg-zinc-950"
                          :class="facebookPost.feeling === feeling.label ? ['border-[#1877f2] text-[#1877f2]', feeling.bg] : 'text-zinc-700 dark:text-zinc-200'"
                          @click="facebookPost.feeling = facebookPost.feeling === feeling.label ? '' : feeling.label"
                        >
                          <span class="text-base leading-none">{{ feeling.icon }}</span>
                          {{ feeling.label }}
                        </button>
                      </div>
                      <input
                        v-else-if="facebookToolMode === 'location'"
                        v-model="facebookPost.location"
                        class="field"
                        placeholder="Bạn đang ở đâu?"
                      />
                      <input
                        v-else-if="facebookToolMode === 'topic'"
                        v-model="facebookPost.topic"
                        class="field"
                        placeholder="Nhập chủ đề cho bài viết"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <label class="flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-bold dark:border-zinc-800">
                  <input v-model="facebookPost.autoSubmit" type="checkbox" class="h-4 w-4" />
                  Auto post sau khi mở composer
                </label>
                <label class="grid grid-cols-[auto_90px] items-center gap-2 text-sm font-bold text-zinc-500">
                  X
                  <input v-model.number="facebookPost.submitTap.x" class="field px-3 py-2 text-sm" type="number" />
                </label>
                <label class="grid grid-cols-[auto_90px] items-center gap-2 text-sm font-bold text-zinc-500">
                  Y
                  <input v-model.number="facebookPost.submitTap.y" class="field px-3 py-2 text-sm" type="number" />
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <p class="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-500 dark:border-zinc-800">
                  Tọa độ ô "What's on your mind?"
                </p>
                <label class="grid grid-cols-[auto_90px] items-center gap-2 text-sm font-bold text-zinc-500">
                  X
                  <input v-model.number="facebookPost.composerTap.x" class="field px-3 py-2 text-sm" type="number" />
                </label>
                <label class="grid grid-cols-[auto_90px] items-center gap-2 text-sm font-bold text-zinc-500">
                  Y
                  <input v-model.number="facebookPost.composerTap.y" class="field px-3 py-2 text-sm" type="number" />
                </label>
              </div>

              <div class="flex flex-wrap gap-2">
                <button class="btn-primary" :disabled="facebookPosting || !selectedFacebookAccount || !facebookAutomationText.trim()" @click="publishFacebookPost()">
                  <Loader2 v-if="facebookPosting" class="h-4 w-4 animate-spin" />
                  <Send v-else class="h-4 w-4" />
                  {{ facebookPost.autoSubmit ? 'Đăng Facebook' : 'Mở composer' }}
                </button>
                <button class="btn-soft" :disabled="!selectedFacebookAccount" @click="selectedRemoteId = selectedFacebookAccount._id; refreshScreenshot()">
                  <RefreshCcw class="h-4 w-4" />
                  Xem màn hình
                </button>
              </div>

              <p class="text-sm text-zinc-500">
                Khi test lần đầu, để tắt Auto post, bấm Mở composer, xem screenshot rồi chỉnh tọa độ X/Y của nút Đăng. Text tiếng Việt có dấu sẽ được gửi qua clipboard/paste Unicode khi thiết bị hỗ trợ.
              </p>
            </div>

            <div class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
              <div class="grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400">
                <img v-if="facebookScreenshotSrc" :src="facebookScreenshotSrc" alt="Facebook composer screenshot" class="h-full w-full object-contain" />
                <span v-else>Screenshot composer sẽ hiển thị ở đây</span>
              </div>
            </div>
          </div>
        </BaseCard>

        <BaseCard>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-extrabold">Batch tự động</h2>
              <p class="mt-1 text-sm text-zinc-500">{{ selectedAccounts.length }} nick đang được chọn.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-soft" :disabled="loading || running" @click="load">
                <RefreshCcw class="h-4 w-4" />
                Làm mới
              </button>
              <button v-if="jobIsActive" class="btn-soft" @click="cancelJob">
                <XCircle class="h-4 w-4" />
                Hủy batch
              </button>
              <button class="btn-primary" :disabled="!canRunBatch" @click="runBatch">
                <Loader2 v-if="running" class="h-4 w-4 animate-spin" />
                <Play v-else class="h-4 w-4" />
                Chạy batch
              </button>
            </div>
          </div>

          <div v-if="activeJob" class="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="mb-2 flex items-center justify-between gap-3">
              <p class="text-sm font-bold">Job {{ activeJob.status }}</p>
              <p class="text-sm text-zinc-500">{{ activeJob.completed }} xong · {{ activeJob.failed }} lỗi · {{ activeJob.total }} tổng</p>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div class="h-full bg-zinc-950 transition-all dark:bg-white" :style="{ width: `${jobProgress}%` }"></div>
            </div>
          </div>

          <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table class="w-full min-w-[760px] text-left text-sm">
              <thead class="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th class="w-12 px-4 py-3"></th>
                  <th class="px-4 py-3">Nick</th>
                  <th class="px-4 py-3">Instance</th>
                  <th class="px-4 py-3">ADB</th>
                  <th class="px-4 py-3">Trạng thái</th>
                  <th class="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr v-for="account in accounts" :key="account._id" class="bg-white dark:bg-zinc-950">
                  <td class="px-4 py-3">
                    <input type="checkbox" class="h-4 w-4" :checked="selectedIds.includes(account._id)" @change="toggleAccount(account)" />
                  </td>
                  <td class="px-4 py-3">
                    <p class="font-bold">{{ account.displayName }}</p>
                    <p class="text-xs text-zinc-500">{{ account.metadata?.username || account.accountHandle || '-' }} · {{ account.platform }}</p>
                  </td>
                  <td class="px-4 py-3">{{ account.instanceName }}</td>
                  <td class="px-4 py-3">{{ account.deviceId || account.adbHost || '-' }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full border border-zinc-200 px-3 py-1 text-xs font-bold dark:border-zinc-700">
                      {{ statusLabels[account.status] || account.status }}
                    </span>
                    <p class="mt-1 text-xs text-zinc-500">Login: {{ formatDate(account.lastLoginAt) }}</p>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-2">
                      <button class="btn-soft h-9 px-3" :disabled="running" @click="probe(account)">
                        <Wifi class="h-4 w-4" />
                        ADB
                      </button>
                      <button class="btn-primary h-9 px-3" :disabled="running" @click="runOne(account)">
                        <Play class="h-4 w-4" />
                        Login
                      </button>
                      <button class="btn-soft h-9 px-3" :disabled="running" @click="deleteAccount(account)">
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!accounts.length" class="p-6 text-sm text-zinc-500">Chưa có nick nào trong hàng điều khiển.</p>
          </div>
        </BaseCard>

        <BaseCard>
          <div class="mb-4 flex items-center gap-2">
            <Terminal class="h-5 w-5 text-zinc-500" />
            <h3 class="text-lg font-extrabold">Log tự động</h3>
          </div>
          <div class="max-h-[440px] space-y-2 overflow-auto pr-1">
            <article v-for="log in latestLogs" :key="log._id" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="font-bold">{{ formatLog(log) }} · {{ log.action }}</p>
                <span :class="['rounded-full px-2 py-1 text-xs font-bold uppercase', log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
                  {{ log.level }}
                </span>
              </div>
              <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{{ log.message }}</p>
              <p class="mt-2 text-xs text-zinc-500">{{ formatDate(log.createdAt) }}</p>
            </article>
            <p v-if="!latestLogs.length" class="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
              Chưa có log tự động.
            </p>
          </div>
        </BaseCard>
      </div>
    </div>
  </div>
</template>
