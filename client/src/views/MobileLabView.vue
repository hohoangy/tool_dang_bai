<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { AlertTriangle, BarChart3, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, FileText, Gauge, Home, Image, Keyboard, ListChecks, Loader2, LogOut, Moon, MousePointer2, Play, RefreshCcw, Save, Send, ShieldCheck, Smartphone, Sparkles, Sun, Terminal, Timer, Trash2, Undo2, Users, Video, Wifi, XCircle, Zap } from 'lucide-vue-next';
import { http } from '../api/http';
import BaseCard from '../components/BaseCard.vue';
import FacebookActivityIcon from '../components/FacebookActivityIcon.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const auth = useAuthStore();
const router = useRouter();

const accounts = ref([]);
const logs = ref([]);
const loading = ref(false);
const running = ref(false);
const screenshotLoading = ref(false);
const posting = ref(false);
const mediaUploading = ref(false);
const facebookOpening = ref(false);
const selectedAccountId = ref('');
const selectedPlatformId = ref('facebook');
const screenshot = ref(null);
const postResult = ref(null);
const remoteTextInput = ref('');
const mediaInput = ref(null);
const composerTextarea = ref(null);
const showEmojiPicker = ref(false);
const showDeviceTools = ref(false);
const facebookSessionAccountId = ref('');
const activeLdPlayerAccountId = ref('');
const runtimeStatusChecking = ref(false);
const selectedRuntimeStatus = ref(null);
const runtimeStatusMissCount = ref(0);
const technicalLogsOpen = ref(false);
const workflowStage = ref('idle');
const publishMode = ref('direct');
const facebookPostType = ref('imageText');
const composerTab = ref('compose');
const selectedQueueAccountIds = ref([]);
const queueItems = ref([]);
const queueRunning = ref(false);
const queueDelaySeconds = ref(0);
const queuePhase = ref('idle');
const queueCurrentAccountId = ref('');
const scheduleDateTime = ref(defaultScheduleDateTime());
const drafts = ref([]);
const draggedPreviewPhotoId = ref('');
const photoLayout = ref('grid');

const maxPhotos = 4;
const maxInstagramAlbumPhotos = 10;
const maxVideoSizeMb = 100;
const draftStorageKey = 'socialpilot-platform-composer-drafts';
const runtimeStatusIntervalMs = 8_000;
const runtimeStatusMissLimit = 3;
let runtimeStatusTimer = null;
let runtimeStatusRequestId = 0;
let collageCache = { key: '', item: null };

const platforms = [
  {
    id: 'facebook',
    label: 'Facebook',
    iconLabel: 'f',
    iconClass: 'bg-[#1877F2] text-white',
    packageName: 'com.facebook.katana',
    status: 'ready',
    description: 'Mo composer, nhap text, gan anh va dang truc tiep bang Facebook app trong LDPlayer.'
  },
  {
    id: 'instagram',
    label: 'Instagram',
    iconLabel: '◎',
    iconClass: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45] text-white',
    packageName: 'com.instagram.android',
    status: 'ready',
    description: 'Dang Feed, Reels hoac Tin qua Instagram app trong LDPlayer.'
  }
];

const defaultMobileAccounts = {
  facebook: {
    platform: 'facebook',
    displayName: 'Facebook Account 01',
    accountHandle: '',
    instanceName: 'LDPlayer',
    adbHost: '',
    deviceId: 'emulator-5554',
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
  },
  instagram: {
    platform: 'instagram',
    displayName: 'Instagram Account 01',
    accountHandle: '',
    instanceName: 'LDPlayer',
    adbHost: '',
    deviceId: 'emulator-5554',
    status: 'ready',
    notes: 'Default LDPlayer profile for direct Instagram posting tests.',
    metadata: {
      appPackage: 'com.instagram.android',
      username: '',
      password: '',
      loginSteps: {
        usernameTap: { x: 540, y: 760 },
        passwordTap: { x: 540, y: 900 },
        submitTap: { x: 540, y: 1060 }
      }
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
  { id: 'preview', label: 'Xem trước' },
  { id: 'queue', label: 'Bài đã lưu' }
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
  if (exact?.platform === selectedPlatformId.value) return exact;
  return accounts.value.find((account) => account.platform === selectedPlatformId.value) || null;
});
const selectedAccountLabel = computed(() => selectedAccount.value ? formatAccountLabel(selectedAccount.value) : `Chưa có profile ${selectedPlatform.value.label}`);
const accountInitial = computed(() => selectedAccount.value?.displayName?.slice(0, 1)?.toUpperCase() || 'F');
const screenshotSrc = computed(() => screenshot.value?.imageBase64 ? `data:image/png;base64,${screenshot.value.imageBase64}` : '');
const composerScreenshotSrc = computed(() => postResult.value?.screenshot?.imageBase64 ? `data:image/png;base64,${postResult.value.screenshot.imageBase64}` : '');
const latestLogs = computed(() => logs.value.slice(0, 80));
const technicalLogs = computed(() => latestLogs.value.slice(0, 20));
const technicalLogStats = computed(() => ({
  total: latestLogs.value.length,
  shown: technicalLogs.value.length,
  warnings: latestLogs.value.filter((log) => log.level === 'warn').length,
  errors: latestLogs.value.filter((log) => log.level === 'error').length
}));
const canUseRemote = computed(() => Boolean(selectedAccount.value));
const facebookAccounts = computed(() => accounts.value
  .filter((account) => account.platform === selectedPlatformId.value)
  .sort((left, right) => {
    const instanceDifference = getAccountOrder(left) - getAccountOrder(right);
    if (instanceDifference !== 0) return instanceDifference;
    return formatAccountDisplayName(left).localeCompare(formatAccountDisplayName(right), 'vi', {
      numeric: true,
      sensitivity: 'base'
    });
  }));
const selectedQueueAccounts = computed(() => facebookAccounts.value.filter((account) => selectedQueueAccountIds.value.includes(account._id)));
const selectedPhotoCount = computed(() => post.media.filter((item) => item.type === 'photo').length);
const isInstagramAlbumMode = computed(() => selectedPlatformId.value === 'instagram' && selectedPhotoCount.value > 1);
const platformMaxPhotos = computed(() => {
  if (selectedPlatformId.value === 'instagram') return maxInstagramAlbumPhotos;
  return maxPhotos;
});
const platformRequiresPhoto = computed(() => selectedPlatformId.value === 'instagram');
const isFacebookVideoMode = computed(() => selectedPlatformId.value === 'facebook' && facebookPostType.value === 'video');
const uploadedPhotoCount = computed(() => post.media.filter((item) => item.type === 'photo' && item.uploadedUrl).length);
const uploadedVideoCount = computed(() => post.media.filter((item) => item.type === 'video' && item.uploadedUrl).length);
const selectedVideo = computed(() => post.media.find((item) => item.type === 'video') || null);
const uploadedMediaCount = computed(() => isFacebookVideoMode.value ? uploadedVideoCount.value : uploadedPhotoCount.value);
const mediaReady = computed(() => {
  if (isFacebookVideoMode.value) return uploadedVideoCount.value === 1;
  const allSelectedPhotosUploaded = !post.media.length
    || uploadedPhotoCount.value === Math.min(post.media.length, platformMaxPhotos.value);
  return allSelectedPhotosUploaded && (!platformRequiresPhoto.value || uploadedPhotoCount.value > 0);
});
const mediaInputAccept = computed(() => isFacebookVideoMode.value ? 'video/mp4,video/quicktime,video/webm,video/3gpp' : 'image/*');
const mediaInputMultiple = computed(() => !isFacebookVideoMode.value);
const previewPhotos = computed(() => post.media.filter((item) => item.type === 'photo').slice(0, platformMaxPhotos.value));
const facebookPreviewPhotos = computed(() => previewPhotos.value);
const canArrangePhotos = computed(() => previewPhotos.value.length > 1);
const photoLayouts = [
  { id: 'grid', label: 'Lưới đều', description: 'Các ảnh có kích thước cân bằng' },
  { id: 'focus-first', label: 'Ưu tiên ảnh đầu', description: 'Ảnh đầu lớn ở bên trái' },
  { id: 'hero-top', label: 'Ảnh đầu phía trên', description: 'Ảnh đầu trải rộng phía trên' }
];
const availablePhotoLayouts = computed(() => {
  if (previewPhotos.value.length === 2) {
    return [
      { id: 'grid', label: 'Trái / phải', description: 'Hai ảnh chia đều theo chiều ngang' },
      { id: 'hero-top', label: 'Trên / dưới', description: 'Hai ảnh chia đều theo chiều dọc' }
    ];
  }
  return photoLayouts;
});
const previewGalleryClass = computed(() => {
  if (previewPhotos.value.length === 1) return 'grid grid-cols-1';
  if (photoLayout.value === 'focus-first') {
    if (previewPhotos.value.length === 2) return 'grid aspect-[16/9] grid-cols-3 gap-0.5';
    return `grid w-full aspect-[16/9] grid-cols-2 ${previewPhotos.value.length === 3 ? 'grid-rows-2' : 'grid-rows-3'} gap-0.5`;
  }
  if (photoLayout.value === 'hero-top') {
    if (previewPhotos.value.length === 2) return 'grid w-full aspect-[16/9] grid-rows-2 gap-0.5';
    return 'grid w-full aspect-[16/9] grid-cols-6 grid-rows-2 gap-0.5';
  }
  if (previewPhotos.value.length === 2) return 'grid w-full aspect-[16/9] grid-cols-2 gap-0.5';
  if (previewPhotos.value.length === 3) return 'grid w-full aspect-[16/9] grid-cols-3 gap-0.5';
  return 'grid w-full aspect-[16/9] grid-cols-2 grid-rows-2 gap-0.5';
});
const hashtagItems = computed(() => parseHashtags(post.hashtags));
const normalizedHashtags = computed(() => hashtagItems.value.join(' '));
const hashtagSummary = computed(() => {
  if (!hashtagItems.value.length) return 'Chưa dùng hashtag';
  if (hashtagItems.value.length <= 3) return 'Sẵn sàng';
  if (hashtagItems.value.length <= 6) return 'Nhiều hashtag';
  return 'Cần rút gọn';
});
const finalPostText = computed(() => [normalizeTextFormatArtifacts(post.text).trim(), normalizedHashtags.value].filter(Boolean).join('\n\n'));
const characterCount = computed(() => finalPostText.value.length);
const previewCaption = computed(() => normalizeTextFormatArtifacts(post.text).trim());
const facebookAppPackage = computed(() => selectedPlatform.value.packageName);
const currentPublishMode = computed(() => publishModes.find((mode) => mode.id === publishMode.value) || publishModes[0]);
const currentPublishModeShortLabel = computed(() => ({
  direct: 'Đăng ngay',
  review: 'Kiểm tra',
  bulk: 'Nhiều profile',
  schedule: 'Lên lịch'
}[publishMode.value] || currentPublishMode.value.title));
const isBulkMode = computed(() => publishMode.value === 'bulk');
const isReviewMode = computed(() => publishMode.value === 'review');
const isScheduleMode = computed(() => publishMode.value === 'schedule');
// Facebook cần được mở trước để ổn định Home/composer. Instagram tự mở
// ShareHandlerActivity khi chạy workflow nên không được chặn chỉ vì app
// hiện không nằm ở foreground.
const requiresFacebookSession = computed(() => selectedPlatformId.value === 'facebook'
  && !isBulkMode.value
  && !isScheduleMode.value);
const facebookAppReady = computed(() => Boolean(selectedAccount.value?._id) && facebookSessionAccountId.value === selectedAccount.value._id);
const selectedDeviceReady = computed(() => Boolean(selectedRuntimeStatus.value?.deviceReady));
const runtimeStatusDetail = computed(() => {
  if (facebookAppReady.value) return `${selectedPlatform.value.label} đã sẵn sàng trong ${formatInstanceLabel(selectedAccount.value)}`;
  if (runtimeStatusMissCount.value > 0 && facebookSessionAccountId.value === selectedAccount.value?._id) {
    return `Đang đồng bộ lại kết nối với ${formatInstanceLabel(selectedAccount.value)}`;
  }
  if (!selectedDeviceReady.value) return `${formatInstanceLabel(selectedAccount.value)} chưa chạy hoặc ADB chưa kết nối`;
  const foregroundPackage = selectedRuntimeStatus.value?.foregroundPackage;
  if (foregroundPackage && foregroundPackage !== facebookAppPackage.value) {
    return `${formatInstanceLabel(selectedAccount.value)} đang mở ứng dụng khác`;
  }
  return `${selectedPlatform.value.label} chưa ở màn hình hoạt động`;
});
const facebookOpenButtonLabel = computed(() => {
  if (facebookOpening.value) return `Đang mở ${selectedPlatform.value.label}`;
  return facebookAppReady.value ? `Đã mở ${selectedPlatform.value.label}` : `Mở ${selectedPlatform.value.label}`;
});
const facebookActivityLabel = computed(() => {
  if (facebookOpening.value) return `Đang mở ${selectedPlatform.value.label}`;
  if (queueRunning.value) return 'Đang đăng bài lên nhiều tài khoản';
  if (posting.value && isReviewMode.value) return `Đang mở ${selectedPlatform.value.label} để kiểm tra`;
  if (posting.value) return `Đang đăng bài lên ${selectedPlatform.value.label}`;
  return '';
});
const showFacebookActivityOverlay = computed(() => selectedPlatformId.value === 'facebook'
  && (facebookOpening.value || posting.value || queueRunning.value));
const facebookSessionStatusLabel = computed(() => facebookAppReady.value ? `Đã mở ${selectedPlatform.value.label}` : `Chưa mở ${selectedPlatform.value.label}`);
const minScheduleDateTime = computed(() => toDateTimeLocal(new Date(Date.now() + 60 * 1000)));
const minScheduleDate = computed(() => minScheduleDateTime.value.slice(0, 10));
const scheduleDate = computed({
  get: () => scheduleDateTime.value?.slice(0, 10) || minScheduleDate.value,
  set: (value) => {
    scheduleDateTime.value = value ? `${value}T${scheduleTime.value || '09:00'}` : '';
  }
});
const scheduleTime = computed({
  get: () => scheduleDateTime.value?.slice(11, 16) || '09:00',
  set: (value) => {
    scheduleDateTime.value = value ? `${scheduleDate.value || minScheduleDate.value}T${value}` : '';
  }
});
const scheduleTimestamp = computed(() => scheduleDateTime.value ? new Date(scheduleDateTime.value).getTime() : 0);
const scheduleReady = computed(() => !isScheduleMode.value || (Number.isFinite(scheduleTimestamp.value) && scheduleTimestamp.value > Date.now()));
const scheduleStatus = computed(() => {
  if (!isScheduleMode.value) return 'Không dùng lịch';
  if (!scheduleDateTime.value) return 'Chưa chọn thời gian đăng';
  if (!scheduleReady.value) return 'Thời gian đăng phải ở tương lai';
  return `Sẽ đăng lúc ${formatDate(scheduleDateTime.value)}`;
});
const scheduleQuickOptions = [
  { label: '+30 phút', minutes: 30 },
  { label: '+1 giờ', minutes: 60 },
  { label: 'Tối nay', preset: 'tonight' },
  { label: 'Sáng mai', preset: 'tomorrow-morning' }
];
const queueReady = computed(() => !isBulkMode.value || selectedQueueAccounts.value.length > 0);
const captionRequired = computed(() => selectedPlatformId.value !== 'instagram');
const contentReady = computed(() => characterCount.value <= 5000 && (!captionRequired.value || characterCount.value > 0));
const submitWaitMs = computed(() => {
  if (isReviewMode.value) return 0;
  if (isFacebookVideoMode.value) return 90_000;
  if (selectedPlatformId.value === 'instagram') {
    return Math.min(60_000, 21_000 + (uploadedPhotoCount.value * 4_000));
  }
  return uploadedPhotoCount.value > 0 ? 12_000 : 8_000;
});
const canRunWorkflow = computed(() => selectedPlatform.value.status === 'ready'
  && canUseRemote.value
  && (!requiresFacebookSession.value || facebookAppReady.value)
  && queueReady.value
  && scheduleReady.value
  && mediaReady.value
  && contentReady.value
  && !posting.value
  && !queueRunning.value
  && !mediaUploading.value);
const duplicateDraft = computed(() => drafts.value.find((draft) => draft.text === finalPostText.value.trim()));
const scheduledDrafts = computed(() => drafts.value
  .filter((draft) => draft.status === 'scheduled')
  .sort((a, b) => new Date(a.scheduledFor || a.createdAt) - new Date(b.scheduledFor || b.createdAt)));
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
    label: 'Xem trước hashtag',
    detail: 'Hashtag hiển thị dạng chip để kiểm tra nhanh',
    ok: true
  }
]);
const workflowLabel = computed(() => {
  const labels = {
    idle: 'Chưa chạy',
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
    label: `Profile ${selectedPlatform.value.label}`,
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
    label: `${selectedPlatform.value.label} app`,
    detail: !requiresFacebookSession.value
      ? `${selectedPlatform.value.label} sẽ tự mở khi bắt đầu đăng`
      : runtimeStatusDetail.value,
    ok: Boolean(facebookAppPackage.value) && (!requiresFacebookSession.value || facebookAppReady.value),
    blocking: true
  },
  {
    label: 'Nội dung',
    detail: characterCount.value
      ? `${characterCount.value}/5000 ký tự`
      : (captionRequired.value ? 'Cần nhập caption' : 'Không có caption, vẫn có thể đăng'),
    ok: contentReady.value,
    blocking: captionRequired.value
  },
  {
    label: 'Media',
    detail: isFacebookVideoMode.value
      ? (uploadedVideoCount.value ? 'Video đã sẵn sàng' : 'Facebook video cần 1 tệp video')
      : selectedPlatformId.value === 'instagram' && uploadedPhotoCount.value
        ? `${uploadedPhotoCount.value} ảnh · ${isInstagramAlbumMode.value ? 'Tự động đăng Album' : 'Tự động đăng ảnh đơn'}`
      : uploadedPhotoCount.value
        ? `${uploadedPhotoCount.value}/${platformMaxPhotos.value} ảnh đã sẵn sàng`
        : (platformRequiresPhoto.value ? 'Instagram bắt buộc có ảnh' : 'Không dùng ảnh'),
    ok: mediaReady.value,
    blocking: platformRequiresPhoto.value || isFacebookVideoMode.value
  },
  {
    label: 'Lịch đăng',
    detail: scheduleStatus.value,
    ok: scheduleReady.value,
    blocking: isScheduleMode.value,
    hidden: !isScheduleMode.value
  }
].filter((item) => !item.hidden));
const blockedPreflightItems = computed(() => preflightItems.value.filter((item) => item.blocking && !item.ok));
const readyPreflightCount = computed(() => preflightItems.value.filter((item) => item.ok).length);
const readinessScore = computed(() => Math.round((readyPreflightCount.value / Math.max(preflightItems.value.length, 1)) * 100));
const readinessSummary = computed(() => {
  if (!blockedPreflightItems.value.length && contentReady.value) {
    return characterCount.value ? 'Đủ điều kiện chạy automation' : 'Đủ điều kiện, caption đang trống';
  }
  if (!contentReady.value && captionRequired.value) return 'Cần nhập nội dung trước khi đăng';
  if (requiresFacebookSession.value && !facebookAppReady.value) return runtimeStatusDetail.value;
  return `Cần xử lý: ${blockedPreflightItems.value.map((item) => item.label).join(', ')}`;
});
const readinessTone = computed(() => {
  if (['preflight', 'posting'].includes(workflowStage.value)) return 'run';
  return blockedPreflightItems.value.length || !contentReady.value ? 'warn' : 'ok';
});
const readinessLabel = computed(() => {
  if (readinessTone.value === 'run') return workflowLabel.value;
  if (blockedPreflightItems.value.length || !contentReady.value) return 'Cần chuẩn bị';
  return 'Sẵn sàng đăng';
});
const contentQualityScore = computed(() => {
  let score = 0;
  const textLength = previewCaption.value.length;
  if (textLength >= 20) score += 35;
  else if (textLength > 0) score += 18;
  if (hashtagItems.value.length >= 1 && hashtagItems.value.length <= 6) score += 25;
  if (uploadedMediaCount.value) score += 25;
  if (!duplicateDraft.value && textLength > 0) score += 15;
  return Math.min(score, 100);
});
const operationalPostRunActions = new Set([
  'facebook_post_finished',
  'facebook_post_submit_verified',
  'facebook_post_submit_unverified',
  'facebook_post_submit_waiting',
  'facebook_post_media_uploading',
  'facebook_post_submit_still_in_composer',
  'facebook_post_submit_blocked',
  'facebook_post_state_machine_pending',
  'facebook_post_image_attach_failed',
  'facebook_post_image_attached',
  'facebook_post_wait_for_ui',
  'facebook_post_state',
  'facebook_post_failed',
  'instagram_post_finished',
  'instagram_post_submit_verified',
  'instagram_post_submit_unverified',
  'instagram_post_submit_waiting',
  'instagram_post_caption_missing_before_submit',
  'instagram_post_state_machine_pending',
  'instagram_post_state',
  'instagram_post_failed'
]);
const recentPostRuns = computed(() => latestLogs.value
  .filter((log) => operationalPostRunActions.has(String(log.action || '')))
  .slice(0, 3));
