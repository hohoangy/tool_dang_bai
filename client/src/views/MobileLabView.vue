<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Copy, Eraser, Eye, FileText, Home, Image, Keyboard, ListChecks, Loader2, MousePointer2, Play, RefreshCcw, Save, Send, Smartphone, Terminal, Undo2, Wifi, XCircle } from 'lucide-vue-next';
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
const workflowStage = ref('idle');
const publishMode = ref('direct');
const composerTab = ref('compose');
const selectedQueueAccountIds = ref([]);
const queueItems = ref([]);
const queueRunning = ref(false);
const queueDelaySeconds = ref(15);
const drafts = ref([]);
const textFormat = reactive({
  bold: false,
  italic: false,
  underline: false
});

const maxPhotos = 4;
const draftStorageKey = 'socialpilot-facebook-composer-drafts';

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
  text: '',
  hashtags: '',
  media: []
});

const composerTabs = [
  { id: 'compose', label: 'Soạn' },
  { id: 'preview', label: 'Preview' },
  { id: 'queue', label: 'Queue' }
];

const plainFormatChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const boldFormatChars = Array.from('𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵');
const italicFormatChars = Array.from('𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻');
const legacyFormatCharSets = [
  boldFormatChars,
  italicFormatChars
];
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
const facebookAccounts = computed(() => accounts.value.filter((account) => account.platform === 'facebook'));
const selectedQueueAccounts = computed(() => facebookAccounts.value.filter((account) => selectedQueueAccountIds.value.includes(account._id)));
const uploadedPhotoCount = computed(() => post.media.filter((item) => item.type === 'photo' && item.uploadedUrl).length);
const normalizedHashtags = computed(() => String(post.hashtags || '')
  .split(/[,\s]+/)
  .map((tag) => tag.trim())
  .filter(Boolean)
  .map((tag) => tag.startsWith('#') ? tag : `#${tag}`)
  .join(' '));
const hashtagItems = computed(() => normalizedHashtags.value ? normalizedHashtags.value.split(/\s+/).filter(Boolean) : []);
const finalPostText = computed(() => [normalizeTextFormatArtifacts(post.text).trim(), normalizedHashtags.value].filter(Boolean).join('\n\n'));
const characterCount = computed(() => finalPostText.value.length);
const previewCaption = computed(() => normalizeTextFormatArtifacts(post.text).trim());
const composerTextClass = computed(() => ({
  'font-extrabold': textFormat.bold,
  italic: textFormat.italic,
  underline: textFormat.underline,
  'underline-offset-4': textFormat.underline
}));
const facebookAppPackage = computed(() => selectedAccount.value?.metadata?.appPackage || selectedPlatform.value.packageName);
const isBulkMode = computed(() => publishMode.value === 'bulk');
const isReviewMode = computed(() => publishMode.value === 'review');
const isScheduleMode = computed(() => publishMode.value === 'schedule');
const queueReady = computed(() => !isBulkMode.value || selectedQueueAccounts.value.length > 0);
const scheduleReady = computed(() => true);
const canRunWorkflow = computed(() => selectedPlatform.value.status === 'ready'
  && canUseRemote.value
  && queueReady.value
  && scheduleReady.value
  && Boolean(finalPostText.value.trim())
  && !posting.value
  && !queueRunning.value
  && !mediaUploading.value);
const duplicateDraft = computed(() => drafts.value.find((draft) => draft.text === finalPostText.value.trim()));
const composerChecks = computed(() => [
  {
    label: 'Hashtag',
    detail: normalizedHashtags.value || 'Không dùng hashtag',
    ok: true
  },
  {
    label: 'Trùng nội dung',
    detail: duplicateDraft.value ? `Trùng nháp: ${duplicateDraft.value.title}` : 'Không trùng nháp đã lưu',
    ok: !duplicateDraft.value
  },
  {
    label: 'Preview hashtag',
    detail: 'Hashtag hiển thị dạng chip để kiểm tra nhanh',
    ok: true
  }
]);
const workflowLabel = computed(() => {
  const labels = {
    idle: 'Sẵn sàng',
    preflight: 'Đang kiểm tra thiết bị',
    posting: 'Đang đăng bài',
    verified: 'Đã xác minh',
    review: 'Cần kiểm tra lại',
    failed: 'Có lỗi'
  };
  return labels[workflowStage.value] || labels.idle;
});
const workflowTone = computed(() => {
  if (workflowStage.value === 'verified') return 'ok';
  if (['review', 'failed'].includes(workflowStage.value)) return 'warn';
  if (['preflight', 'posting'].includes(workflowStage.value)) return 'run';
  return 'idle';
});
const preflightItems = computed(() => [
  {
    label: 'Profile Facebook',
    detail: selectedAccount.value ? `${selectedAccount.value.displayName} trên ${selectedAccount.value.instanceName}` : 'Chưa chọn profile',
    ok: Boolean(selectedAccount.value),
    blocking: true
  },
  {
    label: 'ADB target',
    detail: selectedAccount.value?.deviceId || selectedAccount.value?.adbHost || 'Chưa có ADB target',
    ok: Boolean(selectedAccount.value?.deviceId || selectedAccount.value?.adbHost),
    blocking: true
  },
  {
    label: 'Facebook app',
    detail: facebookAppPackage.value ? 'Đã cấu hình app Facebook' : 'Chưa cấu hình app Facebook',
    ok: Boolean(facebookAppPackage.value),
    blocking: true
  },
  {
    label: 'Nội dung',
    detail: `${characterCount.value}/5000 ký tự`,
    ok: characterCount.value > 0 && characterCount.value <= 5000,
    blocking: true
  },
  {
    label: 'Media',
    detail: uploadedPhotoCount.value ? `${uploadedPhotoCount.value}/${maxPhotos} ảnh đã sẵn sàng` : 'Không dùng ảnh',
    ok: !post.media.length || uploadedPhotoCount.value === post.media.length,
    blocking: false
  }
]);
const blockedPreflightItems = computed(() => preflightItems.value.filter((item) => item.blocking && !item.ok));
const recentPostRuns = computed(() => latestLogs.value
  .filter((log) => String(log.action || '').startsWith('facebook_post_'))
  .slice(0, 8));
