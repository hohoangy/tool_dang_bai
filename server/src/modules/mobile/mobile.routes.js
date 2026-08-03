import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../../utils/api-error.js';
import { MobileAccount } from '../../models/mobile-account.model.js';
import { MobileAccountLog } from '../../models/mobile-account-log.model.js';
import {
  captureScreenshot,
  checkInstagramHealth,
  closeAccountSession,
  getAccountPublishReadiness,
  getAccountRuntimeStatus,
  openAccountApp,
  openLdPlayer,
  probeDevice,
  recoverAccountLdPlayer,
  remoteKey,
  remoteSwipe,
  remoteTap,
  remoteText
} from '../../services/mobile/device-automation.service.js';
import {
  publishFacebookPostViaMobile
} from '../../services/mobile/facebook-automation.service.js';
import {
  publishInstagramPostViaMobile
} from '../../services/mobile/instagram-automation.service.js';
import {
  cancelMobileLoginJob,
  createMobileLoginJob,
  encryptSecret,
  getMobileLoginJob,
  runMobileLogin,
  sanitizeAccount
} from '../../services/mobile/login-automation.service.js';
import { uniqueActiveLdPlayerAccounts } from '../../services/mobile/ldplayer-account.service.js';

export const mobileRoutes = Router();

export function classifyMobilePublishError(error, platform, context = {}) {
  const rawMessage = String(error?.message || 'Workflow trả lỗi chưa xác định.');
  const normalized = rawMessage
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const isFacebook = platform === 'facebook';
  const prefix = isFacebook ? 'facebook_post' : 'instagram_post';
  const mediaCount = Number(context.imageCount || 0) + Number(context.videoCount || 0);

  const match = (...phrases) => phrases.some((phrase) => normalized.includes(phrase));
  if (!isFacebook && match(
    'pre_submit_gate_failed',
    'caption_not_verified',
    'caption_clear_failed',
    'caption_missing_before_submit',
    'dry_run_submit_risk_on_next',
    'dry_run_next_not_advancing',
    'next_text_missing_stuck',
    'next_fallback_stuck'
  )) {
    return {
      code: 'INSTAGRAM_PRE_SUBMIT_BLOCKED',
      category: 'pre_submit_gate',
      retryable: true,
      action: 'instagram_post_pre_submit_gate_failed',
      userMessage: 'Instagram chưa đủ điều kiện an toàn để bấm Share.',
      recoveryHint: 'Tool chưa bấm Share. Kiểm tra screenshot, caption/media và trạng thái composer rồi chạy lại profile này nếu cần.'
    };
  }
  if (!isFacebook && match(
    'still_on_share_screen',
    'no_confirmation_after_share',
    'submit_unverified',
    'da bam share',
    'da bam dang',
    'chua xac nhan app nhan bai',
    'chua thay tin hieu xac nhan',
    'van con o man share',
    'van o man soan bai'
  )) {
    return {
      code: `${platform.toUpperCase()}_POST_SUBMIT_UNVERIFIED`,
      category: 'post_submit_unverified',
      retryable: false,
      action: `${prefix}_failed_post_submit_unverified`,
      userMessage: 'Instagram đã tới bước gửi bài nhưng chưa xác minh được kết quả.',
      recoveryHint: 'Không tự đăng lại để tránh trùng bài. Hãy kiểm tra app/screenshot gần nhất rồi quyết định chạy lại thủ công nếu cần.'
    };
  }
  if (isFacebook && match(
    'published_post_evidence_pending',
    'no_published_post_evidence',
    'submit_unverified',
    'da bam dang',
    'da toi buoc dang',
    'chua xac nhan facebook da nhan bai',
    'chua tim thay dung bai moi',
    'facebook da roi man soan bai',
    'khong tu chay lai de tranh trung bai'
  )) {
    return {
      code: 'FACEBOOK_POST_SUBMIT_UNVERIFIED',
      category: 'post_submit_unverified',
      retryable: false,
      action: 'facebook_post_failed_post_submit_unverified',
      userMessage: 'Facebook đã tới bước Đăng nhưng chưa xác minh được kết quả.',
      recoveryHint: 'Không tự đăng lại để tránh trùng bài. Hãy kiểm tra app/screenshot gần nhất rồi quyết định chạy lại thủ công nếu cần.'
    };
  }
  if (match('checkpoint', 'dang nhap', 'login', 'session expired', 'confirm your account')) {
    return {
      code: `${platform.toUpperCase()}_AUTH_REQUIRED`,
      category: 'auth_required',
      retryable: false,
      action: `${prefix}_failed_auth_required`,
      userMessage: `${platform === 'facebook' ? 'Facebook' : 'Instagram'} cần đăng nhập hoặc xác minh tài khoản trước khi đăng tiếp.`,
      recoveryHint: 'Mở app trong đúng LDPlayer, xử lý login/checkpoint thủ công rồi bấm kiểm tra lại.'
    };
  }
  if (match(
    'ldplayer dang chay nhung chua mo cong adb',
    'ldplayer đang chạy nhưng chưa mở cổng adb',
    'ldplayer_adb_port_closed',
    'cong adb localhost',
    'cổng adb localhost',
    'actively refused it',
    '10061'
  )) {
    return {
      code: 'LDPLAYER_ADB_BRIDGE_UNAVAILABLE',
      category: 'ldplayer_adb_preflight',
      retryable: false,
      action: `${prefix}_failed_ld_adb_bridge`,
      userMessage: 'LDPlayer đã chạy nhưng ADB bridge chưa mở nên tool không thể điều khiển app.',
      recoveryHint: 'Mở LDPlayer thủ công đến màn Home, kiểm tra ADB Debugging trong LDPlayer, rồi chạy lại khi adb devices thấy emulator/device.'
    };
  }
  if (match('adb', 'device is not ready', 'offline', 'no_uiautomator_nodes', 'system ui', 'khong phan hoi', 'khong san sang', 'not responding')) {
    return {
      code: 'LDPLAYER_UNSTABLE',
      category: 'ldplayer_unstable',
      retryable: true,
      action: `${prefix}_failed_ld_unstable`,
      userMessage: 'LDPlayer hoặc ADB chưa ổn định nên tool đã dừng để tránh đăng sai.',
      recoveryHint: 'Restart LDPlayer/ADB, chờ app mở ổn định rồi chạy lại. Nếu lỗi lặp lại, chuyển profile này sang trạng thái tạm nghỉ.'
    };
  }
  if (isFacebook && match('ghi nhan 0/', 'ghi nhan', 'selection_incomplete', 'chon anh', 'thu vien anh', 'khong mo duoc thu vien')) {
    return {
      code: 'FACEBOOK_GALLERY_SELECTION_UNSTABLE',
      category: 'media_selection',
      retryable: true,
      action: 'facebook_post_failed_gallery_selection',
      userMessage: `Facebook gallery chưa xác nhận đủ ${mediaCount || 'media'} đã chọn, tool dừng để tránh bấm lặp.`,
      recoveryHint: 'Chạy lại sau khi Facebook/LDPlayer ổn định. Nếu đang đăng nhiều ảnh, thử 1 ảnh để kiểm tra gallery trước.'
    };
  }
  if (isFacebook && match('khong gan duoc anh', 'gắn được ảnh', 'gan duoc anh', 'image_attach_failed', 'quyen thu vien', 'file phuong tien')) {
    return {
      code: 'FACEBOOK_MEDIA_ATTACH_FAILED',
      category: 'media_attach',
      retryable: true,
      action: 'facebook_post_failed_media_attach',
      userMessage: 'Facebook chưa xác nhận media đã gắn vào composer.',
      recoveryHint: 'Kiểm tra quyền ảnh/video của Facebook trong LDPlayer và thử lại với media nhỏ hơn.'
    };
  }
  if (match('khong dua duoc', 'state machine', 'khong toi duoc', 'chua toi duoc', 'unknown_state')) {
    return {
      code: `${platform.toUpperCase()}_UI_STATE_UNSTABLE`,
      category: 'ui_state_unstable',
      retryable: true,
      action: `${prefix}_failed_ui_state`,
      userMessage: `${platform === 'facebook' ? 'Facebook' : 'Instagram'} đổi màn hình hoặc phản hồi chậm, tool chưa nhận diện được trạng thái an toàn.`,
      recoveryHint: 'Đưa app về Home, đóng popup nếu có, rồi chạy lại. Nếu lỗi lặp lại, restart LDPlayer.'
    };
  }

  return {
    code: `${platform.toUpperCase()}_PUBLISH_FAILED`,
    category: 'publish_failed',
    retryable: true,
    action: `${prefix}_failed`,
    userMessage: rawMessage,
    recoveryHint: 'Xem nhật ký kỹ thuật và screenshot gần nhất để xác định bước dừng.'
  };
}