const postRunActionLabels = {
  facebook_post_finished: {
    title: 'Đã hoàn tất thao tác đăng',
    detail: 'Tool đã đi hết workflow đăng bài.'
  },
  facebook_post_submit_verified: {
    title: 'Đã xác minh Facebook nhận bài',
    detail: 'Facebook trả tín hiệu xác nhận sau khi bấm Đăng.'
  },
  facebook_post_submit_unverified: {
    title: 'Chưa xác minh được bài đăng',
    detail: 'Đã bấm Đăng nhưng chưa thấy tín hiệu xác nhận từ Facebook.'
  },
  facebook_post_submit_waiting: {
    title: 'Đang chờ Facebook phản hồi',
    detail: 'Facebook đang xử lý sau thao tác đăng.'
  },
  facebook_post_media_uploading: {
    title: 'Đang tải ảnh lên Facebook',
    detail: 'Giữ Facebook hoạt động cho đến khi quá trình tải hoàn tất.'
  },
  facebook_post_submit_still_in_composer: {
    title: 'Vẫn còn ở màn soạn bài',
    detail: 'Facebook chưa rời composer sau khi bấm Đăng.'
  },
  facebook_post_submit_blocked: {
    title: 'Facebook bị chặn bởi checkpoint',
    detail: 'Facebook yêu cầu đăng nhập hoặc xác minh thêm.'
  },
  facebook_post_state_machine_pending: {
    title: 'Chưa tới được màn đăng bài',
    detail: 'Automation chưa đưa Facebook về đúng trạng thái.'
  },
  facebook_post_image_attach_failed: {
    title: 'Gắn ảnh chưa thành công',
    detail: 'Tool chưa xác nhận được ảnh trong composer.'
  },
  facebook_post_image_attached: {
    title: 'Ảnh đã sẵn sàng',
    detail: 'Ảnh đã xuất hiện trong Facebook composer.'
  },
  facebook_post_wait_for_ui: {
    title: 'Đang chờ Facebook chuyển màn',
    detail: 'Tool đang đợi giao diện Facebook ổn định.'
  },
  facebook_post_state: {
    title: 'Đang đọc trạng thái Facebook',
    detail: 'Tool đang nhận diện màn hình hiện tại.'
  },
  facebook_post_failed: {
    title: 'Đăng thất bại',
    detail: 'Workflow dừng vì Facebook hoặc LDPlayer trả lỗi trong quá trình đăng.'
  },
  instagram_post_finished: {
    title: 'Đã hoàn tất thao tác Instagram',
    detail: 'Tool đã đi hết workflow đăng Instagram.'
  },
  instagram_post_submit_verified: {
    title: 'Đã xác minh Instagram nhận bài',
    detail: 'Instagram đã rời màn share sau khi bấm Share.'
  },
  instagram_post_submit_unverified: {
    title: 'Chưa xác minh được bài Instagram',
    detail: 'Đã bấm Share nhưng Instagram chưa rời màn đăng hoặc chưa trả tín hiệu đã chia sẻ.'
  },
  instagram_post_submit_waiting: {
    title: 'Instagram đang xử lý',
    detail: 'Instagram đang tải/chia sẻ bài sau khi bấm Share.'
  },
  instagram_post_caption_missing_before_submit: {
    title: 'Chưa nhập được caption',
    detail: 'Instagram đã rời màn soạn trước khi xác minh emoji/hashtag, tool đã dừng để tránh đăng thiếu nội dung.'
  },
  instagram_post_state_machine_pending: {
    title: 'Chưa tới được màn đăng Feed',
    detail: 'Automation chưa đưa Instagram về đúng trạng thái đăng trang cá nhân/feed.'
  },
  instagram_post_state: {
    title: 'Đang đọc trạng thái Instagram',
    detail: 'Tool đang nhận diện màn hình hiện tại.'
  },
  instagram_post_failed: {
    title: 'Đăng Instagram thất bại',
    detail: 'Workflow dừng vì Instagram hoặc LDPlayer trả lỗi trong quá trình đăng.'
  }
};
const postResultSummary = computed(() => {
  if (!postResult.value) return null;
  const elapsedMs = Number(postResult.value.perf?.totalMs) || 0;
  const elapsedDetail = elapsedMs > 0
    ? ` Hoàn tất trong ${(elapsedMs / 1000).toFixed(1)} giây.`
    : '';
  if (postResult.value.submitVerified) {
    return {
      title: 'Đã xác minh bài đăng',
      detail: `${selectedPlatform.value.label} đã có tín hiệu nhận bài.${elapsedDetail} Lưu lại screenshot/log để đối chiếu khi cần.`,
      tone: 'ok'
    };
  }
  if (postResult.value.autoSubmit) {
    return {
      title: 'Đã bấm Đăng nhưng cần kiểm tra',
      detail: `Automation chưa xác nhận được bài đã lên feed.${elapsedDetail} Hãy xem screenshot và log mới nhất.`,
      tone: 'warn'
    };
  }
  return {
    title: 'Composer đã mở',
    detail: `Bài đang chờ thao tác trong ${selectedPlatform.value.label} app.${elapsedDetail}`,
    tone: 'run'
  };
});
const publishModes = [
  {
    id: 'direct',
    title: 'Đăng ngay',
    icon: 'zap',
    description: 'Kiểm tra thiết bị, mở app và bấm đăng tự động cho profile đang chọn.'
  },
  {
    id: 'review',
    title: 'Mở composer để kiểm tra',
    icon: 'shield',
    description: 'Chỉ nhập nội dung/media vào composer, không tự bấm đăng.'
  },
  {
    id: 'bulk',
    title: 'Đăng hàng loạt',
    icon: 'users',
    description: 'Đăng tuần tự qua nhiều LDPlayer profile, có delay giữa mỗi lượt.'
  },
  {
    id: 'schedule',
    title: 'Lên lịch',
    icon: 'timer',
    description: 'Lưu thời gian đăng, nội dung và profile để theo dõi theo lịch.'
  }
];
const primaryPublishModes = computed(() => publishModes.filter((mode) => mode.id !== 'bulk'));
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
  if (queueRunning.value) return 'Đang đăng hàng loạt';
  if (posting.value) return isReviewMode.value ? 'Đang mở Facebook' : 'Đang đăng Facebook';
  if (isReviewMode.value) return 'Mở kiểm tra';
  if (isBulkMode.value) return `Bắt đầu đăng (${selectedQueueAccounts.value.length})`;
  if (isScheduleMode.value) return 'Lưu lịch';
  return 'Đăng';
});
const queueProgressPercent = computed(() => {
  if (!queueStats.value.total) return 0;
  return Math.round(((queueStats.value.done + queueStats.value.review + queueStats.value.failed) / queueStats.value.total) * 100);
});
const professionalKpis = computed(() => [
  {
    label: 'Điều kiện đăng',
    value: blockedPreflightItems.value.length ? 'Cần kiểm tra' : 'Đủ điều kiện',
    detail: blockedPreflightItems.value.length
      ? (requiresFacebookSession.value && !facebookAppReady.value
        ? runtimeStatusDetail.value
        : `Thiếu: ${blockedPreflightItems.value.map((item) => item.label).join(', ')}`)
      : `Profile, ADB và ${selectedPlatform.value.label} đã sẵn sàng`,
    tone: blockedPreflightItems.value.length ? 'warn' : 'ok'
  },
  {
    label: 'Nội dung',
    value: `${characterCount.value}/5000`,
    detail: `${hashtagItems.value.length} hashtag cuối bài`,
    tone: contentQualityScore.value >= 70 ? 'ok' : contentQualityScore.value > 0 ? 'run' : 'idle'
  },
  {
    label: 'Media',
    value: isFacebookVideoMode.value
      ? (uploadedVideoCount.value ? 'Video' : 'Chưa chọn')
      : post.media.length ? `${uploadedPhotoCount.value}/${post.media.length}` : 'Text',
    detail: isFacebookVideoMode.value
      ? 'Đăng video Facebook'
      : selectedPlatformId.value === 'instagram'
        ? `Instagram Feed - ${isInstagramAlbumMode.value ? 'Album' : 'Ảnh đơn'}`
      : post.media.length ? 'Ảnh đã sẵn sàng để gắn vào bài' : 'Bài đăng dạng text',
    tone: mediaReady.value ? 'ok' : 'warn'
  },
  {
    label: 'Chế độ',
    value: currentPublishModeShortLabel.value,
    detail: isBulkMode.value
      ? `${selectedQueueAccounts.value.length}/${facebookAccounts.value.length} profile · nghỉ ${queueDelaySeconds.value} giây`
      : isScheduleMode.value
        ? scheduleStatus.value
        : selectedAccount.value?.displayName || 'Chưa chọn profile',
    tone: isBulkMode.value && !selectedQueueAccounts.value.length ? 'warn' : 'ok'
  }
]);
const professionalActions = computed(() => {
  const actions = [];
  if (!previewCaption.value && captionRequired.value) {
    actions.push({
      title: 'Hoàn thiện nội dung',
      detail: 'Nhập caption chính để kích hoạt workflow đăng.',
      tone: 'required'
    });
  }
  if (!previewCaption.value && !captionRequired.value) {
    actions.push({
      title: 'Caption đang trống',
      detail: 'Instagram vẫn đăng được ảnh không caption, nhưng thêm caption sẽ tự nhiên hơn.',
      tone: 'optional'
    });
  }
  if (previewCaption.value.length > 0 && previewCaption.value.length < 20) {
    actions.push({
      title: 'Mở rộng caption',
      detail: 'Thêm ngữ cảnh hoặc CTA để bài đăng tự nhiên hơn.',
      tone: 'optional'
    });
  }
  if (!hashtagItems.value.length) {
    actions.push({
      title: 'Hashtag tracking',
      detail: 'Thêm 1-3 hashtag nếu cần gom chiến dịch hoặc đo hiệu quả.',
      tone: 'optional'
    });
  }
  if (hashtagItems.value.length > 6) {
    actions.push({
      title: 'Tinh gọn hashtag',
      detail: 'Giảm số hashtag để bài đăng gọn và ít giống spam hơn.',
      tone: 'optional'
    });
  }
  if (duplicateDraft.value) {
    actions.push({
      title: 'Tránh trùng nội dung',
      detail: 'Nội dung giống một nháp đã lưu, nên chỉnh nhẹ trước khi đăng.',
      tone: 'required'
    });
  }
  if (post.media.length && !mediaReady.value) {
    actions.push({
      title: 'Chờ media sẵn sàng',
      detail: 'Media cần upload xong trước khi chạy automation.',
      tone: 'required'
    });
  }
  if (isFacebookVideoMode.value && !uploadedVideoCount.value) {
    actions.push({
      title: 'Thêm video Facebook',
      detail: 'Chọn 1 video trước khi chạy luồng đăng video.',
      tone: 'required'
    });
  }
  if (platformRequiresPhoto.value && !uploadedPhotoCount.value) {
    actions.push({
      title: 'Thêm ảnh Instagram',
      detail: 'Instagram cần 1 ảnh đã upload trước khi mở composer.',
      tone: 'required'
    });
  }
  if (requiresFacebookSession.value && !facebookAppReady.value) {
    actions.push({
      title: `Mở ${selectedPlatform.value.label}`,
      detail: `Mở app ${selectedPlatform.value.label} trong đúng LDPlayer profile trước khi đăng.`,
      tone: 'required'
    });
  }
  if (isBulkMode.value && !selectedQueueAccounts.value.length) {
    actions.push({
      title: 'Chọn profile đăng',
      detail: 'Chọn ít nhất một profile để bắt đầu đăng hàng loạt.',
      tone: 'required'
    });
  }
  if (isScheduleMode.value && !scheduleReady.value) {
    actions.push({
      title: 'Chọn thời gian đăng',
      detail: 'Thời gian lên lịch phải nằm ở tương lai.',
      tone: 'required'
    });
  }
  return actions.slice(0, 4);
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
    selectedQueueAccountIds.value = nextAccounts.filter((account) => account.platform === selectedPlatformId.value).slice(0, 1).map((account) => account._id);
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

function formatInstanceLabel(account) {
  const target = account?.deviceId || '';
  const emulatorIndex = Number(target.match(/^emulator-(\d+)$/)?.[1]);
  if (Number.isInteger(emulatorIndex) && emulatorIndex >= 5554) {
    return `LDPlayer ${String(((emulatorIndex - 5554) / 2) + 1).padStart(2, '0')}`;
  }
  const instanceNumber = Number(account?.instanceName?.match(/-(\d+)$/)?.[1]);
  if (Number.isInteger(instanceNumber)) return `LDPlayer ${String(instanceNumber).padStart(2, '0')}`;
  return account?.instanceName === 'LDPlayer' ? 'LDPlayer 01' : (account?.instanceName || 'LDPlayer');
}

function getAccountOrder(account) {
  const target = account?.deviceId || '';
  const emulatorIndex = Number(target.match(/^emulator-(\d+)$/)?.[1]);
  if (Number.isInteger(emulatorIndex) && emulatorIndex >= 5554) {
    return ((emulatorIndex - 5554) / 2) + 1;
  }
  if (account?.instanceName === 'LDPlayer') return 1;
  const instanceNumber = Number(account?.instanceName?.match(/-(\d+)$/)?.[1]);
  return Number.isInteger(instanceNumber) ? instanceNumber : Number.MAX_SAFE_INTEGER;
}

function formatAccountDisplayName(account) {
  const displayName = String(account?.displayName || '').trim();
  if (account?.platform !== 'facebook') return displayName || 'Profile chưa đặt tên';

  const accountNumber = displayName.match(/facebook\s*(?:account)?\s*0*(\d+)/i)?.[1]
    || String(getAccountOrder(account));
  if (/^facebook\s*(?:account)?\s*0*\d+$/i.test(displayName) && /^\d+$/.test(accountNumber)) {
    return `Facebook Account ${String(Number(accountNumber)).padStart(2, '0')}`;
  }
  return displayName || `Facebook Account ${String(getAccountOrder(account)).padStart(2, '0')}`;
}

function formatAccountLabel(account) {
  return `${formatAccountDisplayName(account)} · ${formatInstanceLabel(account)}`;
}

function isAuthError(error) {
  return /authentication required|invalid session/i.test(error?.message || '');
}

async function ensureDefaultProfile() {
  if (accounts.value.some((account) => account.platform === selectedPlatformId.value)) return;
  const { data } = await http.post('/mobile/accounts', defaultMobileAccounts[selectedPlatformId.value] || defaultMobileAccounts.facebook);
  accounts.value = [data.account, ...accounts.value];
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
  if (!selectedAccount.value || facebookOpening.value || facebookAppReady.value) return;
  const nextAccount = selectedAccount.value;
  const previousAccount = await findActiveAccountBeforeSwitch(nextAccount);
  const shouldClosePrevious = previousAccount && previousAccount._id !== nextAccount._id;
  running.value = true;
  facebookOpening.value = true;
  try {
    if (shouldClosePrevious) {
      await http.post(`/mobile/accounts/${previousAccount._id}/remote/close-session`, {
        appPackage: previousAccount.metadata?.appPackage || selectedPlatform.value.packageName
      });
      activeLdPlayerAccountId.value = '';
      facebookSessionAccountId.value = '';
    }
    const { data } = await http.post(`/mobile/accounts/${nextAccount._id}/remote/open-app`, {
      appPackage: nextAccount.metadata?.appPackage || selectedPlatform.value.packageName
    });
    const backendConfirmed = Boolean(data.result?.ok && data.result?.readiness?.ok);
    if (backendConfirmed && selectedAccount.value?._id === nextAccount._id) {
      activeLdPlayerAccountId.value = nextAccount._id;
      facebookSessionAccountId.value = nextAccount._id;
      runtimeStatusMissCount.value = 0;
      selectedRuntimeStatus.value = {
        target: data.result?.target || nextAccount.deviceId,
        deviceReady: true,
        appReady: true,
        foregroundPackage: nextAccount.metadata?.appPackage || selectedPlatform.value.packageName,
        foregroundActivity: data.result?.readiness?.foregroundActivity || ''
      };
    }
    const runtimeReady = await waitForSelectedAccountRuntimeReady(nextAccount._id);
    if (runtimeReady) {
      ui.notify(shouldClosePrevious ? `Đã chuyển sang ${nextAccount.displayName}.` : `Đã mở ${selectedPlatform.value.label}.`);
    } else {
      facebookSessionAccountId.value = '';
      ui.notify(data.result?.readiness?.error || `${selectedPlatform.value.label} chưa ổn định, thử mở lại.`, 'error');
    }
    if (showDeviceTools.value) await refreshScreenshot();
  } catch (error) {
    facebookSessionAccountId.value = '';
    ui.notify(error.message, 'error');
  } finally {
    facebookOpening.value = false;
    running.value = false;
  }
}

async function findActiveAccountBeforeSwitch(nextAccount) {
  const remembered = accounts.value.find((account) => account._id === activeLdPlayerAccountId.value);
  if (remembered && remembered._id !== nextAccount._id) return remembered;

  const candidates = accounts.value.filter((account) => (
    account.platform === nextAccount.platform
    && account._id !== nextAccount._id
  ));
  if (!candidates.length) return null;

  const checks = await Promise.allSettled(candidates.map(async (account) => {
    const { data } = await http.get(`/mobile/accounts/${account._id}/runtime-status`, {
      params: {
        appPackage: account.metadata?.appPackage || selectedPlatform.value.packageName
      }
    });
    return data.status?.deviceReady && data.status?.appReady ? account : null;
  }));
  return checks.find((result) => result.status === 'fulfilled' && result.value)?.value || null;
}

async function waitForSelectedAccountRuntimeReady(accountId, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (selectedAccount.value?._id !== accountId) return false;
    const ready = await syncSelectedAccountRuntimeStatus({ force: true });
    if (ready) return true;
    if (attempt < attempts) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  }
  return false;
}

async function syncSelectedAccountRuntimeStatus(options = {}) {
  const account = selectedAccount.value;
  if (!account || (runtimeStatusChecking.value && !options.force) || posting.value || queueRunning.value) return false;

  const requestId = ++runtimeStatusRequestId;
  runtimeStatusChecking.value = true;
  try {
    const { data } = await http.get(`/mobile/accounts/${account._id}/runtime-status`, {
      params: {
        appPackage: account.metadata?.appPackage || selectedPlatform.value.packageName
      }
    });
    if (selectedAccount.value?._id !== account._id || requestId !== runtimeStatusRequestId) return false;
    const ready = Boolean(data.status?.deviceReady && data.status?.appReady);
    selectedRuntimeStatus.value = data.status || null;
    if (ready) {
      runtimeStatusMissCount.value = 0;
      activeLdPlayerAccountId.value = account._id;
      facebookSessionAccountId.value = account._id;
      return true;
    }

    const sessionWasConfirmed = facebookSessionAccountId.value === account._id;
    runtimeStatusMissCount.value += 1;
    if (!sessionWasConfirmed || runtimeStatusMissCount.value >= runtimeStatusMissLimit) {
      facebookSessionAccountId.value = '';
    }
    return sessionWasConfirmed && runtimeStatusMissCount.value < runtimeStatusMissLimit;
  } catch {
    // Lỗi mạng tạm thời không nên làm thay đổi trạng thái đang hiển thị.
    if (facebookSessionAccountId.value === account._id) {
      runtimeStatusMissCount.value += 1;
      if (runtimeStatusMissCount.value >= runtimeStatusMissLimit) {
        facebookSessionAccountId.value = '';
      }
      return runtimeStatusMissCount.value < runtimeStatusMissLimit;
    }
    return false;
  } finally {
    if (requestId === runtimeStatusRequestId) {
      runtimeStatusChecking.value = false;
    }
  }
}

function startRuntimeStatusPolling() {
  stopRuntimeStatusPolling();
  runtimeStatusTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      syncSelectedAccountRuntimeStatus();
    }
  }, runtimeStatusIntervalMs);
}