const postResultSummary = computed(() => {
  if (!postResult.value) return null;
  if (postResult.value.submitVerified) {
    return {
      title: 'Đã xác minh bài đăng',
      detail: 'Facebook đã có tín hiệu nhận bài. Lưu lại screenshot/log để đối chiếu khi cần.',
      tone: 'ok'
    };
  }
  if (postResult.value.autoSubmit) {
    return {
      title: 'Đã bấm Đăng nhưng cần kiểm tra',
      detail: 'Automation chưa xác nhận được bài đã lên feed. Hãy xem screenshot và log mới nhất.',
      tone: 'warn'
    };
  }
  return {
    title: 'Composer đã mở',
    detail: 'Bài đang chờ thao tác trong Facebook app.',
    tone: 'run'
  };
});
const publishModes = [
  {
    id: 'direct',
    title: 'Đăng ngay',
    description: 'Kiểm tra thiết bị, mở Facebook và bấm Đăng tự động cho profile đang chọn.'
  },
  {
    id: 'review',
    title: 'Mở composer để kiểm tra',
    description: 'Chỉ nhập nội dung/media vào Facebook, không tự bấm Đăng.'
  },
  {
    id: 'bulk',
    title: 'Queue nhiều tài khoản',
    description: 'Đăng tuần tự qua nhiều LDPlayer profile, có delay giữa mỗi lượt.'
  },
  {
    id: 'schedule',
    title: 'Lên lịch',
    description: 'Lưu lịch đăng để chuẩn bị cho scheduler chạy nền.'
  }
];
const queueStats = computed(() => {
  const total = queueItems.value.length;
  return {
    total,
    done: queueItems.value.filter((item) => item.status === 'done').length,
    review: queueItems.value.filter((item) => item.status === 'review').length,
    failed: queueItems.value.filter((item) => item.status === 'failed').length,
    running: queueItems.value.filter((item) => item.status === 'running').length
  };
});
const primaryActionLabel = computed(() => {
  if (isReviewMode.value) return 'Mở kiểm tra';
  if (isBulkMode.value) return `Chạy queue (${selectedQueueAccounts.value.length})`;
  if (isScheduleMode.value) return 'Lưu lịch';
  return 'Đăng';
});

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
  if (!selectedQueueAccountIds.value.length) {
    selectedQueueAccountIds.value = nextAccounts.filter((account) => account.platform === 'facebook').slice(0, 1).map((account) => account._id);
  } else {
    const availableIds = new Set(nextAccounts.map((account) => account._id));
    selectedQueueAccountIds.value = selectedQueueAccountIds.value.filter((id) => availableIds.has(id));
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
    workflowStage.value = 'failed';
    return;
  }
  if (selectedPlatform.value.status !== 'ready') {
    ui.notify(`Workflow ${selectedPlatform.value.label} se duoc them sau. Hien tai Facebook da san sang.`, 'error');
    workflowStage.value = 'failed';
    return;
  }
  if (!finalPostText.value.trim()) {
    ui.notify('Thieu noi dung bai dang.', 'error');
    workflowStage.value = 'failed';
    return;
  }
  if (blockedPreflightItems.value.length) {
    ui.notify(`Chua san sang: ${blockedPreflightItems.value.map((item) => item.label).join(', ')}`, 'error');
    workflowStage.value = 'failed';
    return;
  }
  if (isScheduleMode.value) {
    workflowStage.value = 'idle';
    ui.notify('Chế độ lên lịch sẽ nối ở bước sau. Hiện tại hãy dùng Đăng ngay hoặc Mở composer.');
    return;
  }
  if (isBulkMode.value) {
    await runQueueWorkflow();
    return;
  }

  posting.value = true;
  postResult.value = null;
  try {
    workflowStage.value = 'preflight';
    await http.post(`/mobile/accounts/${selectedAccount.value._id}/probe`);
    workflowStage.value = 'posting';
    const { data } = await submitFacebookForAccount(selectedAccount.value, !isReviewMode.value);
    postResult.value = data.result;
    screenshot.value = data.result.screenshot || screenshot.value;
    if (isReviewMode.value) {
      workflowStage.value = 'review';
      ui.notify('Đã mở composer để bạn kiểm tra trước khi đăng.');
    } else if (data.result.submitVerified === false) {
      workflowStage.value = 'review';
      ui.notify('Đã bấm Đăng nhưng chưa xác nhận Facebook đã nhận bài. Hãy xem screenshot/log.', 'error');
    } else {
      workflowStage.value = 'verified';
      ui.notify('Đã đăng và xác minh bài Facebook.');
    }
    await load();
  } catch (error) {
    workflowStage.value = 'failed';
    ui.notify(error.message, 'error');
  } finally {
    posting.value = false;
  }
}