function throwClassifiedPublishError(error, classification, statusCode = 400) {
  const resolvedStatusCode = classification.category === 'ldplayer_unstable'
    ? 503
    : classification.category === 'auth_required'
      ? 409
      : statusCode;
  const apiError = new ApiError(resolvedStatusCode, classification.userMessage, {
    ...classification,
    originalMessage: String(error?.message || '')
  });
  apiError.code = classification.code;
  throw apiError;
}

const accountSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'x', 'youtube', 'tiktok', 'other']).default('other'),
  displayName: z.string().min(2),
  accountHandle: z.string().optional().or(z.literal('')),
  instanceName: z.string().min(1),
  adbHost: z.string().optional().or(z.literal('')),
  deviceId: z.string().optional().or(z.literal('')),
  status: z.enum(['ready', 'login_required', 'logging_in', 'connected', 'checkpoint', 'error', 'paused']).default('ready'),
  notes: z.string().optional().or(z.literal('')),
  metadata: z.object({
    appPackage: z.string().optional().or(z.literal('')),
    username: z.string().optional().or(z.literal('')),
    password: z.string().optional().or(z.literal('')),
    loginSteps: z.object({
      usernameTap: z.object({ x: z.number(), y: z.number() }).optional(),
      passwordTap: z.object({ x: z.number(), y: z.number() }).optional(),
      submitTap: z.object({ x: z.number(), y: z.number() }).optional()
    }).optional()
  }).optional()
});