function stopRuntimeStatusPolling() {
  if (!runtimeStatusTimer) return;
  window.clearInterval(runtimeStatusTimer);
  runtimeStatusTimer = null;
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
  try {
    await http.post(`/mobile/accounts/${selectedAccount.value._id}/remote/text`, { text: remoteTextInput.value });
    remoteTextInput.value = '';
    ui.notify('Đã gửi text vào LDPlayer.');
    window.setTimeout(refreshScreenshot, 400);
  } catch (error) {
    ui.notify(error.message, 'error');
  }
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
  await syncSelectedAccountRuntimeStatus();
  if (requiresFacebookSession.value && !facebookAppReady.value) {
    ui.notify(`ADB hoặc ${selectedPlatform.value.label} chưa sẵn sàng. Bấm Mở ${selectedPlatform.value.label} rồi thử lại.`, 'error');
    workflowStage.value = 'failed';
    return;
  }
  if (selectedPlatform.value.status !== 'ready') {
    ui.notify(`Workflow ${selectedPlatform.value.label} se duoc them sau.`, 'error');
    workflowStage.value = 'failed';
    return;
  }
  if (captionRequired.value && !finalPostText.value.trim()) {
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
    saveScheduledPost();
    workflowStage.value = 'idle';
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
    workflowStage.value = 'posting';
    const { data } = await submitFacebookForAccount(
      selectedAccount.value,
      !isReviewMode.value,
      submitWaitMs.value
    );
    postResult.value = data.result;
    screenshot.value = data.result.screenshot || screenshot.value;
    if (isReviewMode.value) {
      workflowStage.value = 'review';
      ui.notify('Đã mở composer để bạn kiểm tra trước khi đăng.');
    } else if (data.result.submitVerified === false) {
      workflowStage.value = 'review';
      ui.notify(`Đã bấm đăng nhưng chưa xác nhận ${selectedPlatform.value.label} đã nhận bài. Hãy xem screenshot/log.`, 'error');
    } else {
      workflowStage.value = 'verified';
      ui.notify(isFacebookVideoMode.value
        ? `Đã đăng video ${selectedPlatform.value.label}.`
        : uploadedPhotoCount.value
        ? `Đã tải xong ${uploadedPhotoCount.value} ảnh và đăng bài ${selectedPlatform.value.label}.`
        : `Đã đăng và xác minh bài ${selectedPlatform.value.label}.`);
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
    ui.notify('Chưa chọn tài khoản để đăng hàng loạt.', 'error');
    workflowStage.value = 'failed';
    return;
  }

  const warmAccountId = activeLdPlayerAccountId.value || facebookSessionAccountId.value;
  const queueAccounts = [...selectedQueueAccounts.value].sort((left, right) => {
    if (left._id === warmAccountId) return -1;
    if (right._id === warmAccountId) return 1;
    return 0;
  });
  const interAccountDelaySeconds = Math.max(0, Math.min(Number(queueDelaySeconds.value) || 0, 600));
  posting.value = true;
  queueRunning.value = true;
  queuePhase.value = 'preparing';
  queueCurrentAccountId.value = '';
  postResult.value = null;
  workflowStage.value = 'posting';
  queueItems.value = queueAccounts.map((account) => ({
    id: account._id,
    name: account.displayName,
    instanceName: account.instanceName,
    status: 'pending',
    message: 'Đang chuẩn bị',
    result: null
  }));

  try {
    await prepareQueueEnvironment();
    let stopQueue = false;
    for (let index = 0; index < queueAccounts.length; index += 1) {
      const account = queueAccounts[index];
      queueCurrentAccountId.value = account._id;
      queuePhase.value = index > 0 ? 'switching' : 'preparing';

      try {
        updateQueueItem(account._id, { status: 'running', message: 'Đang kiểm tra LDPlayer và ADB' });
        queuePhase.value = 'posting';
        const queueSubmitWaitMs = submitWaitMs.value;
        updateQueueItem(account._id, {
          status: 'running',
          message: isFacebookVideoMode.value
            ? 'Đang đăng và chờ xử lý video'
            : uploadedPhotoCount.value
            ? `Đang đăng và chờ tải ${uploadedPhotoCount.value} ảnh`
            : 'Đang đăng bài'
        });
        const { data } = await submitFacebookForAccount(account, true, queueSubmitWaitMs);
        postResult.value = data.result;
        screenshot.value = data.result.screenshot || screenshot.value;

        if (data.result.submitVerified === false) {
          updateQueueItem(account._id, {
            status: 'review',
            message: data.result.composerPending ? 'Chưa hoàn tất, giữ LDPlayer để kiểm tra' : 'Chưa xác minh, giữ LDPlayer để kiểm tra',
            result: data.result
          });
          stopQueue = true;
        } else {
          const successMessage = isFacebookVideoMode.value
            ? 'Đã đăng video và xác minh'
            : uploadedPhotoCount.value
            ? `Đã tải xong ${uploadedPhotoCount.value} ảnh và đăng bài`
            : 'Đã đăng và xác minh';
          updateQueueItem(account._id, {
            status: 'done',
            message: successMessage,
            result: data.result
          });
          queuePhase.value = 'closing';
          await closeQueueAccount(account, successMessage);
        }
      } catch (error) {
        updateQueueItem(account._id, { status: 'failed', message: error.message });
        queuePhase.value = 'closing';
        await closeQueueAccount(account, `Lỗi: ${error.message}`);
      }

      if (stopQueue) {
        for (let pendingIndex = index + 1; pendingIndex < queueAccounts.length; pendingIndex += 1) {
          const pendingAccount = queueAccounts[pendingIndex];
          updateQueueItem(pendingAccount._id, { status: 'pending', message: 'Tạm dừng do lượt trước chưa hoàn tất' });
        }
        break;
      }

      if (index < queueAccounts.length - 1 && interAccountDelaySeconds > 0) {
        queuePhase.value = 'waiting';
        updateQueueItem(queueAccounts[index + 1]._id, {
          status: 'waiting',
          message: `Nghỉ ${interAccountDelaySeconds} giây trước lượt tiếp theo`
        });
        await wait(interAccountDelaySeconds * 1000);
      }
      if (index < queueAccounts.length - 1) {
        queuePhase.value = 'switching';
        queueCurrentAccountId.value = queueAccounts[index + 1]._id;
      }
    }

    workflowStage.value = queueStats.value.failed ? 'failed' : (queueStats.value.review ? 'review' : 'verified');
    ui.notify(`Đăng hàng loạt hoàn tất: ${queueStats.value.done} thành công, ${queueStats.value.review} cần kiểm tra, ${queueStats.value.failed} lỗi.`);
    await load();
  } finally {
    posting.value = false;
    queueRunning.value = false;
    queuePhase.value = 'idle';
    queueCurrentAccountId.value = '';
  }
}

async function prepareQueueEnvironment() {
  queueItems.value = queueItems.value.map((item) => ({
    ...item,
    status: 'pending',
    message: 'Đang chờ đến lượt'
  }));

  // Giữ profile đang chạy để lượt đầu có thể dùng warm start. Mỗi profile
  // vẫn được đóng ngay sau khi hoàn tất để giải phóng RAM trước lượt kế tiếp.
  await wait(100);
}

async function submitFacebookForAccount(account, autoSubmit, waitAfterSubmitMs = 0) {
  const uniqueImages = Array.from(
    new Map(
      post.media
        .filter((item) => item.type === 'photo' && item.uploadedUrl)
        .map((item) => [item.uploadedUrl, item])
    ).values()
  ).slice(0, platformMaxPhotos.value);
  const uniqueVideos = post.media
    .filter((item) => item.type === 'video' && item.uploadedUrl)
    .slice(0, 1);
  const publishImages = isFacebookVideoMode.value
    ? []
    : await prepareFacebookPublishImages(uniqueImages);

  return http.post(`/mobile/accounts/${account._id}/${selectedPlatformId.value}/post`, {
    text: finalPostText.value.trim(),
    appPackage: selectedPlatform.value.packageName,
    autoSubmit,
    waitAfterSubmitMs,
    images: publishImages
      .map((item) => ({
        url: item.uploadedUrl,
        name: item.name,
        mimeType: item.mimeType,
        size: item.size
      })),
    videos: isFacebookVideoMode.value ? uniqueVideos
      .map((item) => ({
        url: item.uploadedUrl,
        name: item.name,
        mimeType: item.mimeType,
        size: item.size
      }))
      : []
  });
}

async function prepareFacebookPublishImages(images) {
  if (selectedPlatformId.value !== 'facebook' || images.length < 2) return images;

  const cacheKey = JSON.stringify({
    layout: photoLayout.value,
    images: images.map((item) => item.uploadedUrl)
  });
  if (collageCache.key === cacheKey && collageCache.item) return [collageCache.item];

  const blob = await createPhotoCollage(images, photoLayout.value);
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error('Ảnh ghép vượt quá 5 MB. Hãy dùng ảnh nguồn nhỏ hơn.');
  }

  const filename = `bo-cuc-${photoLayout.value}-${Date.now()}.jpg`;
  const { data } = await http.post('/media/images', blob, {
    headers: {
      'Content-Type': 'image/jpeg',
      'X-File-Name': encodeURIComponent(filename)
    }
  });
  const item = {
    id: `collage-${Date.now()}`,
    name: filename,
    type: 'photo',
    url: data.image.url,
    uploadedUrl: data.image.url,
    mimeType: data.image.mimeType,
    size: data.image.size
  };
  collageCache = { key: cacheKey, item };
  return [item];
}