async function runQueueWorkflow() {
  if (!selectedQueueAccounts.value.length) {
    ui.notify('Chưa chọn tài khoản để chạy queue.', 'error');
    workflowStage.value = 'failed';
    return;
  }

  posting.value = true;
  queueRunning.value = true;
  postResult.value = null;
  workflowStage.value = 'posting';
  queueItems.value = selectedQueueAccounts.value.map((account, index) => ({
    id: account._id,
    name: account.displayName,
    instanceName: account.instanceName,
    status: index === 0 ? 'running' : 'pending',
    message: index === 0 ? 'Đang xử lý' : 'Đang chờ',
    result: null
  }));

  try {
    for (let index = 0; index < selectedQueueAccounts.value.length; index += 1) {
      const account = selectedQueueAccounts.value[index];
      updateQueueItem(account._id, { status: 'running', message: 'Đang kiểm tra ADB' });
      selectedAccountId.value = account._id;
      await http.post(`/mobile/accounts/${account._id}/probe`);

      updateQueueItem(account._id, { status: 'running', message: 'Đang đăng bài' });
      const { data } = await submitFacebookForAccount(account, true);
      postResult.value = data.result;
      screenshot.value = data.result.screenshot || screenshot.value;

      if (data.result.submitVerified === false) {
        updateQueueItem(account._id, { status: 'review', message: 'Đã bấm Đăng, cần kiểm tra lại', result: data.result });
      } else {
        updateQueueItem(account._id, { status: 'done', message: 'Đã đăng và xác minh', result: data.result });
      }

      if (index < selectedQueueAccounts.value.length - 1 && queueDelaySeconds.value > 0) {
        updateQueueItem(selectedQueueAccounts.value[index + 1]._id, { status: 'waiting', message: `Chờ ${queueDelaySeconds.value}s trước lượt đăng` });
        await wait(queueDelaySeconds.value * 1000);
      }
    }

    workflowStage.value = queueStats.value.failed ? 'failed' : (queueStats.value.review ? 'review' : 'verified');
    ui.notify(`Queue hoàn tất: ${queueStats.value.done} thành công, ${queueStats.value.review} cần kiểm tra, ${queueStats.value.failed} lỗi.`);
    await load();
  } catch (error) {
    workflowStage.value = 'failed';
    const current = queueItems.value.find((item) => item.status === 'running');
    if (current) updateQueueItem(current.id, { status: 'failed', message: error.message });
    ui.notify(error.message, 'error');
    await load();
  } finally {
    posting.value = false;
    queueRunning.value = false;
  }
}