const runSchema = z.object({
  accountIds: z.array(z.string()).min(1).max(20).optional(),
  appPackage: z.string().optional().or(z.literal('')),
  username: z.string().optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
  loginSteps: z.object({
    usernameTap: z.object({ x: z.number(), y: z.number() }).optional(),
    passwordTap: z.object({ x: z.number(), y: z.number() }).optional(),
    submitTap: z.object({ x: z.number(), y: z.number() }).optional()
  }).optional()
});

const batchRunSchema = runSchema.extend({
  accountIds: z.array(z.string()).min(1).max(20),
  retries: z.number().int().min(0).max(3).default(1)
});

const tapSchema = z.object({ x: z.number(), y: z.number() });
const swipeSchema = z.object({
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number(),
  toY: z.number(),
  duration: z.number().int().min(50).max(3000).default(350)
});
const textSchema = z.object({ text: z.string().min(1).max(500) });
const keySchema = z.object({ key: z.enum(['back', 'home', 'enter', 'recent', 'power']) });
const openAppSchema = z.object({ appPackage: z.string().optional().or(z.literal('')) });
const defaultMobileAccount = {
  platform: 'facebook',
  displayName: 'Facebook Account 01',
  accountHandle: '',
  instanceName: 'LDPlayer',
  adbHost: '',
  deviceId: 'emulator-5554',
  status: 'ready',
  notes: 'Cấu hình mặc định để test đăng Facebook qua LDPlayer.',
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

const facebookPostSchema = z.object({
  text: z.string().min(1).max(5000),
  appPackage: z.string().optional().or(z.literal('')),
  autoSubmit: z.boolean().default(false),
  textInputMode: z.enum(['stable', 'natural']).default('stable'),
  waitAfterSubmitMs: z.number().int().min(0).max(180_000).default(0),
  images: z.array(z.object({
    url: z.string().url(),
    name: z.string().optional(),
    mimeType: z.string().startsWith('image/').optional(),
    size: z.number().int().positive().max(5 * 1024 * 1024).optional()
  })).max(4).default([]),
  videos: z.array(z.object({
    url: z.string().url(),
    name: z.string().optional(),
    mimeType: z.string().startsWith('video/').optional(),
    size: z.number().int().positive().max(100 * 1024 * 1024).optional()
  })).max(1).default([]),
  composerTap: z.object({ x: z.number(), y: z.number() }).optional(),
  submitTap: z.object({ x: z.number(), y: z.number() }).optional()
});
const instagramPostSchema = z.object({
  text: z.string().max(2200).default(''),
  appPackage: z.string().optional().or(z.literal('')),
  autoSubmit: z.boolean().default(false),
  cleanupAfterDryRun: z.boolean().default(false),
  waitAfterSubmitMs: z.number().int().min(0).max(60_000).default(0),
  images: z.array(z.object({
    url: z.string().url(),
    name: z.string().optional(),
    mimeType: z.string().startsWith('image/').optional(),
    size: z.number().int().positive().max(5 * 1024 * 1024).optional()
  })).min(1).max(10)
});

mobileRoutes.get('/accounts', requireAuth, asyncHandler(async (req, res) => {
  let accounts = await MobileAccount.find({ userId: req.user._id }).sort({ updatedAt: -1 });
  accounts = uniqueActiveLdPlayerAccounts(accounts);
  if (!accounts.length) {
    const metadata = normalizeMetadata(defaultMobileAccount.metadata);
    const account = await MobileAccount.create({
      ...defaultMobileAccount,
      metadata,
      userId: req.user._id,
      accountHandle: null,
      deviceId: null
    });
    await writeLog(req.user._id, account._id, 'info', 'create_default_account', 'Đã tạo cấu hình LDPlayer mặc định.', {
      platform: account.platform,
      instanceName: account.instanceName,
      adbHost: account.adbHost
    });
    accounts = [account];
  }
  let logs = [];
  try {
    logs = await MobileAccountLog.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(120);
  } catch (error) {
    console.warn('mobile account logs skipped:', error.message);
  }
  res.json({ accounts: accounts.map(sanitizeAccount), logs });
}));

mobileRoutes.post('/accounts', requireAuth, asyncHandler(async (req, res) => {
  const input = accountSchema.parse(req.body);
  const metadata = normalizeMetadata(input.metadata);
  const account = await MobileAccount.create({
    ...input,
    metadata,
    userId: req.user._id,
    accountHandle: input.accountHandle?.trim() || null,
    adbHost: input.adbHost?.trim() || null,
    deviceId: input.deviceId?.trim() || null,
    notes: input.notes?.trim() || null
  });
  await writeLog(req.user._id, account._id, 'info', 'create_account', `Đã thêm nick ${account.displayName}.`, {
    platform: account.platform,
    instanceName: account.instanceName
  });
  res.status(201).json({ account: sanitizeAccount(account) });
}));

mobileRoutes.patch('/accounts/:id', requireAuth, asyncHandler(async (req, res) => {
  const input = accountSchema.partial().parse(req.body);
  const account = await findAccount(req.params.id, req.user._id);
  const nextMetadata = input.metadata ? { ...(account.metadata || {}), ...normalizeMetadata(input.metadata) } : account.metadata;
  Object.assign(account, {
    ...input,
    metadata: nextMetadata,
    accountHandle: input.accountHandle === '' ? null : input.accountHandle ?? account.accountHandle,
    adbHost: input.adbHost === '' ? null : input.adbHost ?? account.adbHost,
    deviceId: input.deviceId === '' ? null : input.deviceId ?? account.deviceId,
    notes: input.notes === '' ? null : input.notes ?? account.notes
  });
  await account.save();
  await writeLog(req.user._id, account._id, 'info', 'update_account', `Đã cập nhật nick ${account.displayName}.`);
  res.json({ account: sanitizeAccount(account) });
}));

mobileRoutes.delete('/accounts/:id', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  await writeLog(req.user._id, account._id, 'warn', 'delete_account', `Đã xóa nick ${account.displayName}.`);
  await account.deleteOne();
  res.status(204).send();
}));