async function createPhotoCollage(images, layout) {
  const width = 1600;
  const height = 900;
  const gap = 4;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không hỗ trợ tạo ảnh bố cục.');

  context.fillStyle = '#111827';
  context.fillRect(0, 0, width, height);
  const loadedImages = await Promise.all(images.map((item) => loadCollageImage(item.uploadedUrl)));
  const rectangles = getCollageRectangles(loadedImages.length, layout, width, height, gap);
  loadedImages.forEach((image, index) => drawImageCover(context, image, rectangles[index]));

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Không thể tạo ảnh bố cục.')),
      'image/jpeg',
      0.9
    );
  });
}

function loadCollageImage(url) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không tải được ảnh để tạo bố cục.'));
    image.src = url;
  });
}

function getCollageRectangles(count, layout, width, height, gap) {
  const halfWidth = (width - gap) / 2;
  const halfHeight = (height - gap) / 2;

  if (count === 2) {
    return layout === 'hero-top'
      ? [
        { x: 0, y: 0, width, height: halfHeight },
        { x: 0, y: halfHeight + gap, width, height: halfHeight }
      ]
      : [
        { x: 0, y: 0, width: halfWidth, height },
        { x: halfWidth + gap, y: 0, width: halfWidth, height }
      ];
  }

  if (layout === 'focus-first') {
    const sideHeight = (height - gap * (count - 2)) / (count - 1);
    return [
      { x: 0, y: 0, width: halfWidth, height },
      ...Array.from({ length: count - 1 }, (_, index) => ({
        x: halfWidth + gap,
        y: index * (sideHeight + gap),
        width: halfWidth,
        height: sideHeight
      }))
    ];
  }

  if (layout === 'hero-top') {
    const bottomWidth = (width - gap * (count - 2)) / (count - 1);
    return [
      { x: 0, y: 0, width, height: halfHeight },
      ...Array.from({ length: count - 1 }, (_, index) => ({
        x: index * (bottomWidth + gap),
        y: halfHeight + gap,
        width: bottomWidth,
        height: halfHeight
      }))
    ];
  }

  if (count === 3) {
    const thirdWidth = (width - gap * 2) / 3;
    return [
      { x: 0, y: 0, width: thirdWidth, height },
      { x: thirdWidth + gap, y: 0, width: thirdWidth, height },
      { x: (thirdWidth + gap) * 2, y: 0, width: thirdWidth, height }
    ];
  }

  return [
    { x: 0, y: 0, width: halfWidth, height: halfHeight },
    { x: halfWidth + gap, y: 0, width: halfWidth, height: halfHeight },
    { x: 0, y: halfHeight + gap, width: halfWidth, height: halfHeight },
    { x: halfWidth + gap, y: halfHeight + gap, width: halfWidth, height: halfHeight }
  ];
}

function drawImageCover(context, image, rectangle) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = rectangle.width / rectangle.height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    rectangle.x,
    rectangle.y,
    rectangle.width,
    rectangle.height
  );
}

function updateQueueItem(id, patch) {
  queueItems.value = queueItems.value.map((item) => item.id === id ? { ...item, ...patch } : item);
}

async function closeQueueAccount(account, message = '') {
  const current = queueItems.value.find((item) => item.id === account._id);
  const baseMessage = message || current?.message || 'Đã xử lý';
  updateQueueItem(account._id, { message: `${baseMessage} · Đang tắt LDPlayer` });
  try {
    await http.post(`/mobile/accounts/${account._id}/remote/close-session`, {
      appPackage: selectedPlatform.value.packageName
    });
    updateQueueItem(account._id, { message: `${baseMessage} · Đã tắt LDPlayer` });
  } catch {
    updateQueueItem(account._id, { message: `${baseMessage} · Chưa tắt được LDPlayer` });
  }
  if (facebookSessionAccountId.value === account._id) {
    facebookSessionAccountId.value = '';
  }
  if (activeLdPlayerAccountId.value === account._id) {
    activeLdPlayerAccountId.value = '';
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setQueueDelay(value) {
  queueDelaySeconds.value = Math.max(0, Math.min(Number(value) || 0, 600));
}

function handleQueueDelayInput(event) {
  const digits = String(event.target.value || '').replace(/\D/g, '').slice(0, 3);
  const value = Math.min(Number(digits || 0), 600);
  queueDelaySeconds.value = value;
  event.target.value = String(value);
}

function adjustQueueDelay(amount) {
  setQueueDelay(queueDelaySeconds.value + amount);
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
    const storedDrafts = raw ? JSON.parse(raw) : [];
    drafts.value = Array.isArray(storedDrafts)
      ? storedDrafts.map((draft) => ({
        ...draft,
        media: Array.isArray(draft.media) ? draft.media.filter((item) => item?.uploadedUrl || item?.url) : []
      }))
      : [];
  } catch {
    drafts.value = [];
  }
}

function persistDrafts() {
  window.localStorage.setItem(draftStorageKey, JSON.stringify(drafts.value.slice(0, 20)));
}

function defaultScheduleDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
  return toDateTimeLocal(date);
}