function submitFacebookForAccount(account, autoSubmit) {
  return http.post(`/mobile/accounts/${account._id}/facebook/post`, {
    text: finalPostText.value.trim(),
    appPackage: account.metadata?.appPackage || selectedPlatform.value.packageName,
    autoSubmit,
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
}

function updateQueueItem(id, patch) {
  queueItems.value = queueItems.value.map((item) => item.id === id ? { ...item, ...patch } : item);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toggleQueueAccount(accountId) {
  if (selectedQueueAccountIds.value.includes(accountId)) {
    selectedQueueAccountIds.value = selectedQueueAccountIds.value.filter((id) => id !== accountId);
    return;
  }
  selectedQueueAccountIds.value = [...selectedQueueAccountIds.value, accountId];
}

function loadDrafts() {
  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    drafts.value = raw ? JSON.parse(raw) : [];
  } catch {
    drafts.value = [];
  }
}

function persistDrafts() {
  window.localStorage.setItem(draftStorageKey, JSON.stringify(drafts.value.slice(0, 20)));
}

function saveDraft(status = 'draft') {
  if (!finalPostText.value.trim()) {
    ui.notify('Chưa có nội dung để lưu nháp.', 'error');
    return;
  }
  const draft = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: `Bài nháp ${new Date().toLocaleString('vi-VN')}`,
    type: 'photo',
    text: finalPostText.value.trim(),
    rawText: normalizeTextFormatArtifacts(post.text),
    hashtags: post.hashtags,
    mediaCount: post.media.length,
    status,
    createdAt: new Date().toISOString()
  };
  drafts.value = [draft, ...drafts.value.filter((item) => item.text !== draft.text)].slice(0, 20);
  persistDrafts();
  ui.notify(status === 'scheduled' ? 'Đã lưu lịch đăng.' : 'Đã lưu nháp bài đăng.');
}

function loadDraft(draft) {
  post.text = normalizeTextFormatArtifacts(draft.rawText || draft.text || '');
  post.hashtags = draft.hashtags || '';
  composerTab.value = 'compose';
  ui.notify('Đã tải nháp vào composer.');
}

function duplicateComposer() {
  saveDraft('draft');
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
  await insertAtCursor(emoji);
}

async function insertAtCursor(text, selectInserted = false) {
  const input = composerTextarea.value;
  if (!input) {
    post.text = `${post.text || ''}${text}`;
    return;
  }

  const currentText = post.text || '';
  const start = input.selectionStart ?? currentText.length;
  const end = input.selectionEnd ?? currentText.length;
  post.text = `${currentText.slice(0, start)}${text}${currentText.slice(end)}`;
  await nextTick();
  input.focus();
  const nextCursor = start + text.length;
  input.setSelectionRange(selectInserted ? start : nextCursor, nextCursor);
}

function selectedTextRange() {
  const input = composerTextarea.value;
  const currentText = post.text || '';
  if (!input) return { start: currentText.length, end: currentText.length, value: '' };
  const start = input.selectionStart ?? currentText.length;
  const end = input.selectionEnd ?? currentText.length;
  return { start, end, value: currentText.slice(start, end) };
}

async function replaceSelection(text) {
  const input = composerTextarea.value;
  const { start, end } = selectedTextRange();
  const currentText = post.text || '';
  post.text = `${currentText.slice(0, start)}${text}${currentText.slice(end)}`;
  await nextTick();
  input?.focus();
  input?.setSelectionRange(start, start + text.length);
}

function cleanCaption() {
  post.text = normalizeTextFormatArtifacts(post.text)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  post.hashtags = String(post.hashtags || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ');
  ui.notify('Đã dọn khoảng trắng và chuẩn hóa caption.');
}

function normalizeTextFormatArtifacts(value = '') {
  return (value == null ? '' : String(value))
    .replace(/\u0332{2,}/g, '\u0332')
    .replace(/([^\s])\u0332(?=\u0332)/g, '$1\u0332');
}

function stripTextFormatArtifacts(value = '') {
  const chars = Array.from(String(value).replace(/\u0332/g, ''));
  return chars.map((char) => {
    for (const set of legacyFormatCharSets) {
      const index = set.indexOf(char);
      if (index >= 0) return plainFormatChars[index] || char;
    }
    return char;
  }).join('');
}

function applyTextStyle(style, value = '') {
  const source = stripTextFormatArtifacts(value);
  if (style === 'bold') return mapTextWithFormat(source, boldFormatChars);
  if (style === 'italic') return mapTextWithFormat(source, italicFormatChars);
  if (style === 'underline') {
    return Array.from(source).map((char) => (/\s/.test(char) ? char : `${char}\u0332`)).join('');
  }
  return source;
}

function mapTextWithFormat(value, formatChars) {
  return Array.from(value).map((char) => {
    const index = plainFormatChars.indexOf(char);
    return index >= 0 && formatChars[index] ? formatChars[index] : char;
  }).join('');
}

function selectionHasStyle(value, style) {
  const chars = Array.from(value);
  if (style === 'bold') return chars.some((char) => boldFormatChars.includes(char));
  if (style === 'italic') return chars.some((char) => italicFormatChars.includes(char));
  if (style === 'underline') return /\u0332/.test(value);
  return false;
}

function clearComposerWideFormat() {
  textFormat.bold = false;
  textFormat.italic = false;
  textFormat.underline = false;
}

function toggleTextFormat(style) {
  if (!Object.prototype.hasOwnProperty.call(textFormat, style)) return;
  const { value } = selectedTextRange();
  if (value) {
    const nextValue = selectionHasStyle(value, style)
      ? stripTextFormatArtifacts(value)
      : applyTextStyle(style, value);
    clearComposerWideFormat();
    replaceSelection(nextValue);
    return;
  }

  textFormat[style] = !textFormat[style];
  composerTextarea.value?.focus();
}

function resetComposer() {
  post.text = '';
  post.hashtags = '';
  post.media.forEach((item) => URL.revokeObjectURL(item.url));
  post.media = [];
  postResult.value = null;
  clearComposerWideFormat();
  showEmojiPicker.value = false;
  workflowStage.value = 'idle';
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
  loadDrafts();
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
          <h2 class="text-xl font-extrabold">Kênh & thiết bị</h2>
        </div>

        <label class="space-y-2 text-sm font-bold text-zinc-500">
          Nền tảng
          <select v-model="selectedPlatformId" class="field">
            <option v-for="platform in platforms" :key="platform.id" :value="platform.id">
              {{ platform.label }}
            </option>
          </select>
        </label>

        <label class="mt-3 block space-y-2 text-sm font-bold text-zinc-500">
          Profile Facebook
          <select v-model="selectedAccountId" class="field">
            <option v-for="account in facebookAccounts" :key="account._id" :value="account._id">
              {{ account.displayName }} - {{ account.instanceName }}
            </option>
          </select>
        </label>

        <div class="mt-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p class="font-extrabold text-white">{{ selectedAccountLabel }}</p>
          <p class="mt-2 text-zinc-500">Package: {{ selectedAccount?.metadata?.appPackage || selectedPlatform.packageName }}</p>
          <p class="text-zinc-500">ADB: {{ selectedAccount?.deviceId || selectedAccount?.adbHost || '127.0.0.1:5555' }}</p>
          <p class="text-zinc-500">Trạng thái profile: {{ selectedAccount?.status || 'ready' }}</p>
        </div>

        <div class="mt-4 rounded-lg bg-zinc-100 p-4 text-sm leading-6 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          <p class="font-extrabold text-zinc-900 dark:text-white">Nguyên tắc vận hành</p>
          <p>Mỗi profile dùng một LDPlayer/ADB riêng để giảm lỗi khi đăng hàng loạt.</p>
          <p class="mt-2">API chính thức dùng cho Page/token. Mobile fallback dùng khi cần đăng qua app thật hoặc xử lý checkpoint.</p>
        </div>
      </BaseCard>

      <BaseCard>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-extrabold">Remote Control</h2>
            <p class="mt-1 text-sm text-zinc-500">Điều khiển app thật trong LDPlayer: mở app, chụp màn hình, tap và nhập text.</p>
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
                Mở LDPlayer
              </button>
              <button class="btn-soft" :disabled="running || !canUseRemote" @click="remoteOpenApp">
                <Play class="h-4 w-4" />
                Mở app {{ selectedPlatform.label }}
              </button>
              <button class="btn-soft" :disabled="screenshotLoading || !canUseRemote" @click="refreshScreenshot">
                <RefreshCcw class="h-4 w-4" />
                Làm mới màn hình
              </button>
              <button class="btn-soft" :disabled="!canUseRemote" @click="probeDevice">
                <Wifi class="h-4 w-4" />
                Kiểm tra ADB
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
              <input v-model="remoteTextInput" class="field" placeholder="Nhập text vào ô đang focus trong LDPlayer" />
              <button class="btn-primary" :disabled="!remoteTextInput.trim() || !canUseRemote">
                <Send class="h-4 w-4" />
                Gửi
              </button>
            </form>

            <div class="rounded-lg border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800">
              <div class="mb-2 flex items-center gap-2 font-bold text-zinc-700 dark:text-zinc-200">
                <MousePointer2 class="h-4 w-4" />
                Cách dùng nhanh
              </div>
              <p>1. Bấm Mở LDPlayer, sau đó Kiểm tra ADB.</p>
              <p>2. Bấm Mở app {{ selectedPlatform.label }} và Làm mới màn hình.</p>
              <p>3. Click trực tiếp vào screenshot để tap, dùng ô text để nhập thủ công khi cần.</p>
            </div>
          </div>
        </div>
      </BaseCard>
    </div>

    <BaseCard>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-xl font-extrabold">Đăng Facebook qua LDPlayer</h2>
          <p class="mt-1 text-sm text-zinc-500">Soạn nội dung, kiểm tra thiết bị, đăng qua app Facebook thật và xác minh kết quả.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-soft h-10 px-3" title="Xóa nội dung đang soạn" @click="resetComposer">
            <RefreshCcw class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Chế độ đăng</p>
              <h3 class="mt-1 font-extrabold">Workflow vận hành</h3>
            </div>
            <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {{ publishModes.find((mode) => mode.id === publishMode)?.title }}
            </span>
          </div>
          <div class="grid gap-2 md:grid-cols-4">
            <button
              v-for="mode in publishModes"
              :key="mode.id"
              :class="[
                'rounded-lg border p-3 text-left transition',
                publishMode === mode.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900'
              ]"
              type="button"
              :disabled="posting || queueRunning"
              @click="publishMode = mode.id"
            >
              <p class="font-extrabold">{{ mode.title }}</p>
              <p class="mt-1 text-xs leading-5 text-zinc-500">{{ mode.description }}</p>
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Tài khoản queue</p>
              <h3 class="mt-1 font-extrabold">{{ selectedQueueAccounts.length }}/{{ facebookAccounts.length }} profile được chọn</h3>
            </div>
            <label class="w-24 text-xs font-bold text-zinc-500">
              Delay
              <input
                v-model.number="queueDelaySeconds"
                class="field mt-1 h-9 px-2 text-sm"
                type="number"
                min="0"
                max="600"
                :disabled="posting || queueRunning"
              />
            </label>
          </div>
          <div class="max-h-40 space-y-2 overflow-auto pr-1">
            <button
              v-for="account in facebookAccounts"
              :key="account._id"
              class="flex w-full items-center gap-3 rounded-lg border border-zinc-200 p-3 text-left text-sm transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
              type="button"
              :disabled="posting || queueRunning"
              @click="toggleQueueAccount(account._id)"
            >
              <span
                :class="[
                  'grid h-5 w-5 shrink-0 place-items-center rounded border text-xs',
                  selectedQueueAccountIds.includes(account._id) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-500'
                ]"
              >
                <CheckCircle2 v-if="selectedQueueAccountIds.includes(account._id)" class="h-3.5 w-3.5" />
              </span>
              <span class="min-w-0">
                <span class="block truncate font-extrabold">{{ account.displayName }}</span>
                <span class="block truncate text-xs text-zinc-500">{{ account.instanceName }} · {{ account.deviceId || account.adbHost || 'ADB chưa cấu hình' }}</span>
              </span>
            </button>
            <p v-if="!facebookAccounts.length" class="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
              Chưa có profile Facebook để chọn.
            </p>
          </div>
        </div>
      </div>

      <div class="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Caption tools</p>
              <h3 class="mt-1 font-extrabold">Tối ưu caption</h3>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-soft h-9 px-3 text-sm" type="button" @click="saveDraft('draft')">
                <Save class="h-4 w-4" />
                Lưu nháp
              </button>
              <button class="btn-soft h-9 px-3 text-sm" type="button" @click="duplicateComposer">
                <Copy class="h-4 w-4" />
                Nhân bản
              </button>
            </div>
          </div>

          <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <label class="block space-y-2 text-sm font-bold text-zinc-500">
              Hashtag chiến dịch
              <div class="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 focus-within:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-lg font-black text-emerald-500">#</span>
                <input
                  v-model="post.hashtags"
                  class="min-w-0 flex-1 bg-transparent text-sm font-bold text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white"
                  placeholder="marketing facebook automation"
                />
              </div>
            </label>
            <div class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="tag in hashtagItems"
                :key="tag"
                class="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-extrabold text-blue-500"
              >
                {{ tag }}
              </span>
              <span v-if="!hashtagItems.length" class="text-xs font-medium text-zinc-500">
                Nhập cách nhau bằng dấu cách hoặc dấu phẩy. Tool tự thêm dấu # khi đăng.
              </span>
            </div>
            <p class="mt-3 text-xs leading-5 text-zinc-500">
              Hashtag sẽ được chuẩn hóa và gắn cuối caption khi đăng thật qua Facebook app.
            </p>
          </div>
        </div>

        <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="mb-3 flex items-center gap-2">
            <ListChecks class="h-4 w-4 text-zinc-500" />
            <h3 class="font-extrabold">Kiểm tra trước đăng</h3>
          </div>
          <div class="space-y-2">
            <div
              v-for="item in composerChecks"
              :key="item.label"
              class="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <CheckCircle2 v-if="item.ok" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <AlertTriangle v-else class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div class="min-w-0">
                <p class="font-extrabold">{{ item.label }}</p>
                <p class="truncate text-zinc-500">{{ item.detail }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="space-y-3">
          <div class="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-[#242526] dark:text-white">
            <div class="relative border-b border-zinc-200 px-4 py-4 text-center dark:border-zinc-700">
              <h3 class="text-xl font-extrabold">Tạo bài viết</h3>
              <button
                class="absolute right-3 top-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-extrabold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!canRunWorkflow"
                @click="runPostWorkflow()"
              >
                <Loader2 v-if="posting" class="h-4 w-4 animate-spin" />
                <Send v-else class="h-4 w-4" />
                {{ primaryActionLabel }}
              </button>
            </div>

            <div class="space-y-4 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-sm font-extrabold text-white">
                    {{ accountInitial }}
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-extrabold">{{ selectedAccount?.displayName || 'Facebook profile' }}</p>
                    <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">{{ selectedAccount?.instanceName || 'LDPlayer' }} · {{ selectedAccount?.deviceId || selectedAccount?.adbHost || 'ADB chưa cấu hình' }}</p>
                  </div>
                </div>

                <div class="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    v-for="tab in composerTabs"
                    :key="tab.id"
                    :class="[
                      'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-extrabold transition',
                      composerTab === tab.id ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                    ]"
                    type="button"
                    @click="composerTab = tab.id"
                  >
                    <FileText v-if="tab.id === 'compose'" class="h-3.5 w-3.5" />
                    <Eye v-else-if="tab.id === 'preview'" class="h-3.5 w-3.5" />
                    <CalendarClock v-else class="h-3.5 w-3.5" />
                    {{ tab.label }}
                  </button>
                </div>
              </div>

              <div v-if="composerTab === 'compose'" class="space-y-3">
                <div class="relative">
                <textarea
                  ref="composerTextarea"
                  v-model="post.text"
                  :class="[
                    'min-h-32 w-full resize-y bg-transparent text-2xl leading-9 outline-none placeholder:text-zinc-400',
                    composerTextClass
                  ]"
                  placeholder="Bạn đang nghĩ gì?"
                  @focus="showEmojiPicker = false"
                ></textarea>
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
                    <span>Emoji sẽ chèn vào nội dung bài viết</span>
                    <button class="font-bold text-zinc-300 hover:text-white" type="button" @click="showEmojiPicker = false">Đóng</button>
                  </div>
                </div>
              </div>

                <div v-if="post.media.length" class="px-1">
                  <div class="grid max-w-3xl gap-2 sm:grid-cols-2">
                    <div
                      v-for="item in post.media"
                      :key="item.id"
                      class="group relative overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <img v-if="item.type === 'photo'" :src="item.url" :alt="item.name" class="h-44 w-full object-cover" />
                      <button
                        class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black"
                        title="Xóa tệp"
                        type="button"
                        @click="removeMedia(item)"
                      >
                        <XCircle class="h-5 w-5" />
                      </button>
                      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                        <p class="truncate text-xs font-bold text-white">{{ item.name }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                  <div class="flex flex-wrap items-center gap-1">
                    <button
                      :class="[
                        'grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white',
                        textFormat.bold ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500'
                      ]"
                      type="button"
                      title="Bật/tắt chữ đậm trong composer"
                      @click="toggleTextFormat('bold')"
                    >
                      <span class="text-sm font-black">B</span>
                    </button>
                    <button
                      :class="[
                        'grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white',
                        textFormat.italic ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500'
                      ]"
                      type="button"
                      title="Bật/tắt chữ nghiêng trong composer"
                      @click="toggleTextFormat('italic')"
                    >
                      <span class="text-sm font-black italic">I</span>
                    </button>
                    <button
                      :class="[
                        'grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white',
                        textFormat.underline ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500'
                      ]"
                      type="button"
                      title="Bật/tắt gạch chân trong composer"
                      @click="toggleTextFormat('underline')"
                    >
                      <span class="text-sm font-black underline underline-offset-2">U</span>
                    </button>
                  </div>

                  <div class="inline-flex items-center gap-1">
                    <button
                      class="grid h-8 w-8 place-items-center rounded-lg text-emerald-500 transition hover:bg-white hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800"
                      title="Thêm ảnh"
                      type="button"
                      :disabled="mediaUploading || post.media.length >= maxPhotos"
                      @click="mediaInput?.click()"
                    >
                      <Loader2 v-if="mediaUploading" class="h-4 w-4 animate-spin" />
                      <Image v-else class="h-4 w-4" />
                    </button>
                    <button
                      class="grid h-8 w-8 place-items-center rounded-lg text-orange-500 transition hover:bg-white hover:text-orange-600 dark:hover:bg-zinc-800"
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

              <div v-if="composerTab === 'preview'" class="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div class="flex items-center gap-3">
                  <div class="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-sm font-extrabold text-white">
                    {{ accountInitial }}
                  </div>
                  <div>
                    <p class="font-extrabold">{{ selectedAccount?.displayName || 'Facebook profile' }}</p>
                    <p class="text-xs text-zinc-500">Preview bài đăng · {{ characterCount }}/5000 ký tự</p>
                  </div>
                </div>
                <div v-if="finalPostText" class="space-y-3 text-lg leading-8">
                  <p v-if="previewCaption" :class="['whitespace-pre-wrap', composerTextClass]">{{ previewCaption }}</p>
                </div>
                <p v-else class="text-lg leading-8 text-zinc-500">Chưa có nội dung preview.</p>
                <div v-if="post.media.length" class="grid gap-2 sm:grid-cols-2">
                  <img
                    v-for="item in post.media"
                    :key="`preview-${item.id}`"
                    :src="item.url"
                    :alt="item.name"
                    class="h-48 w-full rounded-lg object-cover"
                  />
                </div>
                <div v-if="hashtagItems.length" class="flex flex-wrap gap-2">
                  <span
                    v-for="tag in hashtagItems"
                    :key="`preview-${tag}`"
                    class="inline-flex rounded-full bg-blue-500/10 px-3 py-1 text-sm font-extrabold text-blue-500"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <div v-if="composerTab === 'queue'" class="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="font-extrabold">Nháp & lịch đã lưu</p>
                    <p class="mt-1 text-sm text-zinc-500">Dùng để tải lại nội dung, nhân bản hoặc chuẩn bị lịch đăng.</p>
                  </div>
                  <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {{ drafts.length }} mục
                  </span>
                </div>
                <div class="max-h-72 space-y-2 overflow-auto pr-1">
                  <article v-for="draft in drafts" :key="draft.id" class="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate font-extrabold">{{ draft.title }}</p>
                        <p class="mt-1 line-clamp-2 text-zinc-500">{{ draft.text }}</p>
                        <p class="mt-2 text-xs text-zinc-500">
                          {{ draft.status === 'scheduled' ? 'Đã lên lịch' : 'Nháp' }} · {{ formatDate(draft.createdAt) }} · {{ draft.mediaCount }} ảnh
                        </p>
                      </div>
                      <button class="btn-soft h-9 shrink-0 px-3 text-xs" type="button" @click="loadDraft(draft)">
                        Tải
                      </button>
                    </div>
                  </article>
                  <p v-if="!drafts.length" class="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                    Chưa có nháp hoặc lịch cục bộ.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Trạng thái đăng</p>
                <h3 class="mt-1 text-lg font-extrabold">{{ workflowLabel }}</h3>
              </div>
              <span
                :class="[
                  'rounded-full px-3 py-1 text-xs font-extrabold uppercase',
                  workflowTone === 'ok' ? 'bg-emerald-100 text-emerald-700' : workflowTone === 'warn' ? 'bg-amber-100 text-amber-700' : workflowTone === 'run' ? 'bg-sky-100 text-sky-700' : 'bg-zinc-100 text-zinc-700'
                ]"
              >
                {{ workflowTone === 'ok' ? 'Đã xác minh' : workflowTone === 'warn' ? 'Cần kiểm tra' : workflowTone === 'run' ? 'Đang chạy' : 'Sẵn sàng' }}
              </span>
            </div>

            <div class="space-y-2">
              <div
                v-for="item in preflightItems"
                :key="item.label"
                class="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <CheckCircle2 v-if="item.ok" class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <AlertTriangle v-else class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div class="min-w-0">
                  <p class="font-extrabold">{{ item.label }}</p>
                  <p class="truncate text-zinc-500">{{ item.detail }}</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="queueItems.length" class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Queue đăng bài</p>
                <h3 class="mt-1 font-extrabold">{{ queueStats.done }} xong · {{ queueStats.review }} cần kiểm tra · {{ queueStats.failed }} lỗi</h3>
              </div>
              <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {{ queueStats.total }} lượt
              </span>
            </div>
            <div class="max-h-64 space-y-2 overflow-auto pr-1">
              <article v-for="item in queueItems" :key="item.id" class="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-extrabold">{{ item.name }}</p>
                    <p class="truncate text-xs text-zinc-500">{{ item.instanceName }}</p>
                  </div>
                  <span
                    :class="[
                      'rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase',
                      item.status === 'done' ? 'bg-emerald-100 text-emerald-700' : item.status === 'failed' ? 'bg-red-100 text-red-700' : item.status === 'review' ? 'bg-amber-100 text-amber-700' : item.status === 'running' ? 'bg-sky-100 text-sky-700' : 'bg-zinc-100 text-zinc-700'
                    ]"
                  >
                    {{ item.status === 'done' ? 'xong' : item.status === 'failed' ? 'lỗi' : item.status === 'review' ? 'kiểm tra' : item.status === 'running' ? 'đang chạy' : item.status === 'waiting' ? 'đợi' : 'chờ' }}
                  </span>
                </div>
                <p class="mt-2 text-zinc-500">{{ item.message }}</p>
              </article>
            </div>
          </div>

          <div v-if="postResultSummary" class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="flex items-start gap-3">
              <CheckCircle2 v-if="postResultSummary.tone === 'ok'" class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <Clock3 v-else-if="postResultSummary.tone === 'run'" class="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
              <AlertTriangle v-else class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p class="font-extrabold">{{ postResultSummary.title }}</p>
                <p class="mt-1 text-sm leading-6 text-zinc-500">{{ postResultSummary.detail }}</p>
              </div>
            </div>
          </div>

          <div v-if="composerScreenshotSrc" class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            <div class="border-b border-zinc-800 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-zinc-400">Ảnh xác minh sau đăng</div>
            <div class="grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400">
              <img :src="composerScreenshotSrc" alt="Composer screenshot" class="h-full w-full object-contain" />
            </div>
          </div>

          <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="mb-3 flex items-center gap-2">
              <Terminal class="h-4 w-4 text-zinc-500" />
              <h3 class="font-extrabold">Phiên đăng gần nhất</h3>
            </div>
            <div class="max-h-72 space-y-2 overflow-auto pr-1">
              <article v-for="log in recentPostRuns" :key="log._id" class="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate font-bold">{{ log.action }}</p>
                  <span :class="['rounded-full px-2 py-0.5 text-[11px] font-bold uppercase', log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
                    {{ log.level }}
                  </span>
                </div>
                <p class="mt-1 line-clamp-2 text-zinc-500">{{ log.message }}</p>
                <p class="mt-2 text-xs text-zinc-500">{{ formatDate(log.createdAt) }}</p>
              </article>
              <p v-if="!recentPostRuns.length" class="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                Chưa có phiên đăng Facebook.
              </p>
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