mobileRoutes.post('/accounts/:id/probe', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const result = await probeDevice(account, req.user._id);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.get('/accounts/:id/runtime-status', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const status = await getAccountRuntimeStatus(account, req.query.appPackage);
  res.json({ status });
}));

mobileRoutes.get('/accounts/:id/readiness', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const readiness = await getAccountPublishReadiness(account, req.user._id, req.query.appPackage, {
    deep: req.query.deep !== 'false'
  });
  res.json({ readiness });
}));

mobileRoutes.post('/accounts/:id/instagram/health', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  if (account.platform !== 'instagram') {
    throw new ApiError(400, 'Profile này không phải Instagram.');
  }
  const result = await checkInstagramHealth(account, req.user._id, {
    appPackage: req.body?.appPackage || 'com.instagram.android'
  });
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.post('/accounts/:id/remote/launch', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const result = await openLdPlayer(account, req.user._id);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.post('/accounts/:id/remote/recover-ld', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const result = await recoverAccountLdPlayer(account, req.user._id);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.post('/accounts/:id/remote/open-app', requireAuth, asyncHandler(async (req, res) => {
  const input = openAppSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await openAccountApp(account, req.user._id, input.appPackage);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.post('/accounts/:id/remote/close-session', requireAuth, asyncHandler(async (req, res) => {
  const input = openAppSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await closeAccountSession(account, req.user._id, input.appPackage);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.get('/accounts/:id/remote/screenshot', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const screenshot = await captureScreenshot(account, req.user._id, 'remote_view');
  res.json({ screenshot });
}));

mobileRoutes.post('/accounts/:id/remote/tap', requireAuth, asyncHandler(async (req, res) => {
  const input = tapSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteTap(account, req.user._id, input.x, input.y);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/remote/swipe', requireAuth, asyncHandler(async (req, res) => {
  const input = swipeSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteSwipe(account, req.user._id, input.fromX, input.fromY, input.toX, input.toY, input.duration);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/remote/text', requireAuth, asyncHandler(async (req, res) => {
  const input = textSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteText(account, req.user._id, input.text);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/remote/key', requireAuth, asyncHandler(async (req, res) => {
  const input = keySchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteKey(account, req.user._id, input.key);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/facebook/post', requireAuth, asyncHandler(async (req, res) => {
  const input = facebookPostSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  if (account.platform !== 'facebook') {
    throw new ApiError(400, 'Profile này không phải Facebook. Hãy chọn đúng profile Facebook.');
  }
  const platformInput = {
    ...input,
    appPackage: 'com.facebook.katana',
    images: Array.from(new Map(input.images.map((image) => [image.url, image])).values())
  };
  try {
    const result = await publishFacebookPostViaMobile(account, req.user._id, platformInput);
    res.json({ result });
  } catch (error) {
    const imageCount = platformInput.images?.length || 0;
    const videoCount = platformInput.videos?.length || 0;
    const classification = classifyMobilePublishError(error, 'facebook', { imageCount, videoCount });
    await writeLog(req.user._id, account._id, 'error', classification.action, classification.userMessage, {
      autoSubmit: platformInput.autoSubmit,
      appPackage: platformInput.appPackage,
      imageCount,
      videoCount,
      code: classification.code,
      category: classification.category,
      retryable: classification.retryable,
      recoveryHint: classification.recoveryHint,
      originalMessage: error.message
    });
    throwClassifiedPublishError(error, classification);
  }
}));

mobileRoutes.post('/accounts/:id/instagram/post', requireAuth, asyncHandler(async (req, res) => {
  const input = instagramPostSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  if (account.platform !== 'instagram') {
    throw new ApiError(400, 'Profile này không phải Instagram. Hãy chọn đúng profile Instagram.');
  }
  const platformInput = { ...input, appPackage: 'com.instagram.android' };
  try {
    const result = await publishInstagramPostViaMobile(account, req.user._id, platformInput);
    res.json({ result });
  } catch (error) {
    const imageCount = platformInput.images?.length || 0;
    const classification = classifyMobilePublishError(error, 'instagram', { imageCount });
    await writeLog(req.user._id, account._id, 'error', classification.action, classification.userMessage, {
      autoSubmit: platformInput.autoSubmit,
      appPackage: platformInput.appPackage,
      postType: imageCount > 1 ? 'carousel' : 'singlePhoto',
      imageCount,
      code: classification.code,
      category: classification.category,
      retryable: classification.retryable,
      recoveryHint: classification.recoveryHint,
      originalMessage: error.message
    });
    throwClassifiedPublishError(error, classification);
  }
}));

mobileRoutes.post('/accounts/:id/run-login', requireAuth, asyncHandler(async (req, res) => {
  const input = runSchema.omit({ accountIds: true }).parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  try {
    const result = await runMobileLogin(account, req.user._id, normalizeMetadata(input));
    res.json({ account: sanitizeAccount(result.account), steps: result.steps });
  } catch (error) {
    account.status = 'error';
    await account.save();
    await writeLog(req.user._id, account._id, 'error', 'login_failed', error.message);
    throw new ApiError(400, error.message);
  }
}));

mobileRoutes.post('/batch/run-login', requireAuth, asyncHandler(async (req, res) => {
  const input = batchRunSchema.parse(req.body || {});
  const job = createMobileLoginJob({
    userId: req.user._id,
    accountIds: input.accountIds,
    override: normalizeMetadata(input),
    retries: input.retries
  });
  res.status(202).json({ job });
}));

mobileRoutes.get('/jobs/:id', requireAuth, asyncHandler(async (req, res) => {
  const job = getMobileLoginJob(req.params.id, req.user._id);
  if (!job) throw new ApiError(404, 'Job not found.');
  res.json({ job });
}));

mobileRoutes.post('/jobs/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const job = cancelMobileLoginJob(req.params.id, req.user._id);
  if (!job) throw new ApiError(404, 'Job not found.');
  res.json({ job });
}));

async function findAccount(id, userId) {
  const account = await MobileAccount.findOne({ _id: id, userId });
  if (!account) throw new ApiError(404, 'Mobile account not found.');
  return account;
}

function normalizeMetadata(metadata = {}) {
  const output = {};
  if (metadata.appPackage) output.appPackage = metadata.appPackage.trim();
  if (metadata.username) output.username = metadata.username.trim();
  if (metadata.password) output.password = encryptSecret(metadata.password);
  if (metadata.loginSteps) output.loginSteps = metadata.loginSteps;
  return output;
}

function writeLog(userId, accountId, level, action, message, metadata = {}) {
  return MobileAccountLog.create({ userId, accountId, level, action, message, metadata });
}