function toDateTimeLocal(date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function applySchedulePreset(option) {
  const now = new Date();
  const target = new Date(now);

  if (option.minutes) {
    target.setTime(now.getTime() + option.minutes * 60 * 1000);
  } else if (option.preset === 'tonight') {
    target.setHours(20, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
  } else if (option.preset === 'tomorrow-morning') {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  }

  target.setMinutes(Math.ceil(target.getMinutes() / 5) * 5, 0, 0);
  scheduleDateTime.value = toDateTimeLocal(target);
}

function parseHashtags(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const normalized = raw
    .split(/[\s,;]+/)
    .map((tag) => tag.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  return Array.from(new Map(normalized.map((tag) => [tag.toLocaleLowerCase(), tag])).values());
}

function saveDraft(status = 'draft', options = {}) {
  if (!finalPostText.value.trim()) {
    ui.notify('Chưa có nội dung để lưu nháp.', 'error');
    return;
  }
  const draft = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: status === 'scheduled'
      ? `Lịch đăng ${formatDate(options.scheduledFor)}`
      : `Bài nháp ${new Date().toLocaleString('vi-VN')}`,
    type: 'photo',
    text: finalPostText.value.trim(),
    rawText: normalizeTextFormatArtifacts(post.text),
    hashtags: post.hashtags,
    mediaCount: post.media.length,
    media: post.media.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      uploadedUrl: item.uploadedUrl,
      mimeType: item.mimeType,
      size: item.size
    })).filter((item) => item.uploadedUrl),
    platform: selectedPlatformId.value,
    facebookPostType: facebookPostType.value,
    photoLayout: photoLayout.value,
    status,
    createdAt: new Date().toISOString(),
    scheduledFor: options.scheduledFor || null,
    targetAccountId: options.targetAccountId || selectedAccount.value?._id || null,
    targetAccountLabel: options.targetAccountLabel || selectedAccountLabel.value
  };
  drafts.value = [draft, ...drafts.value.filter((item) => item.text !== draft.text)].slice(0, 20);
  persistDrafts();
  if (status !== 'scheduled') ui.notify('Đã lưu nháp bài đăng.');
  return draft;
}

function saveScheduledPost() {
  if (!scheduleReady.value) {
    ui.notify(scheduleStatus.value, 'error');
    return null;
  }
  const draft = saveDraft('scheduled', {
    scheduledFor: new Date(scheduleDateTime.value).toISOString(),
    targetAccountId: selectedAccount.value?._id || null,
    targetAccountLabel: selectedAccountLabel.value
  });
  if (draft) {
    composerTab.value = 'queue';
    ui.notify(`Đã lưu lịch đăng lúc ${formatDate(draft.scheduledFor)}.`);
  }
  return draft;
}

function loadDraft(draft) {
  clearComposerMedia();
  if (draft.platform && platforms.some((platform) => platform.id === draft.platform)) {
    selectedPlatformId.value = draft.platform;
  }
  facebookPostType.value = draft.facebookPostType === 'video' ? 'video' : 'imageText';
  photoLayout.value = photoLayouts.some((layout) => layout.id === draft.photoLayout) ? draft.photoLayout : 'grid';
  post.text = normalizeTextFormatArtifacts(draft.rawText || draft.text || '');
  post.hashtags = draft.hashtags || '';
  post.media = (Array.isArray(draft.media) ? draft.media : [])
    .filter((item) => item?.uploadedUrl || item?.url)
    .map((item, index) => {
      const uploadedUrl = item.uploadedUrl || item.url;
      return {
        id: item.id || `draft-${draft.id}-${index}`,
        name: item.name || `media-${index + 1}`,
        type: item.type === 'video' ? 'video' : 'photo',
        url: uploadedUrl,
        uploadedUrl,
        mimeType: item.mimeType || '',
        size: item.size
      };
    });
  ensureValidPhotoLayout();
  if (draft.targetAccountId && accounts.value.some((account) => account._id === draft.targetAccountId)) {
    selectedAccountId.value = draft.targetAccountId;
  }
  if (draft.scheduledFor) {
    const scheduledAt = new Date(draft.scheduledFor);
    scheduleDateTime.value = toDateTimeLocal(scheduledAt);
  }
  composerTab.value = 'compose';
  const restoredMediaCount = post.media.length;
  if (draft.mediaCount && !restoredMediaCount) {
    ui.notify('Đã tải nội dung nháp. Nháp cũ không lưu đường dẫn ảnh nên không thể khôi phục ảnh.', 'error');
    return;
  }
  ui.notify(restoredMediaCount
    ? `Đã tải nháp và khôi phục ${restoredMediaCount} tệp media.`
    : 'Đã tải nháp vào composer.');
}

function deleteDraft(draftId) {
  drafts.value = drafts.value.filter((draft) => draft.id !== draftId);
  persistDrafts();
  ui.notify('Đã xóa nháp.');
}

function duplicateComposer() {
  saveDraft('draft');
}

function setFacebookPostType(type) {
  if (!['imageText', 'video'].includes(type) || facebookPostType.value === type) return;
  clearComposerMedia();
  facebookPostType.value = type;
}

function revokeMediaPreview(item) {
  if (String(item?.url || '').startsWith('blob:')) URL.revokeObjectURL(item.url);
}

function clearComposerMedia() {
  post.media.forEach(revokeMediaPreview);
  post.media = [];
  invalidateCollageCache();
}

function invalidateCollageCache() {
  collageCache = { key: '', item: null };
}

async function addMedia(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (isFacebookVideoMode.value) {
    const file = files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      ui.notify('Chỉ nhận tệp video cho chế độ đăng video.', 'error');
      return;
    }
    if (file.size > maxVideoSizeMb * 1024 * 1024) {
      ui.notify(`Video phải nhỏ hơn hoặc bằng ${maxVideoSizeMb} MB.`, 'error');
      return;
    }
    clearComposerMedia();

    mediaUploading.value = true;
    const previewUrl = URL.createObjectURL(file);
    try {
      const { data } = await http.post('/media/videos', file, {
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name)
        }
      });
      post.media.push({
        id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: 'video',
        url: previewUrl,
        uploadedUrl: data.video.url,
        mimeType: data.video.mimeType,
        size: data.video.size
      });
      invalidateCollageCache();
      ui.notify('Đã tải video lên server.');
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      ui.notify(error.message, 'error');
    } finally {
      mediaUploading.value = false;
    }
    return;
  }

  const remaining = platformMaxPhotos.value - post.media.filter((item) => item.type === 'photo').length;
  const selectedFiles = files.slice(0, remaining);
  if (!selectedFiles.length) return;
  if (files.length > remaining) ui.notify(`Chi nhan them ${remaining} anh de giu gioi han ${platformMaxPhotos.value} anh.`, 'error');
  if (selectedFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    ui.notify('Anh phai nho hon hoac bang 5 MB.', 'error');
    return;
  }

  mediaUploading.value = true;
  const pendingPreviews = [];
  try {
    const uploadedItems = await Promise.all(selectedFiles.map(async (file, index) => {
      const previewUrl = URL.createObjectURL(file);
      pendingPreviews.push(previewUrl);
      try {
        const { data } = await http.post('/media/images', file, {
          headers: {
            'Content-Type': file.type,
            'X-File-Name': encodeURIComponent(file.name)
          }
        });
        return {
          id: `${Date.now()}-${index}-${file.name}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          type: 'photo',
          url: previewUrl,
          uploadedUrl: data.image.url,
          mimeType: data.image.mimeType,
          size: data.image.size
        };
      } catch (error) {
        URL.revokeObjectURL(previewUrl);
        throw error;
      }
    }));
    post.media.push(...uploadedItems);
    invalidateCollageCache();
    ensureValidPhotoLayout();
    ui.notify(`Da tai ${selectedFiles.length} anh len server.`);
  } catch (error) {
    pendingPreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    ui.notify(error.message, 'error');
  } finally {
    mediaUploading.value = false;
  }
}

function removeMedia(item) {
  revokeMediaPreview(item);
  post.media = post.media.filter((media) => media.id !== item.id);
  invalidateCollageCache();
  ensureValidPhotoLayout();
}

function ensureValidPhotoLayout() {
  if (!availablePhotoLayouts.value.some((layout) => layout.id === photoLayout.value)) {
    photoLayout.value = availablePhotoLayouts.value[0]?.id || 'grid';
  }
}

function previewPhotoClass(index) {
  const count = previewPhotos.value.length;
  if (photoLayout.value === 'focus-first') {
    if (count === 2 && index === 0) return 'col-span-2';
    if (count >= 3 && index === 0) return count === 3 ? 'row-span-2' : 'row-span-3';
  }
  if (photoLayout.value === 'hero-top') {
    if (count === 2) return '';
    if (index === 0) return 'col-span-6';
    if (count === 3) return 'col-span-3';
    return 'col-span-2';
  }
  return '';
}

function previewImageClass() {
  return previewPhotos.value.length === 1
    ? 'max-h-[34rem] w-full object-cover'
    : 'h-full min-h-0 w-full object-cover';
}

function previewPhotoOrder(item) {
  return previewPhotos.value.findIndex((photo) => photo.id === item.id);
}

function movePreviewPhoto(item, offset) {
  const photoIndex = previewPhotoOrder(item);
  const targetPhoto = previewPhotos.value[photoIndex + offset];
  if (!targetPhoto) return;
  reorderPreviewPhotos(item.id, targetPhoto.id);
}

function startPreviewPhotoDrag(item, event) {
  draggedPreviewPhotoId.value = item.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.id);
}

function dropPreviewPhoto(targetItem, event) {
  const sourceId = event.dataTransfer.getData('text/plain') || draggedPreviewPhotoId.value;
  reorderPreviewPhotos(sourceId, targetItem.id);
  draggedPreviewPhotoId.value = '';
}

function reorderPreviewPhotos(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;
  const sourceIndex = post.media.findIndex((item) => item.id === sourceId);
  const targetIndex = post.media.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const source = post.media[sourceIndex];
  const target = post.media[targetIndex];
  post.media.splice(sourceIndex, 1, target);
  post.media.splice(targetIndex, 1, source);
  invalidateCollageCache();
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

function resetComposer() {
  post.text = '';
  post.hashtags = '';
  clearComposerMedia();
  photoLayout.value = 'grid';
  postResult.value = null;
  showEmojiPicker.value = false;
  workflowStage.value = 'idle';
}

function formatDate(value) {
  if (!value) return 'Chua co';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatPostRun(log) {
  const mapped = postRunActionLabels[log.action];
  return {
    title: mapped?.title || 'Cập nhật trạng thái đăng',
    detail: mapped?.detail || log.message || 'Tool vừa ghi nhận một bước trong workflow đăng bài.'
  };
}

function formatLog(log) {
  const target = accounts.value.find((account) => account._id === log.accountId);
  return target?.displayName || log.accountId;
}

function logout() {
  auth.logout();
  router.push('/login');
}

onMounted(async () => {
  loadDrafts();
  await load();
  await ensureDefaultProfile();
  await syncSelectedAccountRuntimeStatus();
  startRuntimeStatusPolling();
});

onUnmounted(() => {
  stopRuntimeStatusPolling();
  post.media.forEach(revokeMediaPreview);
});

watch(selectedAccountId, () => {
  runtimeStatusRequestId += 1;
  selectedRuntimeStatus.value = null;
  runtimeStatusMissCount.value = 0;
  // Chỉ xóa trạng thái của profile đang chọn. Giữ activeLdPlayerAccountId
  // để khi bấm mở profile mới, hệ thống vẫn biết instance cũ cần được tắt.
  facebookSessionAccountId.value = '';
  syncSelectedAccountRuntimeStatus();
});
const queueCurrentItem = computed(() => queueItems.value.find((item) => item.id === queueCurrentAccountId.value)
  || queueItems.value.find((item) => ['running', 'waiting'].includes(item.status))
  || null);
const queueCurrentIndex = computed(() => {
  const index = queueItems.value.findIndex((item) => item.id === queueCurrentItem.value?.id);
  return index >= 0 ? index : Math.min(queueStats.value.done + queueStats.value.review + queueStats.value.failed, Math.max(queueStats.value.total - 1, 0));
});
const queuePreviousItem = computed(() => {
  const completed = queueItems.value.filter((item) => ['done', 'review', 'failed'].includes(item.status));
  return completed[completed.length - 1] || null;
});
const queueNextItem = computed(() => queueItems.value.slice(queueCurrentIndex.value + 1)
  .find((item) => ['pending', 'waiting'].includes(item.status)) || null);
const queueDisplayTarget = computed(() => ['closing', 'switching', 'waiting'].includes(queuePhase.value)
  ? (queueNextItem.value || queueCurrentItem.value)
  : queueCurrentItem.value);
const queueOverlayTitle = computed(() => {
  if (queuePhase.value === 'switching') return 'Đang chuyển sang tài khoản tiếp theo';
  if (queuePhase.value === 'closing') return 'Đang hoàn tất tài khoản hiện tại';
  if (queuePhase.value === 'waiting') return 'Đang chờ trước lượt tiếp theo';
  return 'Đang đăng bài';
});

watch(photoLayout, invalidateCollageCache);

watch(selectedPlatformId, async () => {
  runtimeStatusRequestId += 1;
  selectedRuntimeStatus.value = null;
  runtimeStatusMissCount.value = 0;
  if (selectedPlatformId.value !== 'facebook') {
    facebookPostType.value = 'imageText';
    post.media = post.media.filter((item) => {
      if (item.type === 'photo') return true;
      revokeMediaPreview(item);
      return false;
    });
  }
  const preferred = findPreferredAccount(accounts.value);
  selectedAccountId.value = preferred?._id || '';
  selectedQueueAccountIds.value = accounts.value.filter((account) => account.platform === selectedPlatformId.value).slice(0, 1).map((account) => account._id);
  facebookSessionAccountId.value = '';
  await ensureDefaultProfile();
  await syncSelectedAccountRuntimeStatus();
});
</script>

<template>
  <div class="grid min-h-[calc(100vh-73px)] lg:grid-cols-[248px_1fr]">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showFacebookActivityOverlay"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 px-4 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div
          v-if="queueRunning"
          class="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-5 text-white shadow-2xl"
        >
          <div class="flex items-center gap-3">
            <FacebookActivityIcon size="md" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <p class="truncate text-sm font-black">{{ queueOverlayTitle }}</p>
                <span class="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black">
                  {{ Math.min(queueCurrentIndex + 1, queueStats.total) }}/{{ queueStats.total }}
                </span>
              </div>
              <p class="mt-0.5 truncate text-xs text-zinc-400">
                {{ queueCurrentItem?.message || 'Đang chuẩn bị lượt đăng' }}
              </p>
            </div>
          </div>

          <div class="mt-5 overflow-hidden rounded-full bg-white/10">
            <div
              class="h-1.5 rounded-full bg-[#1877F2] transition-all duration-500"
              :style="{ width: `${Math.max(queueProgressPercent, queueStats.total ? ((queueCurrentIndex + 0.35) / queueStats.total) * 100 : 0)}%` }"
            ></div>
          </div>

          <div class="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div class="min-w-0 rounded-xl border border-white/10 bg-white/5 p-3">
              <p class="text-[10px] font-black uppercase tracking-wider text-zinc-500">Đã xử lý</p>
              <p class="mt-1 truncate text-xs font-bold text-zinc-200">{{ queuePreviousItem?.name || 'Chưa có' }}</p>
              <p class="mt-1 text-[10px] text-emerald-400">
                {{ queuePreviousItem?.status === 'done' ? 'Đăng thành công' : queuePreviousItem?.status === 'failed' ? 'Có lỗi' : 'Đã hoàn tất' }}
              </p>
            </div>
            <ChevronRight class="h-5 w-5 text-zinc-600" />
            <div class="min-w-0 rounded-xl border border-[#1877F2]/40 bg-[#1877F2]/10 p-3">
              <p class="text-[10px] font-black uppercase tracking-wider text-blue-300">
                {{ queuePhase === 'switching' ? 'Tiếp theo' : 'Đang thực hiện' }}
              </p>
              <p class="mt-1 truncate text-xs font-bold">{{ queueDisplayTarget?.name || 'Đang chuẩn bị' }}</p>
              <p class="mt-1 truncate text-[10px] text-zinc-400">{{ queueDisplayTarget?.instanceName || 'LDPlayer' }}</p>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-zinc-500">
            <span>{{ queueStats.done }} thành công · {{ queueStats.failed }} lỗi</span>
            <span>Không đóng cửa sổ</span>
          </div>
        </div>
        <div v-else class="flex min-w-64 flex-col items-center rounded-2xl border border-white/10 bg-zinc-950/90 px-8 py-7 text-center text-white shadow-2xl">
          <FacebookActivityIcon size="lg" />
          <p class="mt-5 text-base font-black">{{ facebookActivityLabel }}</p>
          <p class="mt-1 text-xs text-zinc-400">Vui lòng giữ nguyên cửa sổ trong khi hệ thống xử lý</p>
          <div class="mt-5 h-1 w-36 overflow-hidden rounded-full bg-white/10">
            <div class="h-full w-1/2 animate-pulse rounded-full bg-[#1877F2]"></div>
          </div>
        </div>
      </div>
    </Transition>
    <aside class="border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div class="sticky top-[73px] flex max-h-[calc(100vh-73px)] min-h-[calc(100vh-73px)] flex-col">
        <div class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p class="text-xs font-extrabold uppercase tracking-[0.18em] text-zinc-500">Nền tảng</p>
          <h2 class="mt-1 text-lg font-black">Kênh đăng</h2>
        </div>

        <div class="flex-1 overflow-auto">
          <div class="border-b border-zinc-200 dark:border-zinc-800">
          <button
            v-for="(platform, index) in platforms"
            :key="platform.id"
            :class="[
              'group flex w-full items-center py-3 text-left text-sm font-black transition',
              selectedPlatformId === platform.id
                ? 'border-l-4 border-emerald-400 bg-emerald-500/10 pl-3 pr-4 text-zinc-950 dark:text-white'
                : 'px-4 text-zinc-500 hover:bg-white hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white',
              index + 1 < platforms.length ? 'border-b border-zinc-200 dark:border-zinc-800' : ''
            ]"
            type="button"
            :disabled="posting || queueRunning"
            @click="selectedPlatformId = platform.id"
          >
            <span
              :class="[
                'mr-3 grid h-7 w-7 shrink-0 place-items-center rounded-xl text-sm font-black shadow-sm ring-1 ring-white/10',
                platform.iconClass
              ]"
            >
              {{ platform.iconLabel }}
            </span>
            <span>{{ platform.label }}</span>
          </button>
          </div>
        </div>

        <div class="grid gap-1.5 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <button class="btn-soft h-9 justify-start px-3 text-sm" title="Đổi giao diện" type="button" @click="ui.toggleDark">
            <component :is="ui.dark ? Sun : Moon" class="h-4 w-4" />
            <span>{{ ui.dark ? 'Chế độ sáng' : 'Chế độ tối' }}</span>
          </button>
          <button class="btn-soft h-9 justify-start px-3 text-sm" type="button" @click="logout">
            <LogOut class="h-4 w-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </aside>

    <div class="space-y-5 p-4 sm:p-8">
      <BaseCard>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Thiết bị đăng bài</p>
            <h2 class="mt-1 text-xl font-extrabold">{{ selectedAccount ? formatAccountDisplayName(selectedAccount) : 'Chưa chọn profile' }}</h2>
            <p class="mt-1 text-sm text-zinc-500">
              {{ selectedAccount ? formatInstanceLabel(selectedAccount) : 'LDPlayer' }} · {{ selectedAccount?.deviceId || selectedAccount?.adbHost || 'ADB chưa cấu hình' }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="min-w-[240px] text-xs font-extrabold uppercase tracking-wide text-zinc-500">
              Profile {{ selectedPlatform.label }}
              <select v-model="selectedAccountId" class="field mt-2 h-10 text-sm normal-case tracking-normal">
                <option v-for="account in facebookAccounts" :key="account._id" :value="account._id">
                  {{ formatAccountLabel(account) }}
                </option>
              </select>
            </label>
            <button
              class="btn-soft mt-5 h-10"
              :class="facebookAppReady ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : ''"
              :disabled="running || facebookOpening || !canUseRemote || facebookAppReady"
              @click="remoteOpenApp"
            >
              <CheckCircle2 v-if="facebookAppReady" class="h-4 w-4" />
              <Play v-else class="h-4 w-4" />
              {{ facebookOpenButtonLabel }}
            </button>
            <button class="btn-soft mt-5 h-10" type="button" @click="showDeviceTools = !showDeviceTools">
              <Terminal class="h-4 w-4" />
              {{ showDeviceTools ? 'Ẩn công cụ' : 'Công cụ thiết bị' }}
            </button>
          </div>
        </div>

      <div v-if="showDeviceTools" class="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Giám sát LDPlayer</p>
            <h3 class="mt-1 font-extrabold">Màn hình thiết bị</h3>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-soft h-9 px-3 text-xs" :disabled="screenshotLoading || !canUseRemote" @click="refreshScreenshot">
              <RefreshCcw class="h-4 w-4" />
              Cập nhật màn hình
            </button>
            <button class="btn-soft h-9 px-3 text-xs" :disabled="!canUseRemote" @click="probeDevice">
              <Wifi class="h-4 w-4" />
              Kiểm tra ADB
            </button>
            <button class="btn-soft h-9 px-3 text-xs" :disabled="running || !canUseRemote" @click="remoteLaunch">
              <Smartphone class="h-4 w-4" />
              Khởi động LDPlayer
            </button>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
          <div class="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            <button
              class="relative grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400"
              :disabled="screenshotLoading || !canUseRemote"
              @click="clickScreenshot"
            >
              <img v-if="screenshotSrc" :src="screenshotSrc" alt="LDPlayer screenshot" class="h-full w-full object-contain" />
              <span v-else>{{ screenshotLoading ? 'Đang tải màn hình...' : 'Bấm làm mới để xem màn hình LDPlayer' }}</span>
              <span v-if="screenshotLoading" class="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">Loading</span>
            </button>
          </div>

          <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-lg bg-white p-3 dark:bg-zinc-950">
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Profile</p>
                <p class="mt-1 truncate text-sm font-extrabold">{{ selectedAccount?.displayName || 'Chưa chọn' }}</p>
              </div>
              <div class="rounded-lg bg-white p-3 dark:bg-zinc-950">
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">ADB</p>
                <p class="mt-1 truncate text-sm font-extrabold">{{ selectedAccount?.deviceId || selectedAccount?.adbHost || 'Chưa cấu hình' }}</p>
              </div>
              <div class="rounded-lg bg-white p-3 dark:bg-zinc-950">
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">{{ selectedPlatform.label }}</p>
                <p class="mt-1 truncate text-sm font-extrabold">{{ facebookSessionStatusLabel }}</p>
              </div>
            </div>

            <details class="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <summary class="cursor-pointer text-sm font-extrabold text-zinc-700 dark:text-zinc-200">
                Điều khiển thủ công
              </summary>
              <div class="mt-3 space-y-3">
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
              </div>
            </details>
          </div>
        </div>
      </div>
    </BaseCard>

    <BaseCard>
      <div class="mb-5 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 text-white shadow-sm dark:border-zinc-800">
        <div class="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div class="min-w-0">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-300">
                <Sparkles class="h-3.5 w-3.5" />
                {{ selectedPlatform.label }} automation
              </span>
              <span class="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
                <Gauge class="h-3.5 w-3.5" />
                {{ workflowLabel }}
              </span>
            </div>
            <h2 class="text-2xl font-extrabold md:text-3xl">Đăng {{ selectedPlatform.label }} qua LDPlayer</h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Soạn caption, kiểm tra profile, chạy automation qua app {{ selectedPlatform.label }} thật và theo dõi xác minh sau đăng trong cùng một màn hình.
            </p>
          </div>

          <button class="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-zinc-200 transition hover:bg-white/15" title="Xóa nội dung đang soạn" @click="resetComposer">
            <RefreshCcw class="h-4 w-4" />
          </button>
        </div>

        <div class="grid border-t border-white/10 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="item in professionalKpis"
            :key="item.label"
            class="border-white/10 px-5 py-4 sm:border-r xl:last:border-r-0"
          >
            <div class="mb-2 flex items-center justify-between gap-3">
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">{{ item.label }}</p>
              <span
                :class="[
                  'h-2.5 w-2.5 rounded-full',
                  item.tone === 'ok' ? 'bg-emerald-400' : item.tone === 'warn' ? 'bg-amber-400' : item.tone === 'run' ? 'bg-sky-400' : 'bg-zinc-500'
                ]"
              ></span>
            </div>
            <p class="text-2xl font-black">{{ item.value }}</p>
            <p class="mt-1 truncate text-xs text-zinc-500">{{ item.detail }}</p>
          </div>
        </div>
      </div>

      <div class="mb-4 grid gap-4">
        <div class="rounded-2xl border border-zinc-200 p-4 shadow-sm dark:border-zinc-800">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Chế độ đăng</p>
              <h3 class="mt-1 font-extrabold">Luồng đăng một profile</h3>
            </div>
            <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {{ isBulkMode ? 'Đang dùng chế độ nhiều profile' : currentPublishMode.title }}
            </span>
          </div>
          <div class="grid gap-2 md:grid-cols-3">
            <button
              v-for="mode in primaryPublishModes"
              :key="mode.id"
              :class="[
                'rounded-xl border p-3 text-left transition',
                publishMode === mode.id ? 'border-emerald-500 bg-emerald-500/10 shadow-sm' : 'border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900',
                isBulkMode ? 'opacity-60' : ''
              ]"
              type="button"
              :disabled="posting || queueRunning"
              @click="publishMode = mode.id"
            >
              <div class="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                <Zap v-if="mode.icon === 'zap'" class="h-4 w-4" />
                <ShieldCheck v-else-if="mode.icon === 'shield'" class="h-4 w-4" />
                <Timer v-else class="h-4 w-4" />
              </div>
              <p class="font-extrabold">{{ mode.title }}</p>
              <p class="mt-1 text-xs leading-5 text-zinc-500">{{ mode.description }}</p>
            </button>
          </div>
        </div>

        <div
          :class="[
            'rounded-2xl border p-4 shadow-sm transition',
            isBulkMode ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-zinc-200 dark:border-zinc-800'
          ]"
        >
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Đăng nhiều tài khoản</p>
              <h3 class="mt-1 font-extrabold">Đăng hàng loạt</h3>
            </div>
            <button
              :class="[
                'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60',
                isBulkMode ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900'
              ]"
              type="button"
              :disabled="posting || queueRunning"
              @click="publishMode = isBulkMode ? 'direct' : 'bulk'"
            >
              <Users class="h-4 w-4" />
              {{ isBulkMode ? 'Đang bật' : 'Bật hàng loạt' }}
            </button>
          </div>

          <div v-if="isBulkMode" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <div class="mb-3 flex items-center justify-between gap-3">
                <p class="text-sm font-extrabold">Profile mục tiêu</p>
                <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {{ selectedQueueAccounts.length }}/{{ facebookAccounts.length }} đã chọn
                </span>
              </div>
              <div class="app-scrollbar max-h-52 space-y-2 overflow-auto pr-1">
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
                  Chưa có profile {{ selectedPlatform.label }} để chọn.
                </p>
              </div>
            </div>

            <div class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <p class="text-xs font-black text-zinc-800 dark:text-zinc-100">Thời gian chuyển tài khoản</p>
                <p class="mt-1 text-[11px] leading-4 text-zinc-500">Khoảng nghỉ trước khi hệ thống xử lý tài khoản tiếp theo.</p>
              </div>
              <div class="mt-3 flex h-11 items-center rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg font-bold text-zinc-500 transition hover:bg-white hover:text-zinc-950 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-white"
                  type="button"
                  title="Giảm 5 giây"
                  :disabled="posting || queueRunning || queueDelaySeconds <= 0"
                  @click="adjustQueueDelay(-5)"
                >
                  −
                </button>
                <label class="flex min-w-0 flex-1 items-baseline justify-center gap-1">
                  <input
                    :value="queueDelaySeconds"
                    class="w-12 bg-transparent text-center text-base font-black text-zinc-900 outline-none dark:text-white"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    maxlength="3"
                    aria-label="Thời gian chuyển tài khoản"
                    :disabled="posting || queueRunning"
                    @input="handleQueueDelayInput"
                  />
                  <span class="text-[11px] font-bold text-zinc-500">giây</span>
                </label>
                <button
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg font-bold text-zinc-500 transition hover:bg-white hover:text-zinc-950 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-white"
                  type="button"
                  title="Tăng 5 giây"
                  :disabled="posting || queueRunning || queueDelaySeconds >= 600"
                  @click="adjustQueueDelay(5)"
                >
                  +
                </button>
              </div>
              <div class="mt-2 grid grid-cols-3 gap-1.5">
                <button
                  v-for="seconds in [0, 5, 10]"
                  :key="seconds"
                  :class="[
                    'h-7 rounded-lg text-[10px] font-extrabold transition',
                    queueDelaySeconds === seconds
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                      : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900 dark:bg-zinc-900 dark:hover:text-white'
                  ]"
                  type="button"
                  :disabled="posting || queueRunning"
                  @click="setQueueDelay(seconds)"
                >
                  {{ seconds === 0 ? 'Không nghỉ' : `${seconds} giây` }}
                </button>
              </div>
              <button
                class="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-extrabold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                type="button"
                :disabled="!canRunWorkflow"
                @click="runPostWorkflow()"
              >
                <Send class="h-4 w-4" />
                Bắt đầu đăng
              </button>
            </div>
          </div>
        </div>

      </div>

      <div v-if="isScheduleMode" class="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-extrabold uppercase tracking-wide text-emerald-500">Lên lịch đăng</p>
            <h3 class="mt-1 font-extrabold">Thiết lập thời gian đăng</h3>
            <p class="mt-1 text-sm leading-6 text-zinc-500">
              Lịch được lưu cục bộ cùng nội dung bài viết, profile mục tiêu và media đã chuẩn bị.
            </p>
          </div>
          <span
            :class="[
              'rounded-full px-3 py-1 text-xs font-extrabold',
              scheduleReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            ]"
          >
            {{ scheduleReady ? 'Hợp lệ' : 'Cần chọn lại' }}
          </span>
        </div>

        <div class="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <div class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Thời điểm đăng</p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="block text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                Ngày đăng
                <input
                  v-model="scheduleDate"
                  class="field mt-2"
                  type="date"
                  :min="minScheduleDate"
                />
              </label>
              <label class="block text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                Giờ đăng
                <input
                  v-model="scheduleTime"
                  class="field mt-2"
                  type="time"
                  step="300"
                />
              </label>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="option in scheduleQuickOptions"
                :key="option.label"
                class="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-extrabold text-zinc-700 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                type="button"
                @click="applySchedulePreset(option)"
              >
                {{ option.label }}
              </button>
            </div>
            <p class="mt-3 text-sm font-extrabold text-zinc-900 dark:text-white">{{ scheduleStatus }}</p>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Profile</p>
              <p class="mt-2 truncate text-sm font-extrabold">{{ selectedAccount?.displayName || 'Chưa chọn' }}</p>
              <p class="mt-1 truncate text-xs text-zinc-500">{{ selectedAccount?.instanceName || selectedAccount?.adbHost || 'LDPlayer' }}</p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Nội dung</p>
              <p class="mt-2 text-sm font-extrabold">{{ characterCount }}/5000</p>
              <p class="mt-1 text-xs text-zinc-500">{{ hashtagItems.length }} hashtag · {{ uploadedPhotoCount }} ảnh</p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Trạng thái</p>
              <p class="mt-2 text-sm font-extrabold">{{ scheduleStatus }}</p>
            </div>
          </div>
        </div>

        <div class="mt-4 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Lịch sử lên lịch</p>
              <h4 class="mt-1 font-extrabold">Lịch đã lên</h4>
            </div>
            <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {{ scheduledDrafts.length }} mục
            </span>
          </div>
          <div class="app-scrollbar mt-3 max-h-48 space-y-2 overflow-auto pr-1">
            <article
              v-for="draft in scheduledDrafts"
              :key="`schedule-${draft.id}`"
              class="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate font-extrabold">{{ formatDate(draft.scheduledFor) }}</p>
                  <p class="mt-1 line-clamp-2 text-zinc-500">{{ draft.text }}</p>
                  <p class="mt-2 truncate text-xs text-zinc-500">{{ draft.targetAccountLabel || 'Chưa có profile mục tiêu' }} · {{ draft.mediaCount }} ảnh</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <button class="btn-soft h-9 px-3 text-xs" type="button" @click="loadDraft(draft)">
                    Tải
                  </button>
                  <button
                    class="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                    title="Xóa lịch"
                    type="button"
                    @click="deleteDraft(draft.id)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
            <p v-if="!scheduledDrafts.length" class="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
              Chưa có lịch nào. Chọn thời gian và bấm Lưu lịch để lưu vào hàng chờ.
            </p>
          </div>
        </div>
      </div>

      <div class="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Nội dung bài đăng</p>
              <h3 class="mt-1 font-extrabold">Thông tin chuẩn bị</h3>
            </div>
          </div>

          <div class="mb-4 grid gap-3 md:grid-cols-3">
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Ký tự</p>
              <div class="mt-2 flex items-end gap-2">
                <span class="text-2xl font-black">{{ characterCount }}</span>
                <span class="pb-1 text-xs font-bold text-zinc-500">/5000</span>
              </div>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Hashtag cuối bài</p>
              <p class="mt-2 text-2xl font-black">{{ hashtagItems.length }}</p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Ảnh</p>
              <p class="mt-2 text-2xl font-black">{{ uploadedPhotoCount }}/{{ platformMaxPhotos }}</p>
            </div>
          </div>

          <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Hashtag cuối bài</p>
                <p class="mt-1 text-sm font-bold text-zinc-700 dark:text-zinc-200">Phân tách bằng dấu phẩy · Tự loại bỏ khoảng trắng</p>
              </div>
              <span
                :class="[
                  'rounded-full px-3 py-1 text-xs font-extrabold',
                  hashtagItems.length > 6 ? 'bg-red-100 text-red-700' : hashtagItems.length > 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                ]"
              >
                {{ hashtagSummary }}
              </span>
            </div>

            <label class="block">
              <div class="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 focus-within:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-lg font-black text-emerald-500">#</span>
                <input
                  v-model="post.hashtags"
                  class="min-w-0 flex-1 bg-transparent text-sm font-bold text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white"
                  placeholder="ưu đãi khách hàng, automation"
                />
              </div>
            </label>

            <div class="mt-3 min-h-9 rounded-xl border border-dashed border-zinc-200 bg-white/60 p-2 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div v-if="hashtagItems.length" class="flex flex-wrap gap-2">
                <span
                  v-for="tag in hashtagItems"
                  :key="tag"
                  class="inline-flex max-w-full items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-extrabold text-blue-500"
                >
                  <span class="truncate">{{ tag }}</span>
                </span>
              </div>
              <p v-else class="px-1 py-1 text-xs font-medium text-zinc-500">
                Kết quả: #ưuđãikháchhàng #automation
              </p>
            </div>
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
              <div class="absolute right-3 top-3 flex items-center gap-2">
                <button
                  v-if="!isBulkMode"
                  class="inline-flex h-9 min-w-20 items-center justify-center gap-2 rounded-lg bg-white px-3 text-xs font-extrabold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                  type="button"
                  :disabled="!canRunWorkflow"
                  :title="facebookAppReady || !requiresFacebookSession ? primaryActionLabel : `Mở ${selectedPlatform.label} trước khi đăng`"
                  @click="runPostWorkflow()"
                >
                  <Send class="h-4 w-4" />
                  {{ primaryActionLabel }}
                </button>
                <button
                  class="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  type="button"
                  :disabled="!finalPostText.trim()"
                  @click="saveDraft('draft')"
                >
                  <Save class="h-4 w-4" />
                  Lưu nháp
                </button>
                <span class="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-100 px-3 text-xs font-extrabold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <BarChart3 class="h-4 w-4" />
                  {{ characterCount }}/5000
                </span>
              </div>
            </div>

            <div class="space-y-4 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-sm font-extrabold text-white">
                    {{ accountInitial }}
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-extrabold">{{ selectedAccount?.displayName || `${selectedPlatform.label} profile` }}</p>
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

              <div v-if="composerTab === 'compose'" class="space-y-4">
                <div v-if="selectedPlatformId === 'facebook'" class="flex flex-wrap items-center border-b border-zinc-200 pb-3 dark:border-zinc-700">
                  <div class="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-950">
                    <button
                      :class="[
                        'inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-extrabold transition',
                        facebookPostType === 'imageText' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                      ]"
                      type="button"
                      :disabled="posting || queueRunning"
                      @click="setFacebookPostType('imageText')"
                    >
                      <Image class="h-3.5 w-3.5" />
                      Ảnh/Text
                    </button>
                    <button
                      :class="[
                        'inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-extrabold transition',
                        facebookPostType === 'video' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
                      ]"
                      type="button"
                      :disabled="posting || queueRunning"
                      @click="setFacebookPostType('video')"
                    >
                      <Video class="h-3.5 w-3.5" />
                      Video
                    </button>
                  </div>
                </div>
                <div v-else-if="selectedPlatformId === 'instagram'" class="flex flex-wrap items-center border-b border-zinc-200 pb-3 dark:border-zinc-700">
                  <div class="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-950">
                    <button
                      class="inline-flex h-8 items-center gap-2 rounded-full bg-white px-3 text-xs font-extrabold text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                      type="button"
                      disabled
                      title="1 ảnh sẽ đăng ảnh đơn; từ 2 ảnh sẽ tự động đăng Album"
                    >
                      <Image class="h-3.5 w-3.5" />
                      Ảnh / Album
                      <span class="hidden text-[10px] font-black uppercase tracking-wide text-zinc-500 sm:inline">
                        {{ selectedPhotoCount > 1 ? `${selectedPhotoCount} ảnh` : 'Tự động' }}
                      </span>
                    </button>
                    <button
                      class="inline-flex h-8 cursor-not-allowed items-center gap-2 rounded-full px-3 text-xs font-extrabold text-zinc-500 opacity-45"
                      type="button"
                      disabled
                      title="Video Feed chưa bật automation"
                    >
                      <Video class="h-3.5 w-3.5" />
                      Video Feed
                      <span class="hidden text-[10px] font-black uppercase tracking-wide sm:inline">Sắp có</span>
                    </button>
                  </div>
                </div>

                <div class="border-b border-zinc-200 pb-3 dark:border-zinc-700">
                <textarea
                  ref="composerTextarea"
                  v-model="post.text"
                  class="min-h-32 w-full resize-y bg-transparent text-2xl leading-9 outline-none placeholder:text-zinc-400"
                  placeholder="Bạn đang nghĩ gì?"
                  @focus="showEmojiPicker = false"
                ></textarea>
              </div>

                <div v-if="post.media.length" class="space-y-3">
                  <div
                    v-if="selectedPlatformId === 'facebook' && canArrangePhotos"
                    class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div class="flex min-w-0 items-center gap-2.5">
                      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        <ListChecks class="h-4 w-4" />
                      </span>
                      <div class="min-w-0">
                        <p class="text-xs font-black text-zinc-800 dark:text-zinc-100">Trình bày ảnh</p>
                        <p class="truncate text-[11px] text-zinc-500">Chọn bố cục · Kéo thả để sắp xếp · Xuất thành một ảnh ghép</p>
                      </div>
                    </div>
                    <div class="inline-flex max-w-full items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-950">
                      <button
                        v-for="layout in availablePhotoLayouts"
                        :key="layout.id"
                        :class="[
                          'group inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-xs font-extrabold transition',
                          photoLayout === layout.id
                            ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-950'
                            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white'
                        ]"
                        type="button"
                        :title="layout.description"
                        @click="photoLayout = layout.id"
                      >
                        <span class="grid h-5 w-7 shrink-0 grid-cols-2 gap-px overflow-hidden rounded-sm bg-zinc-300 dark:bg-zinc-700">
                          <span
                            :class="[
                              'bg-current opacity-70',
                              layout.id === 'focus-first' ? 'row-span-2' : '',
                              layout.id === 'hero-top' ? 'col-span-2' : ''
                            ]"
                          ></span>
                          <span class="bg-current opacity-40"></span>
                          <span class="bg-current opacity-40"></span>
                        </span>
                        <span class="hidden sm:inline">{{ layout.label }}</span>
                      </button>
                    </div>
                  </div>
                  <div
                    :class="[
                      selectedVideo ? 'grid gap-3' : previewGalleryClass,
                      !selectedVideo && 'overflow-hidden rounded-xl border border-zinc-300 bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800'
                    ]"
                  >
                    <div
                      v-for="(item, index) in post.media"
                      :key="item.id"
                      :draggable="canArrangePhotos && item.type === 'photo'"
                      :class="[
                        'group relative min-h-0 overflow-hidden bg-zinc-100 dark:bg-zinc-900',
                        selectedVideo ? 'rounded-xl border border-zinc-300 shadow-sm dark:border-zinc-700' : '',
                        item.type === 'photo' ? previewPhotoClass(index) : ''
                      ]"
                      @dragstart="canArrangePhotos && startPreviewPhotoDrag(item, $event)"
                      @dragover.prevent
                      @drop="canArrangePhotos && dropPreviewPhoto(item, $event)"
                    >
                      <img v-if="item.type === 'photo'" :src="item.url" :alt="item.name" :class="previewImageClass()" />
                      <video v-else-if="item.type === 'video'" :src="item.url" class="h-64 w-full bg-black object-contain" controls playsinline></video>
                      <span
                        v-if="canArrangePhotos && item.type === 'photo'"
                        class="absolute left-2.5 top-2.5 grid h-7 min-w-7 place-items-center rounded-full border border-white/20 bg-black/70 px-2 text-[11px] font-black text-white shadow-sm backdrop-blur"
                      >
                        {{ previewPhotoOrder(item) + 1 }}
                      </span>
                      <button
                        class="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/60 text-white opacity-0 shadow-sm backdrop-blur transition hover:bg-black group-hover:opacity-100 focus:opacity-100"
                        title="Xóa tệp"
                        type="button"
                        @click="removeMedia(item)"
                      >
                        <XCircle class="h-5 w-5" />
                      </button>
                      <div class="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                        <div class="flex items-center justify-between gap-2">
                          <p class="truncate text-xs font-bold text-white">
                            {{ item.name }}
                          </p>
                          <div v-if="canArrangePhotos && item.type === 'photo'" class="flex shrink-0 items-center gap-1">
                            <button
                              class="grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white disabled:opacity-30"
                              title="Chuyển ảnh sang trái"
                              type="button"
                              :disabled="previewPhotoOrder(item) === 0"
                              @click="movePreviewPhoto(item, -1)"
                            >
                              <ChevronLeft class="h-4 w-4" />
                            </button>
                            <button
                              class="grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white disabled:opacity-30"
                              title="Chuyển ảnh sang phải"
                              type="button"
                              :disabled="previewPhotoOrder(item) === previewPhotos.length - 1"
                              @click="movePreviewPhoto(item, 1)"
                            >
                              <ChevronRight class="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <p class="text-sm font-extrabold text-zinc-700 dark:text-zinc-200">Thêm vào bài viết</p>
                    <div class="inline-flex items-center gap-1">
                    <button
                      v-if="!isFacebookVideoMode"
                      :class="[
                        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40',
                        'text-emerald-500 hover:bg-white dark:hover:bg-zinc-800'
                      ]"
                      title="Thêm ảnh"
                      type="button"
                      :disabled="mediaUploading || post.media.length >= platformMaxPhotos"
                      @click="setFacebookPostType('imageText'); mediaInput?.click()"
                    >
                      <Loader2 v-if="mediaUploading" class="h-4 w-4 animate-spin" />
                      <Image v-else class="h-4 w-4" />
                      Ảnh
                    </button>
                    <button
                      v-if="isFacebookVideoMode"
                      :class="[
                        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40',
                        'text-emerald-500 hover:bg-white dark:hover:bg-zinc-800'
                      ]"
                      title="Thêm video"
                      type="button"
                      :disabled="mediaUploading || uploadedVideoCount >= 1"
                      @click="setFacebookPostType('video'); mediaInput?.click()"
                    >
                      <Video class="h-4 w-4" />
                      Video
                    </button>
                    <div class="relative">
                      <button
                        class="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold text-orange-500 transition hover:bg-white hover:text-orange-600 dark:hover:bg-zinc-800"
                        title="Chọn icon cảm xúc"
                        type="button"
                        @click="showEmojiPicker = !showEmojiPicker"
                      >
                        ☺
                        Cảm xúc
                      </button>
                      <div
                        v-if="showEmojiPicker"
                        class="absolute bottom-full right-0 z-50 mb-2 w-[330px] max-w-[calc(100vw-3rem)] rounded-2xl border border-zinc-700 bg-zinc-900 p-3 text-white shadow-2xl"
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
                    </div>
                  </div>
                  <button
                    v-if="!post.media.length && isFacebookVideoMode"
                    class="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 px-4 py-5 text-left transition hover:border-emerald-400 hover:bg-emerald-500/5 dark:border-zinc-700"
                    type="button"
                    :disabled="mediaUploading"
                    @click="mediaInput?.click()"
                  >
                    <span class="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                      <Loader2 v-if="mediaUploading" class="h-5 w-5 animate-spin" />
                      <Video v-else-if="isFacebookVideoMode" class="h-5 w-5" />
                      <Image v-else class="h-5 w-5" />
                    </span>
                    <span>
                      <span class="block font-black">{{ isFacebookVideoMode ? 'Chọn video' : 'Chọn ảnh' }}</span>
                      <span class="mt-1 block text-xs text-zinc-500">
                        {{ isFacebookVideoMode ? 'MP4, MOV, WebM hoặc 3GP · tối đa 100MB' : `Tối đa ${platformMaxPhotos} ảnh` }}
                      </span>
                    </span>
                  </button>
                  </div>
              </div>

              <input ref="mediaInput" class="hidden" type="file" :accept="mediaInputAccept" :multiple="mediaInputMultiple" @change="addMedia" />

              <div v-if="composerTab === 'preview'" class="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div class="flex items-center gap-3">
                  <div class="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-sky-600 text-sm font-extrabold text-white">
                    {{ accountInitial }}
                  </div>
                  <div>
                    <p class="font-extrabold">{{ selectedAccount?.displayName || `${selectedPlatform.label} profile` }}</p>
                    <p class="text-xs text-zinc-500">Xem trước bài đăng · {{ characterCount }}/5000 ký tự</p>
                  </div>
                </div>
                <div v-if="finalPostText" class="space-y-3 text-lg leading-8">
                  <p v-if="previewCaption" class="whitespace-pre-wrap">{{ previewCaption }}</p>
                </div>
                <p v-else class="text-lg leading-8 text-zinc-500">Chưa có nội dung để xem trước.</p>
                <div v-if="previewPhotos.length" :class="previewGalleryClass">
                  <div
                    v-for="(item, index) in facebookPreviewPhotos"
                    :key="`preview-${item.id}`"
                    :class="['overflow-hidden bg-zinc-950', previewPhotoClass(index)]"
                  >
                    <img :src="item.url" :alt="item.name" :class="previewImageClass()" />
                  </div>
                </div>
                <div v-if="selectedVideo" class="overflow-hidden rounded-lg bg-black">
                  <video :src="selectedVideo.url" class="max-h-[34rem] w-full object-contain" controls playsinline></video>
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
                    <p class="font-extrabold">Bài đã lưu</p>
                    <p class="mt-1 text-sm text-zinc-500">Quản lý bài nháp và lịch đăng để tiếp tục chỉnh sửa khi cần.</p>
                  </div>
                  <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {{ drafts.length }} mục
                  </span>
                </div>
                <div class="app-scrollbar max-h-72 space-y-2 overflow-auto pr-1">
                  <article v-for="draft in drafts" :key="draft.id" class="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate font-extrabold">{{ draft.title }}</p>
                        <p class="mt-1 line-clamp-2 text-zinc-500">{{ draft.text }}</p>
                        <p class="mt-2 text-xs text-zinc-500">
                          {{ draft.status === 'scheduled' ? `Đăng lúc ${formatDate(draft.scheduledFor)}` : `Nháp · ${formatDate(draft.createdAt)}` }} · {{ draft.mediaCount }} ảnh
                        </p>
                        <p v-if="draft.status === 'scheduled'" class="mt-1 truncate text-xs text-zinc-500">
                          {{ draft.targetAccountLabel || 'Chưa có profile mục tiêu' }}
                        </p>
                      </div>
                      <div class="flex shrink-0 items-center gap-2">
                        <button class="btn-soft h-9 px-3 text-xs" type="button" @click="loadDraft(draft)">
                          Tải
                        </button>
                        <button
                          class="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                          title="Xóa nháp"
                          type="button"
                          @click="deleteDraft(draft.id)"
                        >
                          <Trash2 class="h-4 w-4" />
                        </button>
                      </div>
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
          <div
            :class="[
              'overflow-hidden rounded-2xl border shadow-sm',
              readinessTone === 'ok' ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/10' : readinessTone === 'warn' ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/10' : readinessTone === 'run' ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/10' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/20'
            ]"
          >
            <div class="border-b border-black/5 p-4 dark:border-white/10">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Publish readiness</p>
                  <h3 class="mt-1 text-xl font-black">{{ readinessLabel }}</h3>
                </div>
                <span
                  :class="[
                    'shrink-0 rounded-full px-3 py-1 text-xs font-extrabold uppercase',
                    readinessTone === 'ok' ? 'bg-emerald-100 text-emerald-700' : readinessTone === 'warn' ? 'bg-amber-100 text-amber-700' : readinessTone === 'run' ? 'bg-sky-100 text-sky-700' : 'bg-zinc-100 text-zinc-700'
                  ]"
                >
                  {{ readinessScore }}%
                </span>
              </div>
              <p class="mt-2 text-sm leading-5 text-zinc-500">{{ readinessSummary }}</p>
              <div class="mt-4 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  :class="[
                    'h-full rounded-full transition-all',
                    blockedPreflightItems.length ? 'bg-amber-400' : 'bg-emerald-500'
                  ]"
                  :style="{ width: `${readinessScore}%` }"
                ></div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800">
              <div
                v-for="item in preflightItems"
                :key="item.label"
                class="bg-white p-3 text-sm dark:bg-zinc-950"
              >
                <div class="mb-2 flex items-center justify-between gap-2">
                  <p class="truncate text-xs font-extrabold uppercase tracking-wide text-zinc-500">{{ item.label }}</p>
                  <CheckCircle2 v-if="item.ok" class="h-4 w-4 shrink-0 text-emerald-500" />
                  <AlertTriangle v-else class="h-4 w-4 shrink-0 text-amber-500" />
                </div>
                <p class="line-clamp-2 text-xs leading-5 text-zinc-500">{{ item.detail }}</p>
              </div>
            </div>
          </div>

          <div v-if="professionalActions.length" class="rounded-2xl border border-zinc-200 p-4 shadow-sm dark:border-zinc-800">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Pre-publish tasks</p>
                <h3 class="mt-1 font-extrabold">Việc cần làm</h3>
              </div>
              <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {{ professionalActions.length }} mục
              </span>
            </div>
            <div class="space-y-2">
              <div
                v-for="action in professionalActions"
                :key="action.title"
                class="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span
                  :class="[
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black',
                    action.tone === 'required' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  ]"
                >
                  {{ action.tone === 'required' ? '!' : 'i' }}
                </span>
                <div class="min-w-0">
                  <p class="font-extrabold">{{ action.title }}</p>
                  <p class="mt-1 text-xs leading-5 text-zinc-500">{{ action.detail }}</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="queueItems.length" class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Tiến trình đăng</p>
                <h3 class="mt-1 font-extrabold">{{ queueStats.done }} xong · {{ queueStats.review }} cần kiểm tra · {{ queueStats.failed }} lỗi</h3>
              </div>
              <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {{ queueStats.total }} lượt
              </span>
            </div>
            <div class="mb-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
              <div class="h-full rounded-full bg-sky-500 transition-all" :style="{ width: `${queueProgressPercent}%` }"></div>
            </div>
            <div class="app-scrollbar max-h-64 space-y-2 overflow-auto pr-1">
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

          <div v-if="composerScreenshotSrc && postResult?.screenshotVerified" class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            <div class="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
              <span class="text-xs font-extrabold uppercase tracking-wide text-zinc-400">Bài đăng đã đối chiếu</span>
              <span class="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-extrabold uppercase text-emerald-400">Đúng nội dung</span>
            </div>
            <div class="grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400">
              <img :src="composerScreenshotSrc" alt="Ảnh bài đăng đã được đối chiếu nội dung" class="h-full w-full object-contain" />
            </div>
          </div>

          <div v-else-if="composerScreenshotSrc" class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            <div class="border-b border-zinc-800 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-zinc-400">Ảnh trạng thái Facebook</div>
            <div class="grid aspect-[9/16] w-full place-items-center text-sm text-zinc-400">
              <img :src="composerScreenshotSrc" alt="Ảnh trạng thái Facebook" class="h-full w-full object-contain" />
            </div>
          </div>

          <div
            v-else-if="postResult?.submitVerified && postResult?.screenshotVerified === false"
            class="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            Bài đã đăng thành công nhưng Facebook chưa đồng bộ bài mới lên feed để chụp ảnh xác minh. Hệ thống không hiển thị ảnh bài cũ để tránh gây nhầm lẫn.
          </div>

          <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="mb-3 flex items-center gap-2">
              <Terminal class="h-4 w-4 text-zinc-500" />
              <h3 class="font-extrabold">Kết quả đăng gần nhất</h3>
            </div>
            <div class="space-y-2">
              <article v-for="log in recentPostRuns" :key="log._id" class="rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <p class="min-w-0 flex-1 font-bold leading-5">{{ formatPostRun(log).title }}</p>
                  <span :class="['shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase leading-none', log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
                    {{ log.level === 'error' ? 'Lỗi' : log.level === 'warn' ? 'Cần kiểm tra' : 'Ổn' }}
                  </span>
                </div>
                <p class="mt-1 line-clamp-2 text-zinc-500">{{ formatPostRun(log).detail }}</p>
                <p class="mt-2 text-xs text-zinc-500">{{ formatDate(log.createdAt) }}</p>
              </article>
              <p v-if="!recentPostRuns.length" class="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                Chưa có kết quả đăng {{ selectedPlatform.label }}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </BaseCard>

    <BaseCard>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-start gap-3">
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            <Terminal class="h-5 w-5" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-extrabold">Nhật ký kỹ thuật</h3>
              <span class="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-extrabold uppercase text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                Debug
              </span>
            </div>
            <p class="mt-1 text-sm text-zinc-500">
              Ẩn mặc định để không làm rối màn hình vận hành. Mở khi cần kiểm tra lỗi automation, ADB hoặc {{ selectedPlatform.label }} UI.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            {{ technicalLogStats.total }} log
          </span>
          <span v-if="technicalLogStats.warnings" class="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            {{ technicalLogStats.warnings }} warn
          </span>
          <span v-if="technicalLogStats.errors" class="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
            {{ technicalLogStats.errors }} error
          </span>
          <button class="btn-soft h-9 px-3 text-sm" type="button" @click="technicalLogsOpen = !technicalLogsOpen">
            <Eye v-if="!technicalLogsOpen" class="h-4 w-4" />
            <XCircle v-else class="h-4 w-4" />
            {{ technicalLogsOpen ? 'Ẩn nhật ký' : 'Mở nhật ký' }}
          </button>
        </div>
      </div>

      <div v-if="technicalLogsOpen" class="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-bold text-zinc-500">
            Hiển thị {{ technicalLogStats.shown }} log mới nhất trong {{ technicalLogStats.total }} log.
          </p>
          <button class="btn-soft h-8 px-3 text-xs" :disabled="loading" type="button" @click="load">
            <RefreshCcw class="h-3.5 w-3.5" />
            Làm mới log
          </button>
        </div>
        <div class="app-scrollbar max-h-80 space-y-2 overflow-auto pr-1">
          <article v-for="log in technicalLogs" :key="log._id" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="truncate font-bold">{{ formatLog(log) }} - {{ log.action }}</p>
              <span :class="['rounded-full px-2 py-1 text-xs font-bold uppercase', log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
                {{ log.level }}
              </span>
            </div>
            <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{{ log.message }}</p>
            <p class="mt-2 text-xs text-zinc-500">{{ formatDate(log.createdAt) }}</p>
          </article>
          <p v-if="!technicalLogs.length" class="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
            Chưa có log kỹ thuật.
          </p>
        </div>
      </div>
    </BaseCard>
    </div>
  </div>
</template>
