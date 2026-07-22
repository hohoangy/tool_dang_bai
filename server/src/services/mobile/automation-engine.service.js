import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { getLocalUploadPath } from '../../utils/media-file.js';
import { runBinaryCommand, runCommand } from './mobile-command.service.js';
import { decryptSecret } from './mobile-secret.service.js';
import { writeMobileLog as writeLog } from './mobile-log.service.js';

const localImageHashCache = new Map();
const instagramPermissionCache = new Map();
const directUiDumpSupport = new Map();
const uiDumpCache = new Map();
const uiDumpInFlight = new Map();
const openAppInFlight = new Map();
const instagramPublishQueues = new Map();
const accountRuntimeTargets = new Map();
const androidUiReadyCache = new Map();
const androidStorageReadyCache = new Map();
const instagramDisplaySizeCache = new Map();
const instagramSharePrewarmCache = new Map();
const instagramShareMethodCache = new Map();
const facebookMediaRoot = '/sdcard/Pictures/SocialPilot';
const facebookMediaCacheRoot = '/sdcard/Pictures/SocialPilotCache';
const instagramPermissionCacheTtlMs = 10 * 60 * 1000;
const uiDumpCacheTtlMs = 350;
const androidUiReadyCacheTtlMs = 12_000;
const androidStorageReadyCacheTtlMs = 2 * 60 * 1000;
const instagramDisplaySizeCacheTtlMs = 10 * 60 * 1000;
const instagramSharePrewarmCacheTtlMs = 4 * 60 * 1000;
const instagramShareMethodCacheTtlMs = 10 * 60 * 1000;
const instagramFastSubmitProgressMs = 2_600;

const defaultPackages = {
  facebook: 'com.facebook.katana',
  instagram: 'com.instagram.android',
  x: 'com.twitter.android',
  youtube: 'com.google.android.youtube',
  tiktok: 'com.zhiliaoapp.musically',
  other: ''
};

const defaultLoginSteps = {
  usernameTap: { x: 540, y: 760 },
  passwordTap: { x: 540, y: 900 },
  submitTap: { x: 540, y: 1060 }
};

const defaultPostSteps = {
  composerTap: { x: 450, y: 218 }
};

const composerLabels = [
  "What's on your mind?",
  'Bạn đang nghĩ gì?',
  'Ban dang nghi gi?',
  'Create post',
  'Tạo bài viết'
];

const submitLabels = ['Đăng', 'Dang', 'Post', 'POST', 'Share', 'Publish'];
const facebookComposerNextLabels = ['Tiếp', 'Tiep', 'Next'];
const postedConfirmationLabels = [
  'Đã chia sẻ bài viết của bạn',
  'Da chia se bai viet cua ban',
  'Bài viết của bạn đã được chia sẻ',
  'Bai viet cua ban da duoc chia se',
  'Đã chia sẻ',
  'Da chia se',
  'Xem bài viết',
  'Xem bai viet',
  'Your post was shared',
  'View post'
];
const postingProgressLabels = [
  'Đang đăng',
  'Dang dang',
  'Đang chia sẻ',
  'Dang chia se',
  'Không đóng Facebook',
  'Khong dong Facebook',
  'Posting',
  "Don't close Facebook"
];
const closeMenuLabels = ['Đóng menu.', 'Dong menu.', 'Close menu'];
const facebookMenuLabels = [
  'Meta AI',
  'Saved',
  'Memories',
  'Marketplace',
  'Groups',
  'See more',
  'Help and support',
  'Settings and privacy',
  'Log out',
  'Public presence',
  'Also from Meta',
  'Đã lưu',
  'Da luu',
  'Kỷ niệm',
  'Ky niem',
  'Nhóm',
  'Nhom',
  'Xem thêm',
  'Xem them',
  'Trợ giúp và hỗ trợ',
  'Tro giup va ho tro',
  'Cài đặt và quyền riêng tư',
  'Cai dat va quyen rieng tu',
  'Đăng xuất',
  'Dang xuat'
];
const auxiliaryMenuLabels = ['Lựa chọn khác', 'Lua chon khac', 'Thêm nhãn AI', 'Them nhan AI'];
const doneLabels = ['Xong', 'Done'];
const galleryLabels = ['Thư viện', 'Ảnh/video', 'Photo/video', 'Gallery'];
const addMorePhotoLabels = [
  'Thêm ảnh/video khác từ thư viện.',
  'Them anh/video khac tu thu vien.',
  'Add more photos/videos from gallery.',
  'Add more photos or videos from gallery.',
  'Thêm file phương tiện',
  'Them file phuong tien',
  'Thêm phương tiện',
  'Them phuong tien',
  'Add media',
  'Add more media',
  'Thêm ảnh',
  'Thêm ảnh/video',
  'Add more',
  'Add photos',
  'Add photo'
];
const galleryPermissionLabels = ['Cho phép truy cập', 'Allow access'];
const galleryNextLabels = ['Tiếp', 'Next', 'Xong', 'Done'];
const selectedImageLabels = [
  'Ảnh chụp vào ngày',
  'Ảnh, mục',
  'chụp vào ngày',
  'Photo taken on',
  'Photo, item'
];
const attachedImageLabels = ['Gỡ ảnh', 'Chỉnh sửa ảnh', 'mở rộng ảnh', 'Remove photo', 'Edit photo', 'expand photo'];
const attachedVideoLabels = ['Video', 'Sửa video', 'Gỡ video', 'Edit video', 'Remove video'];
const attachedMediaLabels = [...attachedImageLabels, ...attachedVideoLabels];
const removeImageLabels = ['Gỡ ảnh', 'Remove photo'];
const closeComposerLabels = ['Đóng', 'Close'];
const discardPostLabels = ['Bỏ bài viết', 'Discard post'];
const shareFeedLabels = ['Feed', 'Share with Feed'];
const shareOnceLabels = ['JUST ONCE', 'Just once'];
const postTitleLabels = ['Bài viết mới', 'Bai viet moi', 'Create post', 'New post'];
const postDetailLabels = ['Chi tiết bài viết', 'Chi tiet bai viet', 'Post details'];
const facebookPostActionLabels = ['Thích', 'Thich', 'Like', 'Bình luận', 'Binh luan', 'Comment', 'Chia sẻ', 'Chia se', 'Share'];
const facebookCommentInputLabels = ['Viết bình luận', 'Viet binh luan', 'Write a comment', 'Comment as'];
const textEditorLabels = ['Thêm văn bản', 'Them van ban', 'Add text'];
const facebookFeelingPickerLabels = ['Bạn đang cảm thấy thế nào?', 'Ban dang cam thay the nao?', 'How are you feeling?'];
const facebookFeelingPickerTabLabels = ['Cảm xúc', 'Cam xuc', 'Hoạt động', 'Hoat dong', 'Feeling', 'Activity'];
const facebookMetaAiLabels = [
  'Meta AI',
  'Introducing Meta AI',
  'Ask Meta AI anything',
  'Ask questions, learn more about what you see',
  'AI terms',
  'Swipe down to see chat'
];
const loginBlockLabels = ['Log in', 'Đăng nhập', 'Dang nhap', 'Choose a way to confirm your account', 'Confirm your account', 'Session Expired'];
const rememberedAccountContinueLabels = ['Tiếp tục', 'Tiep tuc', 'Continue'];
const facebookHomeLabels = ['Trang chủ', 'Trang chu', 'Home'];
const systemAnrLabels = [
  "System UI isn't responding",
  'System UI is not responding',
  'Giao diện hệ thống không phản hồi',
  'System UI không phản hồi',
  "isn't responding",
  'is not responding',
  'không phản hồi',
  'khong phan hoi'
];
const systemAnrWaitLabels = ['Wait', 'Chờ', 'Đợi'];
const systemAnrCloseLabels = ['Close app', 'Đóng ứng dụng', 'Dong ung dung'];
const instagramNextLabels = ['Next', 'Tiếp', 'Tiep'];
const instagramShareLabels = ['Share', 'Chia sẻ', 'Chia se'];
const instagramCaptionLabels = ['Write a caption', 'Write a caption...', 'Add a caption', 'Caption', 'Viết chú thích', 'Viet chu thich', 'Chú thích', 'Chu thich'];
const instagramSharingProgressLabels = [
  'Sharing',
  'Uploading',
  'Posting',
  'Processing',
  'Preparing',
  'Đang chia sẻ',
  'Dang chia se',
  'Đang tải lên',
  'Dang tai len',
  'Đang đăng',
  'Dang dang'
];
const instagramSharedConfirmationLabels = [
  'Your post has been shared',
  'Post shared',
  'Shared',
  'Đã chia sẻ bài viết',
  'Da chia se bai viet',
  'Đã chia sẻ',
  'Da chia se'
];
const instagramDoneLabels = ['Done', 'Xong'];
const instagramBlockedLabels = ['Log in', 'Đăng nhập', 'Dang nhap', 'Sign up', 'Session Expired'];
const instagramHomeLabels = ['Instagram Home Feed', 'Home', 'Create'];
const instagramPreviewLabels = ['Preview'];
const instagramInfoDialogLabels = ['Sharing posts'];
const instagramDismissLabels = ['OK'];
const instagramResolverFeedLabels = ['Feed'];
const instagramResolverAlwaysLabels = ['ALWAYS', 'Always', 'LUÔN LUÔN', 'Luôn luôn', 'Luon luon'];
const instagramResolverOnceLabels = ['JUST ONCE', 'Just once', 'CHỈ MỘT LẦN', 'Chỉ một lần', 'Chi mot lan'];
const instagramResolverDialogLabels = ['Use a different app', 'Sử dụng ứng dụng khác', 'Su dung ung dung khac'];
const instagramCreateLabels = ['Create'];
const instagramPostDestinationLabels = ['Post', 'POST', 'Bài viết', 'Bai viet'];
const instagramNewPostLabels = ['New post', 'Bài viết mới', 'Bai viet moi'];
const instagramSelectMultipleLabels = ['Select multiple button', 'Select'];
const instagramDiscardLabels = ['Discard', 'Discard post', 'Discard edits', 'Bỏ', 'Bỏ bài viết', 'Bo bai viet', 'Hủy', 'Huy'];
const instagramAddMoreMediaLabels = [
  'Add More Photos and Videos',
  'Add more photos and videos',
  'Thêm ảnh và video'
];
const instagramFeedShareActivity = 'com.instagram.share.handleractivity.ShareHandlerActivity';

const defaultAdbHost = '127.0.0.1:5555';

function delay(ms) {
  if (env.mobileAutomation.commandMock) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postStepDelay(multiplier = 1) {
  return Math.round(Math.max(140, Math.min(env.mobileAutomation.stepDelayMs, 260)) * multiplier);
}

function actionDelay(action = '') {
  return /(?:facebook|instagram)_post/.test(action)
    ? postStepDelay()
    : env.mobileAutomation.stepDelayMs;
}

function createPerfTimer() {
  const startedAt = Date.now();
  let lastMarkAt = startedAt;
  const stages = [];
  return {
    mark(name, metadata = {}) {
      const now = Date.now();
      stages.push({
        name,
        durationMs: now - lastMarkAt,
        elapsedMs: now - startedAt,
        ...metadata
      });
      lastMarkAt = now;
    },
    snapshot() {
      return {
        totalMs: Date.now() - startedAt,
        stages
      };
    }
  };
}

function cleanText(value = '') {
  return normalizeAdbInputText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\s/g, '%s')
    .replace(/[;&|<>$`"']/g, '');
}

function hasUnicodeText(value = '') {
  return /[^\x20-\x7E]/.test(String(value));
}

function cleanClipboardText(value = '') {
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .slice(0, 5000);
}

function cleanIntentText(value = '') {
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .slice(0, 5000);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteAdbShellArg(value = '') {
  const text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return `'${text.replace(/'/g, `'"'"'`)}'`;
}

function normalizeAdbInputText(value = '') {
  return String(value)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function getPngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return { width: null, height: null };
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

export async function captureScreenshot(account, userId, reason = 'debug') {
  const target = getDeviceTarget(account);
  if (!target) return null;
  const result = await runBinaryCommand(env.mobileAutomation.adbPath, ['-s', target, 'exec-out', 'screencap', '-p'], {
    timeoutMs: 30_000
  });
  const image = result.ok ? result.stdout : null;
  const size = image ? getPngSize(image) : { width: null, height: null };
  await writeLog(
    userId,
    account._id,
    result.ok ? 'info' : 'warn',
    'capture_screenshot',
    result.ok ? `Đã chụp màn hình (${reason}).` : 'Không chụp được màn hình.',
    {
      reason,
      ok: result.ok,
      durationMs: result.durationMs,
      bytes: image?.length || 0,
      width: size.width,
      height: size.height,
      error: result.error || result.stderr || null
    }
  );
  return {
    ok: result.ok,
    width: size.width,
    height: size.height,
    imageBase64: image ? image.toString('base64') : null,
    error: result.error || result.stderr || null
  };
}

export async function openLdPlayer(account, userId, options = {}) {
  const service = await ensureLdPlayerVirtualizationService(account, userId);
  let instance = await getLdPlayerInstanceInfo(account.instanceName);
  let ldRecovery = null;
  let preLaunchAdbReset = null;
  if (env.mobileAutomation.ldRuntimeHelperUrl && !account.adbHost && !instance?.running) {
    const helperLaunch = await launchLdPlayerViaRuntimeHelper(account, userId, instance);
    if (helperLaunch.ok) {
      accountRuntimeTargets.set(account._id, helperLaunch.target);
      return {
        launch: helperLaunch,
        connect: null,
        startServer: null,
        engine: {
          ok: true,
          reason: 'ld_runtime_helper_ready',
          elapsedMs: helperLaunch.elapsedMs,
          instance,
          devices: helperLaunch.devices || null,
          target: helperLaunch.target
        },
        target: helperLaunch.target
      };
    }
    await writeLog(
      userId,
      account._id,
      'warn',
      'ld_runtime_helper_fallback',
      'LD runtime helper chưa mở được ADB device; fallback về luồng mở LD nội bộ.',
      helperLaunch
    );
  }
  const launchArgs = buildLdPlayerLaunchArgs(account, instance, options.bootPackage);
  let result = instance?.running
    ? {
      ok: true,
      command: env.mobileAutomation.ldconsolePath,
      args: launchArgs,
      durationMs: 0,
      stdout: '',
      stderr: '',
      alreadyRunning: true
    }
    : await runCommand(env.mobileAutomation.ldconsolePath, launchArgs, { windowsHide: false });
  await writeLog(
    userId,
    account._id,
    result.ok ? 'info' : 'error',
    'remote_launch_ldplayer',
    result.alreadyRunning ? `${account.instanceName} đang chạy, tiếp tục kiểm tra ADB.` : (result.ok ? 'Đã mở LDPlayer.' : 'Mở LDPlayer lỗi.'),
    { ...result, service, instance, preLaunchAdbReset, bootPackage: options.bootPackage || '' }
  );
  if (!result.ok) return { launch: result, connect: null, startServer: null };

  if (!result.alreadyRunning) {
    await delay(30_000);
  }
  const startServer = await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
  await writeLog(userId, account._id, startServer.ok ? 'info' : 'warn', 'remote_adb_start_server', startServer.ok ? 'ADB server đã sẵn sàng.' : 'Không khởi động được ADB server.', startServer);

  const wasRunningBeforeLaunch = Boolean(instance?.running);
  const engineWaitMs = wasRunningBeforeLaunch && !instance.engineReady
    ? 20_000
    : Math.max(env.mobileAutomation.launchWaitMs, 105_000);
  let engine = await waitForLdPlayerEngine(account, engineWaitMs, {
    noDeviceAfterProcessMs: 45_000
  });
  if (!engine.ok && engine.expectedTargetState === 'offline') {
    const killServer = await runCommand(env.mobileAutomation.adbPath, ['kill-server'], { timeoutMs: 10_000 });
    await delay(1_000);
    const restartServer = await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
    await writeLog(
      userId,
      account._id,
      restartServer.ok ? 'info' : 'warn',
      'ldplayer_adb_offline_recovery',
      restartServer.ok
        ? `${account.instanceName} đang ở trạng thái ADB offline; đã restart ADB server và chờ thêm thay vì reboot LDPlayer sớm.`
        : `${account.instanceName} đang ADB offline nhưng restart ADB server chưa thành công.`,
      { engine, killServer, restartServer }
    );
    engine = await waitForLdPlayerEngine(account, 60_000);
  }
  if (!engine.ok && !engine.expectedTargetState && (engine.instance?.processId || engine.instance?.androidStarted)) {
    const killServer = await runCommand(env.mobileAutomation.adbPath, ['kill-server'], { timeoutMs: 10_000 });
    await delay(1_000);
    const restartServer = await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
    await writeLog(
      userId,
      account._id,
      restartServer.ok ? 'warn' : 'error',
      'ldplayer_adb_missing_device_recovery',
      restartServer.ok
        ? `${account.instanceName} đã có process nhưng ADB không liệt kê device; restart ADB server và chờ ngắn thêm, không reboot LDPlayer sớm.`
        : `${account.instanceName} đã có process nhưng ADB không liệt kê device và restart ADB server thất bại.`,
      { engine, killServer, restartServer }
    );
    engine = await waitForLdPlayerEngine(account, 8_000);
    if (!engine.ok) {
      ldRecovery = await recoverLdPlayerAdbDevice(account, userId, {
        reason: 'adb_device_not_listed_after_launch',
        skipAdbRestart: true,
        bootPackage: options.bootPackage || '',
        previousEngine: engine
      });
      if (ldRecovery.ok) {
        engine = ldRecovery.engine;
        result = ldRecovery.launch || result;
      }
    }
  }
  const shouldTryLdConsoleRecovery = Boolean(
    engine.expectedTargetState
    || !(engine.instance?.processId || engine.instance?.androidStarted)
  );
  if (!engine.ok && shouldTryLdConsoleRecovery) {
    await writeLog(
      userId,
      account._id,
      'warn',
      'ldplayer_engine_not_ready',
      `${account.instanceName} đã nhận lệnh mở nhưng engine/ADB chưa phản hồi; đang thử lệnh launch lần cuối.`,
      engine
    );
    instance = await getLdPlayerInstanceInfo(account.instanceName);
    const recoveryArgs = instance?.running && Number.isInteger(instance.index) && !options.bootPackage
      ? ['reboot', '--index', String(instance.index)]
      : buildLdPlayerLaunchArgs(account, instance, options.bootPackage);
    result = await runCommand(env.mobileAutomation.ldconsolePath, recoveryArgs, { windowsHide: false });
    await writeLog(
      userId,
      account._id,
      result.ok ? 'info' : 'warn',
      'remote_launch_ldplayer_recovery',
      result.ok
        ? (recoveryArgs[0] === 'reboot'
          ? `Đã khởi động lại riêng ${account.instanceName} vì cửa sổ còn chạy nhưng engine Android không phản hồi.`
          : 'Đã gửi lại lệnh mở LDPlayer.')
        : 'Không phục hồi được instance LDPlayer.',
      { ...result, instance, recoveryMode: recoveryArgs[0] }
    );
    if (result.ok) {
      engine = await waitForLdPlayerEngine(account, recoveryArgs[0] === 'reboot' ? 35_000 : 20_000);
    }
  }

  if (!engine.ok) {
    const instanceProcessStarted = Boolean(engine.instance?.processId || engine.instance?.androidStarted);
    const noAdbDevice = !parseConnectedAdbTargets(engine.devices).length;
    const error = new Error(
      instanceProcessStarted && noAdbDevice
        ? `${account.instanceName} đã có process LDPlayer nhưng ADB không thấy thiết bị. Hãy chạy server/tool trong phiên desktop tương tác, hoặc mở LDPlayer thủ công một lần rồi thử lại.`
        : `${account.instanceName} đã mở cửa sổ nhưng Android/ADB chưa khởi động. Hãy đóng instance này trong LDPlayer Manager, mở lại một lần rồi thử tiếp.`
    );
    error.code = 'LDPLAYER_ENGINE_NOT_READY';
    error.details = {
      instance: engine.instance,
      devices: engine.devices,
      service,
      recovery: ldRecovery
    };
    throw error;
  }

  if (account.adbHost) {
    const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', account.adbHost]);
    await writeLog(userId, account._id, connect.ok ? 'info' : 'error', 'remote_adb_connect', connect.ok ? `Đã nối ADB ${account.adbHost}.` : `Nối ADB lỗi ${account.adbHost}.`, connect);
    return { launch: result, connect, startServer, engine, target: engine.target || instance?.target || '' };
  }
  return { launch: result, connect: null, startServer, engine, target: engine.target || instance?.target || '' };
}

function buildLdPlayerLaunchArgs(account, instance, bootPackage = '') {
  const selector = Number.isInteger(instance?.index)
    ? ['--index', String(instance.index)]
    : ['--name', account.instanceName];
  return ['launch', ...selector];
}

async function launchLdPlayerViaRuntimeHelper(account, userId, instance = null) {
  const startedAt = Date.now();
  const helperUrl = String(env.mobileAutomation.ldRuntimeHelperUrl || '').replace(/\/+$/, '');
  const index = Number.isInteger(instance?.index)
    ? instance.index
    : inferLdPlayerIndex(account.instanceName);
  const target = instance?.target || getDeviceTarget(account) || (Number.isInteger(index) ? `emulator-${5554 + (index * 2)}` : '');
  if (!helperUrl || !Number.isInteger(index) || !target) {
    return {
      ok: false,
      skipped: true,
      elapsedMs: Date.now() - startedAt,
      error: 'Thiếu helper URL, LD index hoặc target.'
    };
  }

  try {
    const response = await fetch(`${helperUrl}/launch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        index,
        target,
        instanceName: account.instanceName,
        timeoutMs: 120_000,
        initialWaitMs: 35_000
      }),
      signal: AbortSignal.timeout(180_000)
    });
    const result = await response.json().catch(() => ({}));
    const normalized = {
      ...result,
      ok: response.ok && Boolean(result.ok),
      helperUrl,
      elapsedMs: Date.now() - startedAt,
      target: result.target || target
    };
    await writeLog(
      userId,
      account._id,
      normalized.ok ? 'info' : 'warn',
      normalized.ok ? 'ld_runtime_helper_ready' : 'ld_runtime_helper_failed',
      normalized.ok
        ? `${account.instanceName} đã sẵn sàng qua LD runtime helper.`
        : `${account.instanceName} chưa sẵn sàng qua LD runtime helper.`,
      normalized
    );
    return normalized;
  } catch (error) {
    const result = {
      ok: false,
      helperUrl,
      elapsedMs: Date.now() - startedAt,
      target,
      error: error.message
    };
    await writeLog(userId, account._id, 'warn', 'ld_runtime_helper_unreachable', 'Không gọi được LD runtime helper.', result);
    return result;
  }
}

async function recoverLdPlayerAdbDevice(account, userId, context = {}) {
  const startedAt = Date.now();
  const steps = [];
  const firstInstance = await getLdPlayerInstanceInfo(account.instanceName);
  const expectedTarget = firstInstance?.target || getDeviceTarget(account);

  let engine = context.previousEngine || { ok: false };
  if (!context.skipAdbRestart) {
    const killServer = await runCommand(env.mobileAutomation.adbPath, ['kill-server'], { timeoutMs: 10_000 });
    steps.push({ step: 'adb_kill_server', ...killServer });
    await delay(900);
    const startServer = await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
    steps.push({ step: 'adb_start_server', ...startServer });
    engine = await waitForLdPlayerEngine(account, 8_000);
    if (engine.ok) {
      const recovered = {
        ok: true,
        recoveredBy: 'adb_restart',
        elapsedMs: Date.now() - startedAt,
        target: engine.target || expectedTarget,
        engine,
        launch: null,
        steps,
        context
      };
      await writeLog(userId, account._id, 'info', 'ldplayer_adb_device_recovered', `${account.instanceName} đã attach ADB sau khi restart ADB server.`, recovered);
      return recovered;
    }
  }

  const close = await closeLdPlayerInstanceOnly(account, userId, expectedTarget);
  steps.push({ step: 'close_ldplayer_instance', ok: close.ok, close });
  await delay(1_200);

  const instance = await getLdPlayerInstanceInfo(account.instanceName);
  const launchInstance = instance || firstInstance;
  const launchArgs = buildLdPlayerLaunchArgs(account, launchInstance, context.bootPackage);
  const launch = await runCommand(env.mobileAutomation.ldconsolePath, launchArgs, { timeoutMs: 20_000, windowsHide: false });
  steps.push({ step: 'launch_ldplayer_instance', ...launch });
  if (launch.ok) {
    await delay(30_000);
    engine = await waitForLdPlayerEngine(account, 45_000, {
      noDeviceAfterProcessMs: 25_000
    });
  }

  const recovered = {
    ok: Boolean(launch.ok && engine.ok),
    recoveredBy: launch.ok && engine.ok ? 'ld_restart' : '',
    elapsedMs: Date.now() - startedAt,
    target: engine?.target || expectedTarget,
    engine,
    launch,
    steps,
    context
  };
  await writeLog(
    userId,
    account._id,
    recovered.ok ? 'info' : 'error',
    recovered.ok ? 'ldplayer_adb_device_recovered' : 'ldplayer_adb_device_recovery_failed',
    recovered.ok
      ? `${account.instanceName} đã attach ADB sau khi khởi động lại riêng instance.`
      : `${account.instanceName} vẫn không attach được ADB sau khi khởi động lại riêng instance.`,
    recovered
  );
  return recovered;
}

export async function recoverAccountLdPlayer(account, userId) {
  return recoverLdPlayerAdbDevice(account, userId, {
    reason: 'manual_recover_ldplayer'
  });
}

async function closeLdPlayerInstanceOnly(account, userId, target) {
  const instanceBeforeClose = await getLdPlayerInstanceInfo(account.instanceName);
  const quitArgs = Number.isInteger(instanceBeforeClose?.index)
    ? ['quit', '--index', String(instanceBeforeClose.index)]
    : ['quit', '--name', account.instanceName];
  const ldplayer = await runCommand(env.mobileAutomation.ldconsolePath, quitArgs, { timeoutMs: 10_000 });
  await writeLog(
    userId,
    account._id,
    ldplayer.ok ? 'info' : 'warn',
    'remote_recover_close_ldplayer',
    ldplayer.ok ? `Đã tắt riêng ${account.instanceName} để recover ADB.` : `Không tắt được ${account.instanceName} khi recover ADB.`,
    ldplayer
  );
  const cleanup = await ensureLdPlayerInstanceStopped(account, userId, target, {
    processId: instanceBeforeClose?.processId || null,
    boxProcessId: instanceBeforeClose?.boxProcessId || null
  });
  accountRuntimeTargets.delete(account._id);
  if (target) {
    androidUiReadyCache.delete(target);
    invalidateUiDump(target);
  }
  return {
    app: null,
    powerOff: null,
    ldplayer,
    cleanup,
    ok: Boolean(cleanup.ok)
  };
}

async function ensureLdPlayerVirtualizationService(account, userId) {
  const processes = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-Process Ld9BoxSVC -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id)'
  ], { timeoutMs: 5_000 });
  if (processes.ok && /^\d+$/.test(String(processes.stdout || '').trim())) {
    return { ok: true, alreadyRunning: true };
  }

  const candidates = [
    'C:\\Program Files\\ldplayer9box\\Ld9BoxSVC.exe',
    'C:\\Program Files (x86)\\ldplayer9box\\Ld9BoxSVC.exe'
  ];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    return { ok: false, error: 'Không tìm thấy dịch vụ ảo hóa Ld9BoxSVC.' };
  }

  const escapedExecutable = executable.replace(/"/g, '\\"');
  const started = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath "${escapedExecutable}" -WindowStyle Hidden`
  ], { timeoutMs: 10_000 });
  await writeLog(
    userId,
    account._id,
    started.ok ? 'info' : 'warn',
    'ldplayer_virtualization_service_start',
    started.ok ? 'Đã khởi động lại dịch vụ ảo hóa LDPlayer.' : 'Không khởi động được dịch vụ ảo hóa LDPlayer.',
    started
  );
  if (started.ok) await delay(2_000);
  const verify = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-Process Ld9BoxSVC -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id)'
  ], { timeoutMs: 5_000 });
  const processId = String(verify.stdout || '').trim();
  const verified = /^\d+$/.test(processId);
  if (verified) await delay(8_000);
  return {
    ...started,
    verified,
    warmedUp: verified,
    processId: verified ? Number(processId) : null,
    verify
  };
}

async function getLdPlayerInstanceInfo(instanceName = '') {
  if (!instanceName) return '';
  const instances = await getLdPlayerInstances();
  const exact = instances.find((instance) => instance.instanceName === instanceName);
  if (exact) return exact;
  const inferredIndex = inferLdPlayerIndex(instanceName);
  if (Number.isInteger(inferredIndex)) {
    const byIndex = instances.find((instance) => instance.index === inferredIndex);
    if (byIndex) return byIndex;
  }
  return null;
}

function inferLdPlayerIndex(instanceName = '') {
  const name = String(instanceName || '').trim();
  if (/^LDPlayer$/i.test(name)) return 0;
  const number = Number(name.match(/^LDPlayer(?:[-\s]+)?0*(\d+)$/i)?.[1]);
  return Number.isInteger(number) && number > 0 ? number - 1 : null;
}

async function getLdPlayerInstances() {
  const list = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 10_000 });
  if (!list.ok || !list.stdout) return [];
  return list.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(','))
    .map((row) => {
      const index = Number(row?.[0]);
      if (!Number.isInteger(index) || index < 0) return null;
      const processId = Number(row?.[5]);
      const boxProcessId = Number(row?.[6]);
      const androidStarted = Number(row?.[4]) > 0;
      return {
        index,
        instanceName: row?.[1]?.trim() || '',
        running: androidStarted || processId > 0 || boxProcessId > 0,
        engineReady: boxProcessId > 0,
        androidStarted,
        processId: processId > 0 ? processId : null,
        boxProcessId: boxProcessId > 0 ? boxProcessId : null,
        target: `emulator-${5554 + (index * 2)}`
      };
    })
    .filter(Boolean);
}

async function waitForLdPlayerEngine(account, timeoutMs = 12_000, options = {}) {
  const startedAt = Date.now();
  let lastInstance = null;
  let lastDevices = null;
  let lastExpectedTargetState = '';
  const noDeviceAfterProcessMs = Math.max(0, Number(options.noDeviceAfterProcessMs) || 0);

  while (Date.now() - startedAt < timeoutMs) {
    lastInstance = await getLdPlayerInstanceInfo(account.instanceName);
    lastDevices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 4_000 });
    const deviceRows = parseAdbDeviceRows(lastDevices);
    const connectedTargets = deviceRows
      .filter((row) => row.state === 'device')
      .map((row) => row.serial);
    const configuredTarget = getDeviceTarget(account);
    const expectedTarget = lastInstance?.target || configuredTarget;
    lastExpectedTargetState = deviceRows.find((row) => row.serial === expectedTarget)?.state || '';
    const target = connectedTargets.includes(expectedTarget)
      ? expectedTarget
      : expectedTarget?.includes(':') && connectedTargets.length === 1
        ? connectedTargets[0]
        : '';

    if (target) {
      accountRuntimeTargets.set(account._id, target);
      return {
        ok: true,
        reason: 'adb_device_ready',
        elapsedMs: Date.now() - startedAt,
        instance: lastInstance,
        devices: lastDevices,
        target
      };
    }

    if (lastInstance?.engineReady) {
      return {
        ok: true,
        reason: 'ldconsole_engine_ready',
        elapsedMs: Date.now() - startedAt,
        instance: lastInstance,
        devices: lastDevices,
        target: expectedTarget
      };
    }
    if (
      noDeviceAfterProcessMs
      && Date.now() - startedAt >= noDeviceAfterProcessMs
      && (lastInstance?.processId || lastInstance?.androidStarted)
      && !lastExpectedTargetState
      && !deviceRows.some((row) => /^emulator-\d+$/.test(row.serial))
    ) {
      return {
        ok: false,
        reason: 'adb_device_not_listed',
        elapsedMs: Date.now() - startedAt,
        instance: lastInstance,
        devices: lastDevices,
        expectedTargetState: lastExpectedTargetState
      };
    }
    await delay(750);
  }

  return {
    ok: false,
    reason: 'engine_start_timeout',
    elapsedMs: Date.now() - startedAt,
    instance: lastInstance,
    devices: lastDevices,
    expectedTargetState: lastExpectedTargetState
  };
}

function parseConnectedAdbTargets(result) {
  if (!result?.ok) return [];
  return parseAdbDeviceRows(result)
    .filter((row) => row.state === 'device')
    .map((row) => row.serial);
}

function parseAdbDeviceRows(result) {
  if (!result?.ok) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state)
    .map(([serial, state]) => ({ serial, state }));
}

async function isAndroidPackageInstalled(target, packageName) {
  if (!target || !packageName) return { ok: false, target, packageName, error: 'Missing target or package name.' };
  const result = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'pm',
    'path',
    packageName
  ], { timeoutMs: 10_000 });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  return {
    ...result,
    ok: Boolean(result.ok && /^package:/m.test(output)),
    target,
    packageName,
    output
  };
}

async function getLauncherActivityComponent(target, packageName) {
  if (!target || !packageName) {
    return { ok: false, target, packageName, component: '', error: 'Missing target or package name.' };
  }
  const resolve = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'cmd',
    'package',
    'resolve-activity',
    '--brief',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.LAUNCHER',
    packageName
  ], { timeoutMs: 10_000 });
  const output = `${resolve.stdout || ''}\n${resolve.stderr || ''}`;
  const component = String(resolve.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes('/') && line.startsWith(`${packageName}/`))
    || output.match(new RegExp(`(${escapeRegExp(packageName)}/[A-Za-z0-9.$_]+)`))?.[1]
    || '';
  return {
    ...resolve,
    ok: Boolean(resolve.ok && component),
    target,
    packageName,
    component
  };
}

function isTransientAdbCheckOutput(value = '') {
  return /timed out|timeout|not found|offline|closed|device|more than one/i.test(String(value || ''));
}

async function getLdPlayerDeviceTarget(instanceName = '') {
  const instance = await getLdPlayerInstanceInfo(instanceName);
  return instance?.target || '';
}

async function ensureDeviceReady(account, userId, target, attempts = 8) {
  const requestedTarget = target;
  target = await normalizeAccountDeviceTarget(account, target);
  if (requestedTarget && target && requestedTarget !== target) {
    await writeLog(
      userId,
      account._id,
      'warn',
      'adb_target_corrected',
      `Đã sửa ADB target từ ${requestedTarget} về ${target} theo ${account.instanceName}.`,
      { requestedTarget, resolvedTarget: target, instanceName: account.instanceName }
    );
  }
  let lastState = null;
  const initialState = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 4_000 });
  if (initialState.ok && String(initialState.stdout || '').trim() === 'device') {
    accountRuntimeTargets.set(account._id, target);
    return { ...initialState, resolvedTarget: target };
  }

  await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 8_000 });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 10_000 });
    lastState = state;
    if (state.ok && String(state.stdout || '').trim() === 'device') {
      accountRuntimeTargets.set(account._id, target);
      if (attempt > 1) {
        await writeLog(userId, account._id, 'info', 'adb_ready_after_retry', `ADB ${target} đã sẵn sàng sau ${attempt} lần kiểm tra.`, state);
      }
      return { ...state, resolvedTarget: target };
    }

    const dynamicTarget = shouldAllowDynamicTarget(account, target)
      ? await findAvailableEmulatorTarget(target, account.instanceName)
      : '';
    if (dynamicTarget && dynamicTarget !== target) {
      const dynamicState = await runCommand(env.mobileAutomation.adbPath, ['-s', dynamicTarget, 'get-state'], { timeoutMs: 4_000 });
      if (dynamicState.ok && String(dynamicState.stdout || '').trim() === 'device') {
        accountRuntimeTargets.set(account._id, dynamicTarget);
        await writeLog(
          userId,
          account._id,
          'info',
          'adb_dynamic_target_resolved',
          `Đã ánh xạ ${account.instanceName} từ ${target} sang ${dynamicTarget}.`,
          { configuredTarget: target, resolvedTarget: dynamicTarget, attempt }
        );
        return { ...dynamicState, resolvedTarget: dynamicTarget };
      }
    }

    if (account.adbHost && /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(account.adbHost)) {
      await runCommand(env.mobileAutomation.adbPath, ['disconnect', account.adbHost], { timeoutMs: 10_000 });
      await delay(400);
      await runCommand(env.mobileAutomation.adbPath, ['connect', account.adbHost], { timeoutMs: 10_000 });
    }
    await delay(attempt < 3 ? 800 : 1200);
  }

  await writeLog(userId, account._id, 'error', 'adb_not_ready', `ADB ${target} chưa sẵn sàng để mở app.`, lastState || {});
  return lastState || { ok: false, error: 'ADB target is not ready.' };
}

async function ensureAdbStable(account, userId, target, options = {}) {
  const requiredStableChecks = Math.max(2, Number(options.stableChecks) || 3);
  const maxAttempts = Math.max(requiredStableChecks, Number(options.maxAttempts) || 8);
  const startedAt = Date.now();
  let stableChecks = 0;
  let lastState = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 4_000 });
    lastState = state;
    const ready = Boolean(state.ok && String(state.stdout || '').trim() === 'device');
    stableChecks = ready ? stableChecks + 1 : 0;

    if (stableChecks >= requiredStableChecks) {
      const result = {
        ok: true,
        target,
        attempt,
        stableChecks,
        elapsedMs: Date.now() - startedAt,
        phase: options.phase || 'runtime'
      };
      if (attempt > requiredStableChecks) {
        await writeLog(
          userId,
          account._id,
          'info',
          'adb_stable_after_retry',
          `ADB ${target} đã ổn định sau ${attempt} lần kiểm tra.`,
          result
        );
      }
      return result;
    }

    await delay(attempt < 3 ? 500 : 900);
  }

  const output = `${lastState?.stdout || ''} ${lastState?.stderr || ''} ${lastState?.error || ''}`.trim();
  const result = {
    ok: false,
    target,
    stableChecks,
    elapsedMs: Date.now() - startedAt,
    phase: options.phase || 'runtime',
    lastState,
    error: /offline/i.test(output)
      ? 'ADB đang offline/chập chờn. Hãy restart LDPlayer và đợi 1-2 phút trước khi đăng.'
      : 'ADB chưa ổn định đủ để bắt đầu automation.'
  };
  await writeLog(
    userId,
    account._id,
    'error',
    'adb_stability_failed',
    result.error,
    result
  );
  return result;
}

async function normalizeAccountDeviceTarget(account, target = '') {
  const candidate = target || getDeviceTarget(account);
  if (!account?.instanceName || !isEmulatorTarget(candidate)) return candidate;

  const instanceTarget = await getLdPlayerDeviceTarget(account.instanceName);
  if (instanceTarget && candidate !== instanceTarget) {
    accountRuntimeTargets.delete(account._id);
    return instanceTarget;
  }
  return candidate;
}

function shouldAllowDynamicTarget(account, target = '') {
  if (isEmulatorTarget(account?.deviceId) || isEmulatorTarget(account?.adbHost)) return false;
  if (isEmulatorTarget(target)) return false;
  return true;
}

function isEmulatorTarget(value = '') {
  return /^emulator-\d+$/.test(String(value || ''));
}

function hasActiveSystemUiAnr(windowOutput = '') {
  const output = String(windowOutput || '');
  const currentFocus = output.match(/mCurrentFocus=.*$/m)?.[0] || '';
  if (currentFocus && !/com\.android\.systemui|Application Not Responding/i.test(currentFocus)) {
    const visibleSystemUiAnr = /Window\{[^\n]*Application Not Responding:\s*com\.android\.systemui[\s\S]*?Surface:\s*shown=true/i.test(output);
    if (!visibleSystemUiAnr) return false;
  }
  return output
    .split(/\r?\n/)
    .some((line) => {
      const text = line.trim();
      if (!text || /^mLastDisplayFreezeDuration=/i.test(text)) return false;
      return /(?:Window\{.*|mCurrentFocus=.*)Application Not Responding:\s*com\.android\.systemui/i.test(text)
        || /mCurrentFocus=.*com\.android\.systemui.*not responding/i.test(text);
    });
}

function hasActivePackageAnr(windowOutput = '', packageName = '') {
  const output = String(windowOutput || '');
  const escapedPackage = escapeRegExp(packageName);
  if (!escapedPackage) return false;
  const anrPattern = new RegExp(`Application Not Responding:\\s*${escapedPackage}`, 'i');
  const focusPattern = new RegExp(`mCurrentFocus=.*Application Not Responding:\\s*${escapedPackage}`, 'i');
  return anrPattern.test(output) || focusPattern.test(output);
}

async function findAvailableEmulatorTarget(preferredTarget = '', instanceName = '') {
  const devices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 5_000 });
  if (!devices.ok) return '';
  const targets = String(devices.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => /^emulator-\d+$/.test(serial) && state === 'device')
    .map(([serial]) => serial);
  if (targets.includes(preferredTarget)) return preferredTarget;
  if (targets.length !== 1 || !instanceName) return '';

  const runningInstances = (await getLdPlayerInstances()).filter((instance) => instance.running);
  return runningInstances.length === 1 && runningInstances[0].instanceName === instanceName
    ? targets[0]
    : '';
}

async function ensureAndroidUiReady(account, userId, target, attempts = 30) {
  const cached = androidUiReadyCache.get(target);
  if (cached && Date.now() - cached.at < androidUiReadyCacheTtlMs) {
    const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 3_000 });
    if (state.ok && String(state.stdout || '').trim() === 'device') {
      return {
        ok: true,
        attempt: 0,
        waitedForBoot: false,
        elapsedMs: 0,
        cached: true,
        previous: cached.result
      };
    }
    androidUiReadyCache.delete(target);
  }

  let consecutiveReadyChecks = 0;
  let lastCheck = null;
  let recoveryCount = 0;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const boot = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'getprop',
      'sys.boot_completed'
    ], { timeoutMs: 5_000 });
    const bootCompleted = boot.ok && String(boot.stdout || '').trim() === '1';
    const animation = bootCompleted
      ? await runCommand(env.mobileAutomation.adbPath, [
        '-s',
        target,
        'shell',
        'getprop',
        'init.svc.bootanim'
      ], { timeoutMs: 5_000 })
      : { ok: false, stdout: '', error: 'Android boot is incomplete.' };
    const animationState = String(animation.stdout || '').trim().toLowerCase();
    const windowState = bootCompleted
      ? await runCommand(env.mobileAutomation.adbPath, [
        '-s',
        target,
        'shell',
        'dumpsys',
        'window',
        'windows'
      ], { timeoutMs: 6_000 })
      : { ok: false, stdout: '', error: 'Android boot is incomplete.' };
    const windowOutput = `${windowState.stdout || ''}\n${windowState.stderr || ''}`;
    const windowStateSummary = {
      ok: windowState.ok,
      durationMs: windowState.durationMs,
      error: windowState.error || windowState.stderr || null
    };
    const systemUiAnr = hasActiveSystemUiAnr(windowOutput);

    if (systemUiAnr) {
      consecutiveReadyChecks = 0;
      recoveryCount += 1;
      const recovery = await selectSystemUiWaitByKeyboard(target);
      await writeLog(
        userId,
        account._id,
        'warn',
        'android_boot_system_ui_anr_recovery',
        'System UI bị treo khi LDPlayer khởi động; tool đã chọn Wait và tiếp tục chờ ổn định.',
        { attempt, recoveryCount, recovery }
      );
      lastCheck = {
        bootCompleted,
        animationState,
        systemUiAnr,
        recoveryCount,
        boot,
        animation,
        windowState: windowStateSummary
      };
      await delay(2500);
      continue;
    }

    const ready = bootCompleted
      && animation.ok
      && (!animationState || animationState === 'stopped')
      && windowState.ok;

    consecutiveReadyChecks = ready ? consecutiveReadyChecks + 1 : 0;
    lastCheck = {
      bootCompleted,
      animationState,
      systemUiAnr,
      recoveryCount,
      consecutiveReadyChecks,
      boot,
      animation,
      windowState: windowStateSummary
    };

    // ADB can report "device" while Android is still restoring System UI.
    // Two consecutive lightweight checks avoid starting UIAutomator in that window.
    if (consecutiveReadyChecks >= 2) {
      const result = {
        ok: true,
        attempt,
        waitedForBoot: attempt > 2,
        elapsedMs: Date.now() - startedAt,
        ...lastCheck
      };
      if (result.waitedForBoot) {
        await writeLog(
          userId,
          account._id,
          'info',
          'android_ui_ready',
          `Android trên ${target} đã ổn định sau ${attempt} lần kiểm tra.`,
          result
        );
      }
      androidUiReadyCache.set(target, {
        at: Date.now(),
        result: {
          attempt: result.attempt,
          elapsedMs: result.elapsedMs,
          recoveryCount: result.recoveryCount
        }
      });
      return result;
    }

    await delay(attempt < 6 ? 500 : 800);
  }

  await writeLog(
    userId,
    account._id,
    'error',
    'android_ui_not_ready',
    `Android/System UI trên ${target} chưa sẵn sàng.`,
    lastCheck || {}
  );
  return {
    ok: false,
    error: 'LDPlayer chưa khởi động ổn định. Vui lòng chờ Android hoàn tất rồi thử lại.',
    elapsedMs: Date.now() - startedAt,
    ...lastCheck
  };
}

async function waitForSystemUiHealthy(account, userId, target, options = {}) {
  const requiredStableChecks = Math.max(2, Number(options.stableChecks) || 3);
  const maxAttempts = Math.max(requiredStableChecks, Number(options.maxAttempts) || 10);
  const startedAt = Date.now();
  let stableChecks = 0;
  let recoveryCount = 0;
  let lastWindowState = null;

  if (options.initialDelayMs) await delay(options.initialDelayMs);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const windowState = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'dumpsys',
      'window',
      'windows'
    ], { timeoutMs: 6_000 });
    const output = `${windowState.stdout || ''}\n${windowState.stderr || ''}`;
    const systemUiAnr = hasActiveSystemUiAnr(output);
    lastWindowState = {
      ok: windowState.ok,
      durationMs: windowState.durationMs,
      error: windowState.error || windowState.stderr || null,
      systemUiAnr
    };

    if (systemUiAnr) {
      stableChecks = 0;
      recoveryCount += 1;
      const recovery = await selectSystemUiWaitByKeyboard(target);
      await writeLog(
        userId,
        account._id,
        'warn',
        'system_ui_health_recovery',
        'System UI không phản hồi; đã chọn Wait và tạm dừng automation để Android hồi phục.',
        { attempt, recoveryCount, recovery, phase: options.phase || 'runtime' }
      );
      if (!recovery.ok) {
        return {
          ok: false,
          error: 'System UI đang ANR và ADB không bấm được Wait; dừng sớm để tránh treo workflow.',
          recoveryCount,
          stableChecks,
          elapsedMs: Date.now() - startedAt,
          phase: options.phase || 'runtime',
          lastWindowState,
          recovery
        };
      }
      await delay(3000);
      continue;
    }

    if (windowState.ok) {
      stableChecks += 1;
      if (stableChecks >= requiredStableChecks) {
        return {
          ok: true,
          attempt,
          stableChecks,
          recoveryCount,
          elapsedMs: Date.now() - startedAt,
          phase: options.phase || 'runtime'
        };
      }
    } else {
      stableChecks = 0;
    }
    await delay(650);
  }

  const result = {
    ok: false,
    error: 'System UI của LDPlayer chưa ổn định; automation đã dừng để tránh làm treo máy ảo.',
    recoveryCount,
    stableChecks,
    elapsedMs: Date.now() - startedAt,
    phase: options.phase || 'runtime',
    lastWindowState
  };
  await writeLog(
    userId,
    account._id,
    'error',
    'system_ui_health_failed',
    result.error,
    result
  );
  return result;
}

async function ensureAndroidStorageReady(account, userId, target, attempts = 45) {
  const cached = androidStorageReadyCache.get(target);
  if (cached && Date.now() - cached.at < androidStorageReadyCacheTtlMs) {
    return {
      ok: true,
      cached: true,
      elapsedMs: 0,
      ...cached.result
    };
  }

  let lastCheck = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const boot = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'getprop',
      'sys.boot_completed'
    ], { timeoutMs: 10_000 });
    const storage = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'mkdir',
      '-p',
      '/sdcard/Pictures'
    ], { timeoutMs: 10_000 });
    const probePath = '/sdcard/Pictures/.socialpilot-ready';
    const writable = storage.ok
      ? await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'touch', probePath], { timeoutMs: 10_000 })
      : { ok: false, error: 'Pictures directory is unavailable.' };
    if (writable.ok) {
      await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'rm', '-f', probePath], { timeoutMs: 10_000 });
    }
    lastCheck = { boot, storage, writable };

    if (
      boot.ok
      && String(boot.stdout || '').trim() === '1'
      && storage.ok
      && writable.ok
    ) {
      if (attempt > 1) {
        await writeLog(userId, account._id, 'info', 'android_storage_ready', `Bộ nhớ ${target} đã sẵn sàng sau ${attempt} lần kiểm tra.`);
      }
      androidStorageReadyCache.set(target, {
        at: Date.now(),
        result: { attempt }
      });
      return { ok: true, attempt, boot, storage };
    }

    await delay(attempt < 5 ? 1000 : 1500);
  }

  await writeLog(userId, account._id, 'error', 'android_storage_not_ready', `Android trên ${target} chưa hoàn tất khởi động bộ nhớ.`, lastCheck || {});
  return {
    ok: false,
    error: 'LDPlayer chưa khởi động xong bộ nhớ ảnh.',
    ...lastCheck
  };
}

async function getDeviceScreenSize(target) {
  const result = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'wm',
    'size'
  ], { timeoutMs: 10_000 });
  const output = String(result.stdout || '');
  const match = output.match(/Override size:\s*(\d+)x(\d+)/i)
    || output.match(/Physical size:\s*(\d+)x(\d+)/i);
  if (match) {
    return {
      width: Number(match[1]),
      height: Number(match[2]),
      source: 'wm_size'
    };
  }

  const nodes = await dumpVisibleNodes(target);
  const width = nodes.reduce((max, node) => Math.max(max, node.bounds?.right || 0), 0);
  const height = nodes.reduce((max, node) => Math.max(max, node.bounds?.bottom || 0), 0);
  return width > 0 && height > 0 ? { width, height, source: 'ui_hierarchy' } : null;
}

async function ensurePortraitOrientation(account, userId, target) {
  const before = await getDeviceScreenSize(target);
  if (!before || before.height >= before.width) return { ok: true, changed: false, size: before };

  const lock = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'settings',
    'put',
    'system',
    'accelerometer_rotation',
    '0'
  ], { timeoutMs: 10_000 });

  let rotate = null;
  let after = before;
  const attempts = [];
  for (const rotation of ['0', '1', '3']) {
    rotate = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'settings',
      'put',
      'system',
      'user_rotation',
      rotation
    ], { timeoutMs: 10_000 });
    await delay(1200);
    after = await getDeviceScreenSize(target);
    attempts.push({ rotation, rotate, size: after });
    if (after?.height >= after?.width) break;
  }

  let displayOverride = null;
  if (!after || after.width > after.height) {
    const portraitWidth = Math.min(before.width, before.height);
    const portraitHeight = Math.max(before.width, before.height);
    displayOverride = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'wm',
      'size',
      `${portraitWidth}x${portraitHeight}`
    ], { timeoutMs: 10_000 });
    if (displayOverride.ok) {
      rotate = await runCommand(env.mobileAutomation.adbPath, [
        '-s',
        target,
        'shell',
        'settings',
        'put',
        'system',
        'user_rotation',
        '0'
      ], { timeoutMs: 10_000 });
      await delay(1800);
      after = await getDeviceScreenSize(target);
      attempts.push({
        rotation: '0',
        displayOverride,
        rotate,
        size: after,
        fallback: 'wm_size'
      });
    }
  }

  const portrait = Boolean(after?.height >= after?.width);
  await writeLog(userId, account._id, portrait ? 'info' : 'warn', 'mobile_post_portrait_orientation', portrait ? 'Đã chuẩn hóa LDPlayer về màn hình dọc.' : 'LDPlayer vẫn đang ở màn hình ngang sau khi thử khóa xoay và đổi kích thước hiển thị.', {
    before,
    after,
    lock,
    rotate,
    displayOverride,
    attempts
  });
  return {
    ok: Boolean(lock.ok && rotate?.ok && portrait),
    changed: true,
    before,
    after,
    displayOverride,
    attempts
  };
}

async function runFacebookPublishPreflight(account, userId, target, config, mediaCount = 0) {
  const startedAt = Date.now();
  const steps = [];

  const adbStable = await ensureAdbStable(account, userId, target, {
    phase: 'facebook_publish_preflight',
    stableChecks: 3,
    maxAttempts: 8
  });
  steps.push(adbStable);
  if (!adbStable.ok) {
    return {
      ok: false,
      target,
      steps,
      elapsedMs: Date.now() - startedAt,
      reason: 'adb_unstable',
      error: adbStable.error
    };
  }

  const systemUi = await waitForSystemUiHealthy(account, userId, target, {
    phase: 'facebook_publish_preflight',
    stableChecks: 2,
    maxAttempts: mediaCount > 1 ? 8 : 5
  });
  steps.push(systemUi);
  if (!systemUi.ok) {
    return {
      ok: false,
      target,
      steps,
      elapsedMs: Date.now() - startedAt,
      reason: 'system_ui_unstable',
      error: systemUi.error
    };
  }

  const storage = await ensureAndroidStorageReady(account, userId, target, 6);
  steps.push(storage);
  if (!storage.ok) {
    return {
      ok: false,
      target,
      steps,
      elapsedMs: Date.now() - startedAt,
      reason: 'storage_not_ready',
      error: storage.error || 'Bộ nhớ ảnh của LDPlayer chưa sẵn sàng.'
    };
  }

  const packageInstalled = await isAndroidPackageInstalled(target, config.appPackage);
  steps.push(packageInstalled);
  if (!packageInstalled.ok) {
    return {
      ok: false,
      target,
      steps,
      elapsedMs: Date.now() - startedAt,
      reason: 'facebook_package_missing',
      error: `Không tìm thấy app Facebook (${config.appPackage}) trên LDPlayer.`
    };
  }

  const result = {
    ok: true,
    target,
    steps,
    elapsedMs: Date.now() - startedAt,
    mediaCount
  };
  await writeLog(
    userId,
    account._id,
    'info',
    'facebook_publish_preflight_ready',
    mediaCount > 1
      ? `LDPlayer đã ổn định để đăng ${mediaCount} media Facebook.`
      : 'LDPlayer đã ổn định để đăng Facebook.',
    {
      target,
      mediaCount,
      elapsedMs: result.elapsedMs,
      adbStable,
      systemUi,
      storage: { ok: storage.ok, cached: storage.cached || false, attempt: storage.attempt }
    }
  );
  return result;
}

async function resetInstagramDisplaySize(account, userId, target) {
  const cached = instagramDisplaySizeCache.get(target);
  if (cached && Date.now() - cached.at < instagramDisplaySizeCacheTtlMs) {
    return {
      ok: true,
      skipped: true,
      reason: 'display_size_cache',
      cacheAgeMs: Date.now() - cached.at,
      previous: cached.result
    };
  }
  const before = await getDeviceScreenSize(target);
  const reset = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'wm',
    'size',
    'reset'
  ], { timeoutMs: 10_000 });
  await delay(1200);
  const after = await getDeviceScreenSize(target);
  await writeLog(userId, account._id, reset.ok ? 'info' : 'warn', 'instagram_post_display_size', reset.ok
    ? 'Đã dùng kích thước màn hình gốc của LDPlayer cho Instagram.'
    : 'Không khôi phục được kích thước màn hình gốc của LDPlayer.', {
    before,
    after,
    reset
  });
  if (reset.ok) {
    instagramDisplaySizeCache.set(target, {
      at: Date.now(),
      result: { before, after }
    });
  }
  return { ok: reset.ok, before, after, reset };
}

async function performOpenAccountApp(account, userId, appPackage) {
  const startedAt = Date.now();
  let target = getDeviceTarget(account);
  let packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!packageName) throw new Error('Thiếu Android package name.');

  let ready = await ensureDeviceReady(account, userId, target, 2);
  target = ready.resolvedTarget || target;
  if (!ready.ok || ready.stdout !== 'device') {
    const instance = await getLdPlayerInstanceInfo(account.instanceName);
    target = instance?.target || target;
    if (instance && !instance.running) {
      await writeLog(
        userId,
        account._id,
        'info',
        'remote_open_app_launch_immediately',
        `${account.instanceName} đang tắt, mở ngay thay vì chờ ADB.`
      );
      const launched = await openLdPlayer(account, userId, { bootPackage: packageName });
      target = launched.target || await getLdPlayerDeviceTarget(account.instanceName) || target;
      ready = await ensureDeviceReady(account, userId, target, 30);
      target = ready.resolvedTarget || target;
    } else {
      await writeLog(userId, account._id, 'warn', 'remote_open_app_adb_wait', `ADB ${target} chưa sẵn sàng, đợi cold boot LDPlayer hoàn tất trước khi phục hồi.`);
      ready = await ensureDeviceReady(account, userId, target, 30);
      target = ready.resolvedTarget || target;
    }
  }
  if (!ready.ok || String(ready.stdout || '').trim() !== 'device') {
    await writeLog(userId, account._id, 'warn', 'remote_open_app_launch_retry', `ADB ${target} vẫn chưa sẵn sàng, thử mở LDPlayer một lần.`);
    const launched = await openLdPlayer(account, userId, { bootPackage: packageName });
    target = launched.target || await getLdPlayerDeviceTarget(account.instanceName) || target;
    ready = await ensureDeviceReady(account, userId, target, 18);
    target = ready.resolvedTarget || target;
  }
  if (!ready.ok || String(ready.stdout || '').trim() !== 'device') {
    throw new Error(ready.error || ready.stderr || `ADB ${target} chưa sẵn sàng.`);
  }

  const androidUiAttempts = packageName === defaultPackages.instagram
    ? 12
    : packageName === defaultPackages.facebook
      ? 8
      : 2;
  let androidUi = await ensureAndroidUiReady(account, userId, target, androidUiAttempts);
  if (!androidUi.ok) {
    await writeLog(
      userId,
      account._id,
      'warn',
      'remote_open_app_android_ui_soft_bypass',
      `ADB ${target} đã sẵn sàng; bỏ qua kiểm tra System UI kéo dài để mở app nhanh hơn.`,
      { androidUi }
    );
    androidUi = {
      ...androidUi,
      ok: true,
      softBypass: true,
      waitedForBoot: true
    };
  }
  if (androidUi.waitedForBoot) {
    // Let launcher and package manager finish their first render before opening Facebook.
    await delay(900);
  }

  let packageInstalled = await isAndroidPackageInstalled(target, packageName);
  if (!packageInstalled.ok) {
    const packageCheckOutput = `${packageInstalled.error || ''} ${packageInstalled.stderr || ''} ${packageInstalled.output || ''}`;
    const packageCheckTransient = isTransientAdbCheckOutput(packageCheckOutput);
    if (packageCheckTransient) {
      await delay(1_500);
      const retryReady = await ensureDeviceReady(account, userId, target, 10);
      target = retryReady.resolvedTarget || target;
      packageInstalled = retryReady.ok && String(retryReady.stdout || '').trim() === 'device'
        ? await isAndroidPackageInstalled(target, packageName)
        : { ...packageInstalled, retryReady };
    }
  }
  if (!packageInstalled.ok) {
    const packageCheckOutput = `${packageInstalled.error || ''} ${packageInstalled.stderr || ''} ${packageInstalled.output || ''}`;
    const packageCheckTransient = isTransientAdbCheckOutput(packageCheckOutput);
    if (packageCheckTransient) {
      await writeLog(userId, account._id, 'warn', 'remote_open_app_package_check_transient', `Chưa xác minh được package ${packageName}; dừng mở app vì ADB chưa ổn định.`, {
        target,
        packageName,
        packageInstalled
      });
      throw new Error(`ADB ${target} chưa ổn định khi kiểm tra app ${packageName}. Hãy thử lại sau khi LDPlayer boot xong.`);
    } else if (packageName === defaultPackages.instagram) {
      const liteInstalled = await isAndroidPackageInstalled(target, 'com.instagram.lite');
      const message = liteInstalled.ok
        ? 'LDPlayer này đang có Instagram Lite, chưa có Instagram bản full. Hãy cài Instagram bản full (com.instagram.android) để tool mở/đăng tự động.'
        : 'LDPlayer này chưa cài Instagram bản full. Hãy cài Instagram từ Play Store/LD Store rồi thử lại.';
      await writeLog(userId, account._id, 'error', 'remote_open_app_package_missing', message, {
        target,
        packageName,
        liteInstalled
      });
      throw new Error(message);
    } else {
      const message = `LDPlayer này chưa cài app ${packageName}. Hãy cài app rồi thử lại.`;
      await writeLog(userId, account._id, 'error', 'remote_open_app_package_missing', message, {
        target,
        packageName,
        packageInstalled
      });
      throw new Error(message);
    }
  }
  let launcherActivity = await getLauncherActivityComponent(target, packageName);
  if (!launcherActivity.ok && (androidUi.softBypass || androidUi.waitedForBoot)) {
    await delay(3_000);
    const retryLauncherActivity = await getLauncherActivityComponent(target, packageName);
    launcherActivity = retryLauncherActivity.ok ? retryLauncherActivity : {
      ...launcherActivity,
      retry: retryLauncherActivity
    };
  }
  if (!launcherActivity.ok) {
    const launcherOutput = `${launcherActivity.error || ''} ${launcherActivity.stderr || ''} ${launcherActivity.stdout || ''}`;
    const launcherTransient = isTransientAdbCheckOutput(launcherOutput);
    if (launcherTransient) {
      await delay(1_500);
      const retryReady = await ensureDeviceReady(account, userId, target, 10);
      target = retryReady.resolvedTarget || target;
      const retryLauncherActivity = retryReady.ok && String(retryReady.stdout || '').trim() === 'device'
        ? await getLauncherActivityComponent(target, packageName)
        : { ...launcherActivity, retryReady };
      launcherActivity = retryLauncherActivity.ok ? retryLauncherActivity : {
        ...launcherActivity,
        retryReady,
        retry: retryLauncherActivity
      };
    }
  }
  if (!launcherActivity.ok) {
    const launcherOutput = `${launcherActivity.error || ''} ${launcherActivity.stderr || ''} ${launcherActivity.stdout || ''} ${launcherActivity.retry?.error || ''} ${launcherActivity.retry?.stderr || ''} ${launcherActivity.retry?.stdout || ''}`;
    const launcherTransient = isTransientAdbCheckOutput(launcherOutput);
    if (launcherTransient) {
      await writeLog(userId, account._id, 'warn', 'remote_open_app_launcher_check_transient', `Chưa xác minh được launcher activity của ${packageName}; dừng mở app vì ADB chưa ổn định.`, {
        target,
        packageName,
        launcherActivity
      });
      throw new Error(`ADB ${target} chưa ổn định khi kiểm tra launcher của ${packageName}. Hãy thử lại sau khi LDPlayer boot xong.`);
    } else if ([defaultPackages.facebook, defaultPackages.instagram].includes(packageName) && packageInstalled.ok) {
      await writeLog(userId, account._id, 'warn', 'remote_open_app_launcher_unverified', `Chưa xác minh được launcher activity của ${packageName}; package đã tồn tại nên tiếp tục thử mở app.`, {
        target,
        packageName,
        launcherActivity
      });
    } else if (packageName === defaultPackages.instagram) {
      const liteInstalled = await isAndroidPackageInstalled(target, 'com.instagram.lite');
      const message = liteInstalled.ok
        ? 'LDPlayer này đang có Instagram Lite hoặc Instagram full không có launcher khả dụng. Hãy cài Instagram bản full (com.instagram.android) rồi thử lại.'
        : 'Instagram full đã có package nhưng không có màn hình mở app. Hãy gỡ/cài lại Instagram bản full trên LDPlayer này.';
      await writeLog(userId, account._id, 'error', 'remote_open_app_launcher_missing', message, {
        target,
        packageName,
        launcherActivity,
        liteInstalled
      });
      throw new Error(message);
    } else {
      const message = `App ${packageName} không có launcher activity khả dụng trên LDPlayer này.`;
      await writeLog(userId, account._id, 'error', 'remote_open_app_launcher_missing', message, {
        target,
        packageName,
        launcherActivity
      });
      throw new Error(message);
    }
  }

  const launchReady = await ensureDeviceReady(account, userId, target, 8);
  target = launchReady.resolvedTarget || target;
  if (!launchReady.ok || String(launchReady.stdout || '').trim() !== 'device') {
    throw new Error(launchReady.error || launchReady.stderr || `ADB ${target} chưa ổn định trước khi mở ${packageName}.`);
  }

  const foregroundBefore = await getForegroundAndroidPackage(target);
  if (foregroundBefore.packageName === packageName) {
    const readiness = await waitForAppForegroundReady(account, userId, target, packageName, 4_000, {
      stableChecks: 1,
      requireVisibleUi: false
    });
    if (readiness.ok) {
      const systemUiHealth = await waitForSystemUiHealthy(account, userId, target, {
        phase: 'already_foreground',
        initialDelayMs: androidUi.recoveryCount ? 1800 : 0
      });
      if (!systemUiHealth.ok) {
        await writeLog(
          userId,
          account._id,
          'warn',
          'remote_open_app_system_ui_health_soft_fail',
          'App đã ở foreground nhưng System UI health-check chưa ổn định; vẫn trả kết quả mở app để tránh chặn thao tác kiểm tra.',
          systemUiHealth
        );
      }
      const fastResult = {
        ok: true,
        launchMethod: 'already_foreground',
        target,
        packageName,
        elapsedMs: Date.now() - startedAt,
        androidUi,
        readiness,
        systemUiHealth,
        home: packageName === defaultPackages.facebook
          ? await ensureFacebookHomeOrAuthOnOpen(account, userId, target, packageName, readiness, {
            fast: false,
            recentlyBooted: androidUi.waitedForBoot
          })
          : null
      };
      if (packageName === defaultPackages.facebook) {
        fastResult.ok = Boolean(fastResult.home?.verified || fastResult.home?.state?.name === 'auth_screen');
        fastResult.facebookHomeVerified = Boolean(fastResult.home?.verified);
      }
      await writeLog(userId, account._id, fastResult.ok ? 'info' : 'warn', 'remote_open_app_fast_path', fastResult.ok ? `App ${packageName} đã mở sẵn.` : `App ${packageName} ở foreground nhưng chưa xác minh được trạng thái sẵn sàng.`, fastResult);
      return fastResult;
    }
  }

  let result = packageName === defaultPackages.facebook
    ? await launchFacebookWarm(target, packageName)
    : await launchAppWarm(target, packageName);
  if (!result.ok && /offline|not found|no devices/i.test(`${result.error || ''} ${result.stderr || ''}`)) {
    const retryReady = await ensureDeviceReady(account, userId, target, 4);
    target = retryReady.resolvedTarget || target;
    if (retryReady.ok && retryReady.stdout === 'device') {
      result = packageName === defaultPackages.facebook
        ? await launchFacebookWarm(target, packageName)
        : await launchAppWarm(target, packageName);
    }
  }
  if (!result.ok) {
    await delay(androidUi.softBypass || androidUi.waitedForBoot ? 5_000 : 2_000);
    result = packageName === defaultPackages.facebook
      ? await launchFacebookFresh(target, packageName)
      : await launchAppFresh(target, packageName);
  }
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_open_app', result.ok ? `Đã mở app ${packageName}.` : `Mở app lỗi ${packageName}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Open app failed.');
  const foregroundWaitMs = packageName === defaultPackages.instagram
    ? 20_000
    : packageName === defaultPackages.facebook
      ? 18_000
      : 7_000;
  let readiness = await waitForAppForegroundReady(account, userId, target, packageName, foregroundWaitMs, {
    stableChecks: 1,
    requireVisibleUi: false
  });
  if (!readiness.ok) {
    const retryReady = await ensureDeviceReady(account, userId, target, packageName === defaultPackages.instagram ? 12 : 4);
    target = retryReady.resolvedTarget || target;
    if (!retryReady.ok || String(retryReady.stdout || '').trim() !== 'device') {
      throw new Error(retryReady.error || retryReady.stderr || `ADB ${target} chưa ổn định sau khi mở ${packageName}.`);
    }
    result = packageName === defaultPackages.facebook
      ? await launchFacebookFresh(target, packageName)
      : await launchAppFresh(target, packageName);
    if (!result.ok) throw new Error(result.error || result.stderr || 'Open app failed.');
    const retryForegroundWaitMs = packageName === defaultPackages.instagram
      ? 30_000
      : packageName === defaultPackages.facebook
        ? 24_000
        : 14_000;
    readiness = await waitForAppForegroundReady(account, userId, target, packageName, retryForegroundWaitMs, {
      stableChecks: 1,
      requireVisibleUi: false
    });
  }
  if (!readiness.ok) {
    throw new Error(readiness.error || `${packageName} chưa ổn định trên LDPlayer.`);
  }
  const systemUiHealth = await waitForSystemUiHealthy(account, userId, target, {
    phase: 'after_app_launch',
    initialDelayMs: androidUi.recoveryCount ? 3500 : 900
  });
  if (!systemUiHealth.ok) {
    await writeLog(
      userId,
      account._id,
      'warn',
      'remote_open_app_system_ui_health_soft_fail',
      'App đã mở ở foreground nhưng System UI health-check chưa ổn định; vẫn trả kết quả mở app để người dùng kiểm tra.',
      systemUiHealth
    );
  }
  let home = null;
  if (packageName === defaultPackages.facebook) {
    home = await ensureFacebookHomeOrAuthOnOpen(account, userId, target, packageName, readiness, {
        fast: false,
        recentlyBooted: androidUi.waitedForBoot
      });
  }
  const finalResult = { ...result, target, readiness, systemUiHealth, home, androidUi, elapsedMs: Date.now() - startedAt };
  if (packageName === defaultPackages.facebook) {
    finalResult.ok = Boolean(result.ok && (home?.verified || home?.state?.name === 'auth_screen'));
    finalResult.facebookHomeVerified = Boolean(home?.verified);
    if (!finalResult.ok) {
      await writeLog(
        userId,
        account._id,
        'warn',
        'remote_open_facebook_not_ready',
        'Facebook đã mở nhưng chưa xác minh được Feed/Home hoặc màn xác thực.',
        {
          target,
          packageName,
          home,
          readiness,
          systemUiHealth
        }
      );
    }
  }
  return finalResult;
}

function isFacebookAuthActivity(activityName = '') {
  return /(?:^|\.)(Login|LoginActivity|Fb4aAuth|Registration|Checkpoint)/i.test(String(activityName || ''));
}

function createFacebookAuthForegroundResult(readiness = {}) {
  return {
    ok: true,
    verified: false,
    skipped: true,
    reason: 'facebook_auth_screen',
    state: {
      name: 'auth_screen',
      foregroundActivity: readiness.foregroundActivity || ''
    },
    warning: 'Facebook đã mở nhưng đang ở màn hình đăng nhập/xác thực, nên bỏ qua bước xác minh Feed/Home.'
  };
}

async function ensureFacebookHomeOrAuthOnOpen(account, userId, target, packageName, readiness = {}, options = {}) {
  invalidateUiDump(target);
  const nodes = await dumpVisibleNodes(target);
  const state = await resolveFacebookOpenState(target, await detectFacebookState(target, '', nodes));
  if (isVerifiedFacebookHomeState(state)) {
    await writeLog(userId, account._id, 'info', 'remote_open_facebook_home', 'Facebook đã sẵn sàng tại trang chủ.', {
      state,
      foregroundActivity: readiness.foregroundActivity || ''
    });
    return { ok: true, verified: true, state, activityMismatch: isFacebookAuthActivity(readiness.foregroundActivity) };
  }

  if (state.name === 'blocked' && isFacebookAuthActivity(readiness.foregroundActivity)) {
    return createFacebookAuthForegroundResult(readiness);
  }

  return ensureFacebookHomeOnOpen(account, userId, target, packageName, options);
}

function summarizeRecoverySteps(steps = []) {
  return steps.map((step) => ({
    ok: Boolean(step?.ok),
    launchMethod: step?.launchMethod || step?.method || '',
    durationMs: step?.durationMs || null,
    code: step?.code || null,
    error: step?.error || step?.stderr ? String(step.error || step.stderr).slice(0, 300) : ''
  }));
}

export async function openAccountApp(account, userId, appPackage) {
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform] || '';
  const operationKey = `${account._id}:${packageName}`;
  const existing = openAppInFlight.get(operationKey);
  if (existing) {
    await writeLog(
      userId,
      account._id,
      'info',
      'remote_open_app_join_existing',
      'Yêu cầu mở app đang được xử lý; dùng chung tiến trình hiện tại.'
    );
    return existing;
  }

  const operation = performOpenAccountApp(account, userId, appPackage);
  openAppInFlight.set(operationKey, operation);
  try {
    return await operation;
  } finally {
    if (openAppInFlight.get(operationKey) === operation) {
      openAppInFlight.delete(operationKey);
    }
  }
}

async function launchAppWarm(target, packageName) {
  const launch = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'monkey',
    '-p',
    packageName,
    '-c',
    'android.intent.category.LAUNCHER',
    '1'
  ], { timeoutMs: 8_000 });
  return { ...launch, launchMethod: 'warm_monkey' };
}

async function launchAppWarmLauncherActivity(target, packageName) {
  const resolve = await getLauncherActivityComponent(target, packageName);
  if (resolve.component) {
    const launch = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.MAIN',
      '-c',
      'android.intent.category.LAUNCHER',
      '-n',
      resolve.component,
      '-f',
      '0x14000000'
    ], { timeoutMs: 18_000 });
    if (launch.ok && !/error:|unable to resolve/i.test(`${launch.stdout || ''}\n${launch.stderr || ''}`)) {
      return { ...launch, launchMethod: 'warm_launcher_activity', launcherComponent: resolve.component };
    }
    return {
      ...launch,
      launchMethod: 'warm_launcher_activity_failed',
      launcherComponent: resolve.component
    };
  }
  const fallback = await launchAppWarm(target, packageName);
  return {
    ...fallback,
    launchMethod: 'warm_monkey_fallback',
    resolveError: resolve.error || resolve.stderr || resolve.stdout || ''
  };
}

async function launchFacebookWarm(target, packageName) {
  const launcher = await launchAppWarmLauncherActivity(target, packageName);
  if (launcher.ok && !/failed/i.test(launcher.launchMethod || '')) {
    return { ...launcher, launchMethod: 'facebook_warm_launcher_activity' };
  }

  const feed = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'fb://feed',
    '-p',
    packageName,
    '-f',
    '0x14000000'
  ], { timeoutMs: 8_000 });
  const output = `${feed.stdout || ''}\n${feed.stderr || ''}`;
  if (isSuccessfulFacebookLaunchOutput(feed, packageName)) {
    return {
      ...feed,
      launchMethod: 'facebook_warm_feed_uri',
      launcherError: launcher.error || launcher.stderr || launcher.stdout || ''
    };
  }
  return {
    ...launcher,
    launchMethod: launcher.launchMethod || 'facebook_warm_launcher_failed',
    feedError: feed.error || feed.stderr || feed.stdout || ''
  };
}

async function launchAppFresh(target, packageName, options = {}) {
  if (!options.noForceStop) {
    await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 });
  }
  const resolve = await getLauncherActivityComponent(target, packageName);
  const component = resolve.component;
  if (component) {
    const launch = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.MAIN',
      '-c',
      'android.intent.category.LAUNCHER',
      '-n',
      component,
      '-f',
      '0x14000000'
    ], { timeoutMs: 25_000 });
    if (launch.ok && !/error:|unable to resolve/i.test(`${launch.stdout || ''}\n${launch.stderr || ''}`)) {
      return { ...launch, launchMethod: 'launcher_activity', launcherComponent: component };
    }
  }

  const fallback = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'], { timeoutMs: 20_000 });
  return {
    ...fallback,
    launchMethod: 'monkey_fallback',
    resolveError: resolve.error || resolve.stderr || resolve.stdout || ''
  };
}

async function waitForAppForegroundReady(account, userId, target, packageName, timeoutMs = 18_000, options = {}) {
  const startedAt = Date.now();
  let lastForeground = null;
  let stableForegroundCount = 0;
  const stableChecks = Math.max(1, Number(options.stableChecks || 2));
  const requireVisibleUi = options.requireVisibleUi !== false;
  while (Date.now() - startedAt < timeoutMs) {
    await delay(stableForegroundCount ? 350 : 450);
    const foreground = await getForegroundAndroidPackage(target);
    lastForeground = foreground;
    if (foreground.packageName !== packageName) {
      stableForegroundCount = 0;
      continue;
    }

    stableForegroundCount += 1;
    let nodes = [];
    if (requireVisibleUi && stableForegroundCount >= stableChecks) {
      nodes = await dumpVisibleNodes(target);
    }
    const hasVisibleUi = !requireVisibleUi || nodes.length >= 3;
    if (stableForegroundCount >= stableChecks && hasVisibleUi) {
      const ready = {
        ok: true,
        target,
        packageName,
        foregroundPackage: foreground.packageName,
        foregroundActivity: foreground.activityName,
        nodeCount: nodes.length,
        elapsedMs: Date.now() - startedAt
      };
      await writeLog(userId, account._id, 'info', 'remote_open_app_ready', `App ${packageName} đã ổn định ở foreground.`, ready);
      return ready;
    }
  }

  const failed = {
    ok: false,
    target,
    packageName,
    foregroundPackage: lastForeground?.packageName || '',
    foregroundActivity: lastForeground?.activityName || '',
    elapsedMs: Date.now() - startedAt,
    error: `App ${packageName} chưa lên foreground ổn định.`
  };
  await writeLog(userId, account._id, 'warn', 'remote_open_app_not_ready', failed.error, failed);
  return failed;
}

async function launchFacebookFresh(target, packageName) {
  await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 });
  const launcher = await launchAppFresh(target, packageName, { noForceStop: true });
  if (launcher.ok) {
    return {
      ...launcher,
      launchMethod: launcher.launchMethod === 'launcher_activity'
        ? 'facebook_fresh_launcher_activity'
        : `facebook_fresh_${launcher.launchMethod || 'launcher'}`
    };
  }

  const feed = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'fb://feed',
    '-p',
    packageName,
    '-f',
    '0x14000000'
  ], { timeoutMs: 20_000 });
  if (isSuccessfulFacebookLaunchOutput(feed, packageName)) {
    return {
      ...feed,
      launchMethod: 'facebook_feed_uri',
      launcherError: launcher.error || launcher.stderr || launcher.stdout || ''
    };
  }

  return {
    ...feed,
    launchMethod: 'facebook_feed_uri_failed',
    launcherError: launcher.error || launcher.stderr || launcher.stdout || '',
    feedError: feed.error || feed.stderr || feed.stdout || ''
  };
}

function isSuccessfulFacebookLaunchOutput(result, packageName) {
  if (!result?.ok) return false;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (/error:|unable to resolve|activity not started/i.test(output)) return false;
  const activityPackage = output.match(/Activity:\s*([A-Za-z0-9._]+)\//i)?.[1] || '';
  if (activityPackage && activityPackage !== packageName) return false;
  return true;
}

async function ensureFacebookHomeOnOpen(account, userId, target, packageName, options = {}) {
  await delay(options.recentlyBooted ? 1400 : (options.fast ? 350 : 1200));
  let initialNodes = await dumpVisibleNodes(target);
  const rememberedAccountContinue = findNodeInNodes(initialNodes, rememberedAccountContinueLabels, { exact: true });
  if (rememberedAccountContinue) {
    const point = {
      x: Math.round((rememberedAccountContinue.left + rememberedAccountContinue.right) / 2),
      y: Math.round((rememberedAccountContinue.top + rememberedAccountContinue.bottom) / 2)
    };
    const continueResult = await tapAndLog(
      userId,
      account._id,
      target,
      'remote_open_facebook_continue_account',
      point
    );
    await writeLog(
      userId,
      account._id,
      continueResult.ok ? 'info' : 'warn',
      'remote_open_facebook_continue_account',
      continueResult.ok ? 'Đã xác nhận tiếp tục bằng tài khoản Facebook đã lưu.' : 'Không bấm được nút Tiếp tục của Facebook.',
      { point, label: rememberedAccountContinue.label, continueResult }
    );
    await delay(1800);
    invalidateUiDump(target);
    const health = await waitForSystemUiHealthy(account, userId, target, {
      phase: 'after_remembered_account_continue',
      stableChecks: 2,
      maxAttempts: 6
    });
    if (!health.ok) throw new Error(health.error);
    initialNodes = await dumpVisibleNodes(target);
  }
  let state = await resolveFacebookOpenState(target, await detectFacebookState(target, '', initialNodes));
  if (state.name === 'system_anr') {
    const recovered = await recoverSystemUiAnr(account, userId, target, state);
    if (!recovered.ok) throw new Error('System UI của LDPlayer không phản hồi.');
    invalidateUiDump(target);
    state = await detectFacebookState(target, '');
  }
  if (state.name === 'blocked') {
    throwFacebookBlockedError(state);
  }
  if (isVerifiedFacebookHomeState(state)) {
    await writeLog(userId, account._id, 'info', 'remote_open_facebook_home', 'Facebook đã sẵn sàng tại trang chủ.', { state });
    return { ok: true, verified: true, state };
  }

  if (['discard_dialog', 'ready_to_post', 'composer', 'stale_composer', 'text_editor'].includes(state.name)) {
    const normalized = await discardStaleFacebookComposer(account, userId, target, state);
    state = normalized.state;
    if (isVerifiedFacebookHomeState(state)) {
      await writeLog(userId, account._id, 'info', 'remote_open_facebook_home', 'Đã đóng phiên soạn bài cũ và đưa Facebook về trang chủ.', {
        state,
        recovery: normalized
      });
      return { ok: true, verified: true, state, recovery: normalized };
    }
  }

  if (options.fast && state.name === 'unknown') {
    const active = await getForegroundAndroidPackage(target);
    if (active.packageName === packageName) {
      const feed = await launchFacebookWarm(target, packageName);
      await delay(500);
      invalidateUiDump(target);
      state = await detectFacebookState(target, '');
      if (isVerifiedFacebookHomeState(state)) {
        return { ok: true, verified: true, state, active, feed, fastPath: true };
      }
    }
  }

  const active = await getForegroundAndroidPackage(target);
  const recoverySteps = [];
  if (active.packageName === packageName) {
    const nodes = await dumpVisibleNodes(target);
    const homeNode = findNodeInNodes(nodes, facebookHomeLabels, { exact: true });
    if (homeNode) {
      const homePoint = {
        x: Math.round((homeNode.left + homeNode.right) / 2),
        y: Math.round((homeNode.top + homeNode.bottom) / 2)
      };
      recoverySteps.push(await tapAndLog(userId, account._id, target, 'remote_open_facebook_home_tab', homePoint));
      await delay(900);
      state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
    }
  }

  if (!isVerifiedFacebookHomeState(state)) {
    const feed = await launchFacebookWarm(target, packageName);
    recoverySteps.push(feed);
    await delay(1000);
    invalidateUiDump(target);
    state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
  }

  if (!isVerifiedFacebookHomeState(state) && options.fast) {
    const fastActive = await getForegroundAndroidPackage(target);
    await writeLog(
      userId,
      account._id,
      fastActive.packageName === packageName ? 'warn' : 'error',
      'remote_open_facebook_home_fast_skip',
      fastActive.packageName === packageName
        ? 'Facebook đã mở ở foreground; bỏ qua recovery Home nâng cao để phản hồi nhanh.'
        : 'Đã thử mở Facebook nhưng lần kiểm tra nhanh chưa thấy Facebook ở foreground.',
      { state, fastActive, recoverySteps: summarizeRecoverySteps(recoverySteps) }
    );
    return {
      ok: fastActive.packageName === packageName,
      verified: false,
      state,
      recoveryStepCount: recoverySteps.length,
      finalActive: fastActive,
      fastSkipped: true,
      warning: fastActive.packageName === packageName
        ? 'Facebook đã mở ở foreground nhưng chưa xác minh được Feed/Home.'
        : 'Facebook chưa được xác nhận ở foreground sau lần mở nhanh.'
    };
  }

  if (!isVerifiedFacebookHomeState(state)) {
    const fresh = await launchFacebookFresh(target, packageName);
    recoverySteps.push(fresh);
    await delay(options.recentlyBooted ? 2200 : 1500);
    invalidateUiDump(target);
    state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
    if (['discard_dialog', 'ready_to_post', 'composer', 'stale_composer', 'text_editor'].includes(state.name)) {
      const normalized = await discardStaleFacebookComposer(account, userId, target, state);
      recoverySteps.push(...normalized.steps);
      state = normalized.state;
    }
  }

  if (!isVerifiedFacebookHomeState(state) && ['discard_dialog', 'ready_to_post', 'composer', 'stale_composer', 'text_editor'].includes(state.name)) {
    const hardReset = await resetFacebookToFeed(account, userId, target, packageName, state);
    recoverySteps.push(hardReset);
    state = hardReset.state;
  }

  const verified = isVerifiedFacebookHomeState(state);
  await writeLog(
    userId,
    account._id,
    verified ? 'info' : 'warn',
    'remote_open_facebook_home',
    verified ? 'Facebook đã sẵn sàng tại trang chủ.' : 'Facebook đã mở nhưng chưa xác minh được màn Feed/Home.',
    { state, active, recoverySteps: summarizeRecoverySteps(recoverySteps) }
  );
  if (state.name === 'blocked') {
    throwFacebookBlockedError(state);
  }
  let finalActive = await getForegroundAndroidPackage(target);
  if (finalActive.packageName !== packageName && !finalActive.packageName) {
    const retryReady = await ensureDeviceReady(account, userId, target, 3);
    target = retryReady.resolvedTarget || target;
    if (retryReady.ok && String(retryReady.stdout || '').trim() === 'device') {
      finalActive = await getForegroundAndroidPackage(target);
    }
    if (finalActive.packageName !== packageName && active.packageName === packageName) {
      finalActive = { ...active, reusedAfterTransientFailure: true, retryReady };
    }
    if (
      finalActive.packageName !== packageName
      && active.packageName === packageName
      && isTransientAdbFailure(finalActive.error || '')
    ) {
      finalActive = { ...active, reusedAfterTransientFailure: true, transientForegroundError: finalActive.error || '' };
    }
  }
  if (finalActive.packageName !== packageName) {
    if (verified) {
      await writeLog(
        userId,
        account._id,
        'warn',
        'remote_open_facebook_foreground_transient_after_home',
        'UI đã xác minh Facebook Home nhưng foreground check cuối chưa ổn định; vẫn xem là mở thành công.',
        { finalActive, target, packageName, state }
      );
      return {
        ok: true,
        verified: true,
        state,
        recoverySteps,
        finalActive,
        foregroundTransient: true
      };
    }
    const error = new Error('Facebook chưa mở thành công trên LDPlayer.');
    error.code = 'FACEBOOK_APP_NOT_FOREGROUND';
    error.details = { finalActive, target, packageName, state };
    throw error;
  }
  if (!verified) {
    return {
      ok: true,
      verified: false,
      state,
      recoveryStepCount: recoverySteps.length,
      finalActive,
      warning: 'Facebook đã mở ở foreground nhưng chưa xác minh được Feed/Home.'
    };
  }
  return { ok: true, verified: true, state, recoverySteps, finalActive };
}

async function resetFacebookToFeed(account, userId, target, packageName, previousState = {}) {
  const fresh = await launchFacebookFresh(target, packageName);
  await delay(2200);
  invalidateUiDump(target);
  let state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
  if (!isVerifiedFacebookHomeState(state) && state.name !== 'blocked') {
    const warm = await launchFacebookWarm(target, packageName);
    await delay(1200);
    invalidateUiDump(target);
    state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
    const result = { ok: isVerifiedFacebookHomeState(state), method: 'force_stop_then_feed_retry', previousState, fresh, warm, state };
    await writeLog(
      userId,
      account._id,
      result.ok ? 'info' : 'warn',
      'remote_open_facebook_hard_reset',
      result.ok ? 'Đã force-stop Facebook và mở lại Feed để thoát composer cũ.' : 'Force-stop Facebook chưa đưa được về Feed/Home.',
      result
    );
    return result;
  }

  const result = { ok: isVerifiedFacebookHomeState(state), method: 'force_stop_then_feed', previousState, fresh, state };
  await writeLog(
    userId,
    account._id,
    result.ok ? 'info' : 'warn',
    'remote_open_facebook_hard_reset',
    result.ok ? 'Đã force-stop Facebook và mở lại Feed để thoát composer cũ.' : 'Force-stop Facebook chưa đưa được về Feed/Home.',
    result
  );
  return result;
}

function isVerifiedFacebookHomeState(state) {
  return state?.name === 'home' && ['composer_entry_visible', 'main_tab_activity_after_feed_launch'].includes(state?.reason);
}

function throwFacebookBlockedError(state = {}) {
  const error = new Error('Facebook đang yêu cầu đăng nhập hoặc xác minh tài khoản.');
  error.code = 'FACEBOOK_ACCOUNT_BLOCKED';
  error.details = { state };
  throw error;
}

async function resolveFacebookOpenState(target, state) {
  const active = await getForegroundAndroidPackage(target);
  if (
    active.packageName
    && active.packageName !== defaultPackages.facebook
    && ['home', 'ready_to_post', 'composer', 'stale_composer', 'text_editor'].includes(state?.name)
  ) {
    return {
      ...state,
      name: 'unknown',
      reason: `non_facebook_foreground:${active.packageName}`,
      active,
      correctedFrom: state
    };
  }
  if (/ComposerActivity/i.test(active.activityName || '')) {
    if (['ready_to_post', 'composer', 'stale_composer', 'text_editor', 'discard_dialog'].includes(state?.name)) {
      return state;
    }
    return {
      ...state,
      name: 'composer',
      reason: 'foreground_composer_activity',
      active
    };
  }
  if (
    active.packageName === defaultPackages.facebook
    && /(?:FbMainTabActivity|MainTab|NewsFeed|Feed)/i.test(active.activityName || '')
    && ['ready_to_post', 'composer', 'stale_composer', 'text_editor'].includes(state?.name)
  ) {
    invalidateUiDump(target);
    const nodes = await dumpVisibleNodes(target);
    const stillInComposer = Boolean(
      findNodeInNodes(nodes, postTitleLabels)
      || findNodeInNodes(nodes, doneLabels, { exact: true })
      || findNodeInNodes(nodes, closeComposerLabels, { exact: true })
      || findNodeInNodes(nodes, discardPostLabels, { exact: true })
    );
    if (stillInComposer) {
      return {
        ...state,
        active,
        reason: state?.reason || 'main_tab_still_in_composer'
      };
    }
    if (findNodeInNodes(nodes, composerLabels)) {
      return {
        name: 'home',
        reason: 'composer_entry_visible',
        hasTargetText: state?.hasTargetText || false,
        hasAttachedImage: false,
        active,
        correctedFrom: state
      };
    }
    if (findNodeInNodes(nodes, facebookHomeLabels)) {
      return {
        name: 'home',
        reason: 'main_tab_activity_after_feed_launch',
        hasTargetText: state?.hasTargetText || false,
        hasAttachedImage: false,
        active,
        correctedFrom: state
      };
    }
    return {
      name: 'home',
      reason: 'main_tab_activity_after_feed_launch',
      hasTargetText: state?.hasTargetText || false,
      hasAttachedImage: false,
      active,
      correctedFrom: state
    };
  }
  return state;
}

async function discardStaleFacebookComposer(account, userId, target, initialState) {
  let state = initialState;
  const steps = [];

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (isVerifiedFacebookHomeState(state)) return { ok: true, state, steps, attempt };
    const previousStateName = state.name;
    const nodes = await dumpVisibleNodes(target);

    if (state.name === 'discard_dialog') {
      const discard = findNodeInNodes(nodes, discardPostLabels, { exact: true });
      if (discard) {
        const point = {
          x: Math.round((discard.left + discard.right) / 2),
          y: Math.round((discard.top + discard.bottom) / 2)
        };
        const result = await tapAndLog(userId, account._id, target, 'remote_open_app_discard_stale_draft', point);
        steps.push(result);
      } else {
        const back = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '4'], { timeoutMs: 5_000 });
        invalidateUiDump(target);
        steps.push(back);
      }
      await delay(700);
    } else {
      const close = findNodeInNodes(nodes, closeComposerLabels, { exact: true });
      let closeResult;
      if (close) {
        closeResult = await tapAndLog(
          userId,
          account._id,
          target,
          'remote_open_app_close_stale_composer',
          {
            x: Math.round((close.left + close.right) / 2),
            y: Math.round((close.top + close.bottom) / 2)
          }
        );
      } else {
        closeResult = await runCommand(
          env.mobileAutomation.adbPath,
          ['-s', target, 'shell', 'input', 'keyevent', '4'],
          { timeoutMs: 5_000 }
        );
        invalidateUiDump(target);
      }
      steps.push(closeResult);
      await writeLog(
        userId,
        account._id,
        closeResult.ok ? 'info' : 'warn',
        'remote_open_app_close_stale_composer',
        closeResult.ok ? 'Đã đóng màn soạn bài còn lại từ phiên trước.' : 'Không đóng được màn soạn bài cũ.',
        { attempt, previousState: state.name, method: close ? 'close_button' : 'back_key', closeResult }
      );
      await delay(700);
      if (!closeResult.ok) break;
    }

    invalidateUiDump(target);
    state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
    if (state.name === previousStateName && state.name !== 'discard_dialog' && attempt >= 3) {
      const feed = await launchFacebookWarm(target, defaultPackages.facebook);
      steps.push(feed);
      await delay(900);
      invalidateUiDump(target);
      state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
    }
  }

  if (!isVerifiedFacebookHomeState(state)) {
    const feed = await launchFacebookWarm(target, defaultPackages.facebook);
    steps.push(feed);
    await delay(900);
    invalidateUiDump(target);
    state = await resolveFacebookOpenState(target, await detectFacebookState(target, ''));
  }

  return { ok: isVerifiedFacebookHomeState(state), state, steps, attempt: steps.length };
}

async function getForegroundAndroidPackage(target) {
  const activity = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'dumpsys',
    'activity',
    'activities'
  ], { timeoutMs: 10_000 });
  const activityOutput = `${activity.stdout || ''}\n${activity.stderr || ''}`;
  const resumed = activityOutput.match(/mResumedActivity:.*?\s([A-Za-z0-9._]+)\/([A-Za-z0-9.$_]+)/)
    || activityOutput.match(/topResumedActivity=.*?\s([A-Za-z0-9._]+)\/([A-Za-z0-9.$_]+)/);
  if (resumed) {
    return {
      ok: true,
      packageName: resumed[1],
      activityName: resumed[2],
      source: 'resumed_activity',
      error: ''
    };
  }

  const focus = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'dumpsys',
    'window',
    'windows'
  ], { timeoutMs: 10_000 });
  const output = `${focus.stdout || ''}\n${focus.stderr || ''}`;
  const match = output.match(/mCurrentFocus=.*?\s([A-Za-z0-9._]+)\/([A-Za-z0-9.$_]+)/)
    || output.match(/mFocusedApp=.*?ActivityRecord\{.*?\s([A-Za-z0-9._]+)\/([A-Za-z0-9.$_]+)/);
  return {
    ok: activity.ok || focus.ok,
    packageName: match?.[1] || '',
    activityName: match?.[2] || '',
    source: match ? 'focused_window' : 'unknown',
    error: activity.ok || focus.ok ? '' : (focus.error || focus.stderr || activity.error || activity.stderr || '')
  };
}

export async function closeAccountSession(account, userId, appPackage) {
  let target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  const instanceBeforeClose = await getLdPlayerInstanceInfo(account.instanceName);
  if (env.mobileAutomation.ldRuntimeHelperUrl && !account.adbHost && instanceBeforeClose) {
    const helperClose = await closeLdPlayerViaRuntimeHelper(account, userId, instanceBeforeClose, packageName);
    if (helperClose.ok) {
      accountRuntimeTargets.delete(account._id);
      if (target) {
        androidUiReadyCache.delete(target);
        invalidateUiDump(target);
      }
      return {
        app: { ok: true, skipped: true, helper: true },
        powerOff: null,
        ldplayer: helperClose,
        cleanup: { ok: true, helper: true, target: helperClose.target },
        ok: true
      };
    }
    await writeLog(
      userId,
      account._id,
      'warn',
      'ld_runtime_helper_close_fallback',
      'LD runtime helper chưa đóng sạch instance; fallback về cleanup nội bộ.',
      helperClose
    );
  }
  const result = {
    app: null,
    powerOff: null,
    ldplayer: null,
    cleanup: null
  };

  if (instanceBeforeClose?.running) {
    target = await normalizeAccountDeviceTarget(account, target);
  }

  if (target && packageName) {
    const app = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 });
    result.app = app;
    await writeLog(userId, account._id, app.ok ? 'info' : 'warn', 'remote_close_app', app.ok ? `Đã đóng app ${packageName}.` : `Không đóng được app ${packageName}.`, app);
  }

  if (account.instanceName) {
    const instance = await getLdPlayerInstanceInfo(account.instanceName);
    const quitArgs = Number.isInteger(instance?.index)
      ? ['quit', '--index', String(instance.index)]
      : ['quit', '--name', account.instanceName];
    const ldplayer = await runCommand(env.mobileAutomation.ldconsolePath, quitArgs, { timeoutMs: 10_000 });
    result.ldplayer = ldplayer;
    await writeLog(userId, account._id, ldplayer.ok ? 'info' : 'warn', 'remote_close_ldplayer', ldplayer.ok ? `Đã tắt ${account.instanceName}.` : `Không tắt được ${account.instanceName}.`, ldplayer);
    result.cleanup = await ensureLdPlayerInstanceStopped(account, userId, target, {
      processId: instanceBeforeClose?.processId || null,
      boxProcessId: instanceBeforeClose?.boxProcessId || null
    });
  }

  accountRuntimeTargets.delete(account._id);
  if (target) {
    androidUiReadyCache.delete(target);
    invalidateUiDump(target);
  }
  return {
    ...result,
    ok: account.instanceName ? Boolean(result.cleanup?.ok) : Boolean(result.app?.ok)
  };
}

async function closeLdPlayerViaRuntimeHelper(account, userId, instance = null, packageName = '') {
  const startedAt = Date.now();
  const helperUrl = String(env.mobileAutomation.ldRuntimeHelperUrl || '').replace(/\/+$/, '');
  const index = Number.isInteger(instance?.index)
    ? instance.index
    : inferLdPlayerIndex(account.instanceName);
  const target = instance?.target || getDeviceTarget(account) || (Number.isInteger(index) ? `emulator-${5554 + (index * 2)}` : '');
  if (!helperUrl || !Number.isInteger(index) || !target) {
    return {
      ok: false,
      skipped: true,
      elapsedMs: Date.now() - startedAt,
      error: 'Thiếu helper URL, LD index hoặc target.'
    };
  }

  try {
    const response = await fetch(`${helperUrl}/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        index,
        target,
        instanceName: account.instanceName,
        packageName
      }),
      signal: AbortSignal.timeout(90_000)
    });
    const result = await response.json().catch(() => ({}));
    const normalized = {
      ...result,
      ok: response.ok && Boolean(result.ok),
      helperUrl,
      elapsedMs: Date.now() - startedAt,
      target: result.target || target
    };
    await writeLog(
      userId,
      account._id,
      normalized.ok ? 'info' : 'warn',
      normalized.ok ? 'ld_runtime_helper_closed' : 'ld_runtime_helper_close_failed',
      normalized.ok
        ? `${account.instanceName} đã đóng sạch qua LD runtime helper.`
        : `${account.instanceName} chưa đóng sạch qua LD runtime helper.`,
      normalized
    );
    return normalized;
  } catch (error) {
    const result = {
      ok: false,
      helperUrl,
      elapsedMs: Date.now() - startedAt,
      target,
      error: error.message
    };
    await writeLog(userId, account._id, 'warn', 'ld_runtime_helper_close_unreachable', 'Không gọi được LD runtime helper để đóng LD.', result);
    return result;
  }
}

async function ensureLdPlayerInstanceStopped(account, userId, target, expectedProcesses = {}) {
  await delay(1_200);
  let stableStoppedChecks = 0;
  let lastAliveProcessIds = [];
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const instance = await getLdPlayerInstanceInfo(account.instanceName);
    lastAliveProcessIds = await getAliveProcessIds([
      expectedProcesses.processId,
      expectedProcesses.boxProcessId
    ]);
    if (!instance?.running && lastAliveProcessIds.length === 0) {
      stableStoppedChecks += 1;
      if (stableStoppedChecks >= 3) {
        const device = target
          ? await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 1_000 })
          : { ok: false };
        const cleanup = {
          ok: true,
          attempt,
          stableStoppedChecks,
          adbStillOnline: Boolean(device.ok)
        };
        await writeLog(userId, account._id, 'info', 'remote_close_ldplayer_confirmed', `${account.instanceName} đã dừng hoàn toàn.`, cleanup);
        return cleanup;
      }
    } else {
      stableStoppedChecks = 0;
    }

    if ([8, 16, 24].includes(attempt)) {
      const instanceIndex = Number(instance?.index);
      const quitArgs = Number.isInteger(instanceIndex)
        ? ['quit', '--index', String(instanceIndex)]
        : ['quit', '--name', account.instanceName];
      await runCommand(env.mobileAutomation.ldconsolePath, quitArgs, { timeoutMs: 8_000 });
    }
    if ([12, 22].includes(attempt) && !instance?.running && lastAliveProcessIds.length) {
      for (const processId of lastAliveProcessIds) {
        await runCommand('taskkill.exe', ['/F', '/PID', String(processId)], { timeoutMs: 8_000 });
      }
    }
    await delay(750);
  }

  const cleanup = {
    ok: false,
    aliveProcessIds: lastAliveProcessIds,
    error: `${account.instanceName} chưa giải phóng hoàn toàn tiến trình máy ảo.`
  };
  await writeLog(userId, account._id, 'warn', 'remote_close_ldplayer_incomplete', cleanup.error, cleanup);
  return cleanup;
}

async function getAliveProcessIds(processIds = []) {
  const candidates = Array.from(new Set(
    processIds
      .map(Number)
      .filter((processId) => Number.isInteger(processId) && processId > 0)
  ));
  if (!candidates.length) return [];

  const result = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    `(Get-Process -Id ${candidates.join(',')} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)`
  ], { timeoutMs: 5_000 });
  if (!result.ok && !result.stdout) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export async function remoteTap(account, userId, x, y) {
  const target = await getReadyRemoteTarget(account, userId, 'tap');
  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_tap', result.ok ? `Tap ${Math.round(x)},${Math.round(y)}.` : 'Tap lỗi.', result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Tap failed.');
  return result;
}

export async function remoteSwipe(account, userId, fromX, fromY, toX, toY, duration = 350) {
  const target = await getReadyRemoteTarget(account, userId, 'swipe');
  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'swipe', String(Math.round(fromX)), String(Math.round(fromY)), String(Math.round(toX)), String(Math.round(toY)), String(duration)]);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_swipe', result.ok ? 'Đã swipe màn hình.' : 'Swipe lỗi.', result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Swipe failed.');
  return result;
}

export async function remoteText(account, userId, text) {
  const target = await getReadyRemoteTarget(account, userId, 'text');
  const result = await inputDeviceText(target, text);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_text', result.ok ? 'Đã nhập text vào LDPlayer.' : 'Nhập text lỗi.', {
    ...result,
    args: ['-s', target, 'shell', result.method || 'input_text', '***']
  });
  if (!result.ok) throw new Error(result.error || result.stderr || 'Input text failed.');
  return result;
}

export async function remoteKey(account, userId, key) {
  const target = await getReadyRemoteTarget(account, userId, 'key');
  const keyCodes = {
    back: '4',
    home: '3',
    enter: '66',
    recent: '187',
    power: '26'
  };
  const code = keyCodes[key] || String(key);
  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', code]);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_key', result.ok ? `Đã gửi phím ${key}.` : `Gửi phím lỗi ${key}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Key event failed.');
  return result;
}

async function getReadyRemoteTarget(account, userId, action = 'remote') {
  const initialTarget = getDeviceTarget(account);
  if (!initialTarget) throw new Error('Thiếu deviceId hoặc adbHost.');
  const ready = await ensureDeviceReady(account, userId, initialTarget, 3);
  const target = ready.resolvedTarget || initialTarget;
  if (!ready.ok || String(ready.stdout || '').trim() !== 'device') {
    await writeLog(userId, account._id, 'error', 'remote_target_not_ready', `ADB ${target} chưa sẵn sàng cho lệnh ${action}.`, ready);
    throw new Error(ready.error || ready.stderr || `ADB ${target} chưa sẵn sàng.`);
  }
  return target;
}

function getDeviceTarget(account) {
  const runtimeTarget = accountRuntimeTargets.get(account?._id);
  if (runtimeTarget) return runtimeTarget;
  if (env.mobileAutomation.commandMock && account?.deviceId) return account.deviceId;
  if (account.deviceId && /^emulator-\d+$/.test(account.deviceId)) return account.deviceId;
  if (account.deviceId && /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(account.deviceId)) return account.deviceId;
  if (account.adbHost && /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(account.adbHost)) return account.adbHost;
  if (account.adbHost && /^emulator-\d+$/.test(account.adbHost)) return account.adbHost;
  return defaultAdbHost;
}

function buildAutomationConfig(account, override = {}) {
  const metadata = account.metadata || {};
  const loginSteps = {
    ...defaultLoginSteps,
    ...(metadata.loginSteps || {}),
    ...(override.loginSteps || {})
  };

  return {
    appPackage: override.appPackage || metadata.appPackage || defaultPackages[account.platform],
    username: override.username || metadata.username || account.accountHandle || '',
    password: override.password ? decryptSecret(override.password) : decryptSecret(metadata.password || ''),
    loginSteps
  };
}

function buildPostConfig(account, override = {}) {
  const metadata = account.metadata || {};
  const configuredComposerTap = override.composerTap || metadata.postSteps?.composerTap || defaultPostSteps.composerTap;
  const composerTap = configuredComposerTap?.x === 390 && configuredComposerTap?.y === 145
    ? defaultPostSteps.composerTap
    : configuredComposerTap;
  return {
    appPackage: override.appPackage || metadata.appPackage || defaultPackages[account.platform] || defaultPackages.facebook,
    composerTap,
    autoSubmit: Boolean(override.autoSubmit),
    textInputMode: 'stable',
    waitAfterSubmitMs: Math.max(0, Math.min(Number(override.waitAfterSubmitMs) || 0, 180_000))
  };
}

export async function probeDevice(account, userId, targetOverride = '') {
  const target = targetOverride || getDeviceTarget(account);
  if (!target) {
    await writeLog(userId, account._id, 'error', 'probe_device', 'Thiếu deviceId hoặc adbHost để kiểm tra thiết bị.');
    return { ok: false, error: 'Missing device target.' };
  }

  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state']);
  await writeLog(
    userId,
    account._id,
    result.ok && result.stdout === 'device' ? 'info' : 'error',
    'probe_device',
    result.ok ? `Thiết bị ${target}: ${result.stdout || 'unknown'}.` : `Không kiểm tra được thiết bị ${target}.`,
    result
  );
  return result;
}

export async function getAccountRuntimeStatus(account, appPackage) {
  let target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  if (!target) {
    return {
      target: '',
      deviceReady: false,
      appReady: false,
      foregroundPackage: ''
    };
  }

  let device = await runCommand(
    env.mobileAutomation.adbPath,
    ['-s', target, 'get-state'],
    { timeoutMs: 5_000 }
  );
  let deviceReady = device.ok && String(device.stdout || '').trim() === 'device';
  if (!deviceReady) {
    const instance = await getLdPlayerInstanceInfo(account.instanceName);
    const dynamicTarget = instance?.running
      ? await findAvailableEmulatorTarget(target, account.instanceName)
      : '';
    if (dynamicTarget) {
      target = dynamicTarget;
      device = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 5_000 });
      deviceReady = device.ok && String(device.stdout || '').trim() === 'device';
    }
  }
  if (!deviceReady) {
    return {
      target,
      deviceReady: false,
      appReady: false,
      foregroundPackage: ''
    };
  }

  const foreground = await getForegroundAndroidPackage(target);
  const appProcess = packageName
    ? await runCommand(
      env.mobileAutomation.adbPath,
      ['-s', target, 'shell', 'pidof', packageName],
      { timeoutMs: 4_000 }
    )
    : { ok: false, stdout: '' };
  const processId = String(appProcess.stdout || '').trim();
  const appInForeground = Boolean(packageName) && foreground.packageName === packageName;
  const appProcessAlive = Boolean(packageName) && appProcess.ok && Boolean(processId);
  let platformState = null;
  let readinessSummary = '';
  let appReady = appInForeground || appProcessAlive;
  if (packageName === defaultPackages.facebook) {
    if (appInForeground) {
      const nodes = await waitForVisibleNodes(target, { attempts: 3, delayMs: 700 });
      platformState = await resolveFacebookOpenState(target, await detectFacebookState(target, '', nodes));
      appReady = Boolean(isVerifiedFacebookHomeState(platformState));
      if (!appReady) {
        if (['discard_dialog', 'ready_to_post', 'composer', 'stale_composer', 'text_editor'].includes(platformState?.name)) {
          readinessSummary = 'Facebook đang ở màn soạn bài cũ. Bấm Mở Facebook để đóng composer và về trang chủ.';
        } else if (platformState?.name === 'blocked') {
          readinessSummary = 'Facebook đang yêu cầu đăng nhập hoặc xác minh tài khoản.';
        } else if (platformState?.name === 'system_anr') {
          readinessSummary = 'System UI đang không phản hồi, cần chờ hoặc recover LDPlayer.';
        } else {
          readinessSummary = 'Facebook đã mở nhưng chưa xác minh được trang chủ.';
        }
      }
    } else {
      appReady = false;
      readinessSummary = appProcessAlive
        ? 'Facebook đang chạy nền, cần mở về trang chủ.'
        : 'Facebook chưa mở trên màn hình LDPlayer.';
    }
  }
  return {
    target,
    deviceReady: true,
    appReady,
    appInForeground,
    appProcessAlive,
    processId,
    foregroundPackage: foreground.packageName,
    foregroundActivity: foreground.activityName,
    platformState,
    readinessSummary
  };
}

export async function getAccountPublishReadiness(account, userId, appPackage, options = {}) {
  let target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  const requireForegroundApp = options.requireAppForeground === true || packageName === defaultPackages.facebook;
  const startedAt = Date.now();
  const gates = [];
  const addGate = (key, label, ok, detail = '', metadata = {}) => {
    const gate = { key, label, ok: Boolean(ok), detail, metadata };
    gates.push(gate);
    return gate;
  };

  if (!target) {
    addGate('target', 'ADB target', false, 'Profile chưa có deviceId hoặc adbHost.');
    return buildPublishReadinessResult({ target: '', packageName, gates, startedAt });
  }

  const instance = await getLdPlayerInstanceInfo(account.instanceName);
  addGate(
    'ld_instance',
    'LDPlayer instance',
    Boolean(instance?.running),
    instance?.running
      ? `${account.instanceName} đang có process LDPlayer.`
      : `${account.instanceName} chưa chạy.`,
    { instance }
  );

  let device = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 5_000 });
  let deviceReady = device.ok && String(device.stdout || '').trim() === 'device';
  if (!deviceReady) {
    const dynamicTarget = instance?.running
      ? await findAvailableEmulatorTarget(target, account.instanceName)
      : '';
    if (dynamicTarget) {
      target = dynamicTarget;
      device = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 5_000 });
      deviceReady = device.ok && String(device.stdout || '').trim() === 'device';
    }
  }
  addGate(
    'adb_device',
    'ADB device',
    deviceReady,
    deviceReady ? `ADB ${target} đang ở trạng thái device.` : `ADB ${target} chưa sẵn sàng.`,
    { target, device }
  );

  if (!deviceReady) {
    const result = buildPublishReadinessResult({ target, packageName, gates, startedAt });
    await writeLog(userId, account._id, 'warn', 'publish_readiness_failed', result.summary, result);
    return result;
  }

  const androidUi = await ensureAndroidUiReady(account, userId, target, options.deep === false ? 2 : 4);
  addGate(
    'android_ui',
    'Android UI',
    androidUi.ok,
    androidUi.ok ? 'Android đã boot và launcher/window ổn định.' : 'Android UI chưa ổn định.',
    { androidUi }
  );

  const systemUi = await waitForSystemUiHealthy(account, userId, target, {
    phase: 'publish_readiness',
    stableChecks: 1,
    maxAttempts: options.deep === false ? 2 : 4,
    initialDelayMs: 200
  });
  addGate(
    'system_ui',
    'System UI',
    systemUi.ok,
    systemUi.ok ? 'Không phát hiện System UI ANR.' : (systemUi.error || 'System UI chưa ổn định.'),
    { systemUi }
  );

  const foreground = await getForegroundAndroidPackage(target);
  const appProcess = packageName
    ? await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'pidof', packageName], { timeoutMs: 4_000 })
    : { ok: false, stdout: '' };
  const processId = String(appProcess.stdout || '').trim();
  const appInForeground = Boolean(packageName) && foreground.packageName === packageName;
  const appProcessAlive = Boolean(packageName) && appProcess.ok && Boolean(processId);
  addGate(
    'app_foreground',
    'App foreground',
    requireForegroundApp ? appInForeground : true,
    appInForeground
      ? `${packageName} đang ở foreground.`
      : appProcessAlive
        ? `${packageName} đang chạy nền, chưa ở foreground.`
        : requireForegroundApp
          ? `${packageName || 'App'} chưa chạy foreground.`
          : `${packageName || 'App'} sẽ tự mở khi bắt đầu workflow.`,
    { foreground, processId, appProcessAlive, required: requireForegroundApp }
  );

  let nodeCount = 0;
  let platformState = null;
  if (appInForeground) {
    const nodes = await waitForVisibleNodes(target, {
      attempts: options.deep === false ? 3 : 6,
      delayMs: options.deep === false ? 600 : 850
    });
    nodeCount = nodes.length;
    addGate(
      'ui_nodes',
      'UIAutomator nodes',
      nodeCount >= 3,
      nodeCount >= 3 ? `Đọc được ${nodeCount} UI nodes.` : 'UIAutomator không đọc được màn hình.',
      { nodeCount }
    );
    if (packageName === defaultPackages.facebook) {
      platformState = await detectFacebookState(target, '', nodes);
      if (platformState?.name === 'system_anr') {
        const recovered = await recoverSystemUiAnr(account, userId, target, platformState);
        await writeLog(
          userId,
          account._id,
          recovered.ok ? 'info' : 'warn',
          'publish_readiness_system_ui_recovery',
          recovered.ok
            ? 'Readiness đã xử lý System UI ANR và kiểm tra lại Facebook state.'
            : 'Readiness phát hiện System UI ANR nhưng chưa phục hồi được.',
          { recovered, platformState }
        );
        if (recovered.ok) {
          invalidateUiDump(target);
          const recoveredNodes = await waitForVisibleNodes(target, { attempts: 4, delayMs: 700 });
          nodeCount = recoveredNodes.length;
          platformState = await detectFacebookState(target, '', recoveredNodes);
        }
      }
      addGate(
        'platform_state',
        'Facebook state',
        Boolean(platformState && !['unknown', 'system_anr', 'blocked'].includes(platformState.name)),
        platformState?.name
          ? `Facebook state: ${platformState.name} (${platformState.reason || 'unknown'}).`
          : 'Chưa nhận diện được Facebook state.',
        { platformState }
      );
    }
  } else {
    addGate(
      'ui_nodes',
      'UIAutomator nodes',
      !requireForegroundApp,
      requireForegroundApp ? 'Chưa đọc UI vì app chưa ở foreground.' : 'Bỏ qua đọc app UI trước vì workflow sẽ tự mở app.',
      { required: requireForegroundApp }
    );
    if (packageName === defaultPackages.facebook) {
      addGate('platform_state', 'Facebook state', false, 'Chưa nhận diện Facebook vì app chưa ở foreground.');
    }
  }

  const result = buildPublishReadinessResult({
    target,
    packageName,
    gates,
    startedAt,
    foreground,
    appInForeground,
    appProcessAlive,
    processId,
    nodeCount,
    platformState
  });
  await writeLog(userId, account._id, result.ok ? 'info' : 'warn', result.ok ? 'publish_readiness_ready' : 'publish_readiness_failed', result.summary, result);
  return result;
}

function buildPublishReadinessResult(context = {}) {
  const gates = Array.isArray(context.gates) ? context.gates : [];
  const blockingFailures = gates.filter((gate) => !gate.ok);
  const ok = blockingFailures.length === 0;
  const firstFailure = blockingFailures[0] || null;
  return {
    ok,
    target: context.target || '',
    packageName: context.packageName || '',
    elapsedMs: Date.now() - (context.startedAt || Date.now()),
    summary: ok
      ? 'LDPlayer đủ điều kiện chạy automation.'
      : (firstFailure?.detail || `${firstFailure?.label || 'Thiết bị'} chưa sẵn sàng.`),
    firstFailure,
    gates,
    deviceReady: gates.some((gate) => gate.key === 'adb_device' && gate.ok),
    appReady: ok,
    appInForeground: Boolean(context.appInForeground),
    appProcessAlive: Boolean(context.appProcessAlive),
    processId: context.processId || '',
    foregroundPackage: context.foreground?.packageName || '',
    foregroundActivity: context.foreground?.activityName || '',
    nodeCount: context.nodeCount || 0,
    platformState: context.platformState || null
  };
}

export async function runMobileLogin(account, userId, override = {}) {
  const target = getDeviceTarget(account);
  const config = buildAutomationConfig(account, override);

  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!config.appPackage) throw new Error('Thiếu Android package name của app.');
  if (!config.username || !config.password) throw new Error('Thiếu username hoặc password để đăng nhập.');

  account.status = 'logging_in';
  await account.save();
  await writeLog(userId, account._id, 'info', 'login_started', `Bắt đầu đăng nhập ${account.displayName}.`, {
    instanceName: account.instanceName,
    target,
    appPackage: config.appPackage
  });

  const steps = [];
  const launch = await runCommand(env.mobileAutomation.ldconsolePath, ['launch', '--name', account.instanceName]);
  steps.push(launch);
  await writeLog(userId, account._id, launch.ok ? 'info' : 'warn', 'launch_ldplayer', launch.ok ? 'Đã gửi lệnh mở LDPlayer.' : 'Không mở được LDPlayer bằng ldconsole.', launch);
  await delay(env.mobileAutomation.launchWaitMs);

  if (account.adbHost) {
    const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', account.adbHost]);
    steps.push(connect);
    await writeLog(userId, account._id, connect.ok ? 'info' : 'error', 'adb_connect', connect.ok ? `ADB connected: ${account.adbHost}.` : `ADB connect lỗi: ${account.adbHost}.`, connect);
    if (!connect.ok) throw new Error(connect.error || connect.stderr || 'ADB connect failed.');
  }

  const device = await probeDevice(account, userId);
  steps.push(device);
  if (!device.ok || device.stdout !== 'device') throw new Error(device.error || device.stderr || 'Device is not ready.');

  const openApp = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', config.appPackage, '-c', 'android.intent.category.LAUNCHER', '1']);
  steps.push(openApp);
  await writeLog(userId, account._id, openApp.ok ? 'info' : 'error', 'open_app', openApp.ok ? `Đã mở app ${config.appPackage}.` : `Không mở được app ${config.appPackage}.`, openApp);
  if (!openApp.ok) throw new Error(openApp.error || openApp.stderr || 'Open app failed.');
  await delay(env.mobileAutomation.stepDelayMs);

  await tapAndLog(userId, account._id, target, 'tap_username', config.loginSteps.usernameTap);
  await inputAndLog(userId, account._id, target, 'input_username', config.username);
  await tapAndLog(userId, account._id, target, 'tap_password', config.loginSteps.passwordTap);
  await inputAndLog(userId, account._id, target, 'input_password', config.password, true);
  await tapAndLog(userId, account._id, target, 'submit_login', config.loginSteps.submitTap);
  await delay(env.mobileAutomation.stepDelayMs * 2);
  await captureScreenshot(account, userId, 'after_submit');

  account.status = 'connected';
  account.lastLoginAt = new Date();
  await account.save();
  await writeLog(userId, account._id, 'info', 'login_finished', `${account.displayName} đã chạy xong luồng đăng nhập.`, {
    target,
    appPackage: config.appPackage
  });

  return { account, steps };
}

export async function publishFacebookPostViaMobile(account, userId, payload = {}) {
  const perf = createPerfTimer();
  let target = getDeviceTarget(account);
  const config = buildPostConfig(account, {
    appPackage: payload.appPackage || defaultPackages.facebook,
    composerTap: payload.composerTap,
    autoSubmit: payload.autoSubmit,
    textInputMode: payload.textInputMode,
    waitAfterSubmitMs: payload.waitAfterSubmitMs
  });
  const text = cleanIntentText(payload.text);
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 4) : [];
  const videos = Array.isArray(payload.videos) ? payload.videos.slice(0, 1) : [];

  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!text.trim()) throw new Error('Thiếu nội dung bài đăng.');
  if (!config.appPackage) throw new Error('Thiếu Android package name của Facebook.');
  if (images.length && videos.length) throw new Error('Facebook chỉ hỗ trợ một loại media mỗi lượt: ảnh/text hoặc video.');

  await writeLog(userId, account._id, 'info', 'facebook_post_started', `Bắt đầu mở composer Facebook cho ${account.displayName}.`, {
    target,
    appPackage: config.appPackage,
    autoSubmit: config.autoSubmit,
    imageCount: images.length,
    videoCount: videos.length
  });

  const steps = [];
  if (account.adbHost) {
    const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', account.adbHost]);
    steps.push(connect);
    await writeLog(userId, account._id, connect.ok ? 'info' : 'error', 'facebook_post_adb_connect', connect.ok ? `ADB connected: ${account.adbHost}.` : `ADB connect lỗi: ${account.adbHost}.`, connect);
    if (!connect.ok) throw new Error(connect.error || connect.stderr || 'ADB connect failed.');
  }

  target = await resolveStableDeviceTarget(target);
  let device = await ensureDeviceReady(account, userId, target, 2);
  target = device.resolvedTarget || target;
  if (!device.ok || String(device.stdout || '').trim() !== 'device') {
    const instance = await getLdPlayerInstanceInfo(account.instanceName);
    target = await resolveStableDeviceTarget(instance?.target || getDeviceTarget(account) || target);
    if (instance && !instance.running) {
      await writeLog(userId, account._id, 'info', 'facebook_post_launch_immediately', `${account.instanceName} đang tắt, mở ngay thay vì chờ ADB.`);
      await openLdPlayer(account, userId, { bootPackage: config.appPackage });
      device = await ensureDeviceReady(account, userId, target, 30);
      target = device.resolvedTarget || target;
    } else {
      await writeLog(userId, account._id, 'warn', 'facebook_post_adb_wait', `ADB ${target} chưa sẵn sàng, đợi LDPlayer ổn định trước khi đăng.`);
      device = await ensureDeviceReady(account, userId, target, 12);
      target = device.resolvedTarget || target;
    }
  }
  if (!device.ok || String(device.stdout || '').trim() !== 'device') {
    await writeLog(userId, account._id, 'warn', 'facebook_post_launch_retry', `ADB ${target} vẫn chưa sẵn sàng, tự mở LDPlayer trước khi đăng.`);
    await openLdPlayer(account, userId, { bootPackage: config.appPackage });
    const launchedTarget = await getLdPlayerDeviceTarget(account.instanceName);
    target = await resolveStableDeviceTarget(launchedTarget || getDeviceTarget(account) || target);
    device = await ensureDeviceReady(account, userId, target, 18);
    target = device.resolvedTarget || target;
  }
  steps.push(device);
  if (!device.ok || String(device.stdout || '').trim() !== 'device') throw new Error(device.error || device.stderr || 'Device is not ready.');
  perf.mark('adb_ready', { target });

  const androidUi = await ensureAndroidUiReady(account, userId, target);
  steps.push(androidUi);
  if (!androidUi.ok) throw new Error(androidUi.error || 'Android/System UI chưa sẵn sàng để đăng bài.');
  if (androidUi.waitedForBoot) await delay(900);
  perf.mark('android_ui_ready', {
    attempt: androidUi.attempt,
    recoveryCount: androidUi.recoveryCount
  });

  const orientation = await ensurePortraitOrientation(account, userId, target);
  steps.push(orientation);
  perf.mark('orientation_ready');

  const publishPreflight = await runFacebookPublishPreflight(
    account,
    userId,
    target,
    config,
    videos.length || images.length
  );
  steps.push(...publishPreflight.steps);
  if (!publishPreflight.ok) {
    await writeLog(
      userId,
      account._id,
      'error',
      'facebook_publish_preflight_failed',
      publishPreflight.error || 'LDPlayer chưa đạt điều kiện ổn định để đăng Facebook.',
      publishPreflight
    );
    throw new Error(publishPreflight.error || 'LDPlayer chưa đạt điều kiện ổn định để đăng Facebook.');
  }
  perf.mark('publish_preflight_ready', {
    mediaCount: images.length + videos.length,
    elapsedMs: publishPreflight.elapsedMs
  });

  let preparedImages = [];
  let preparedVideos = [];
  try {
    let openHome = null;
    if (videos.length) {
      preparedVideos = await prepareFacebookVideos(account, userId, target, videos);
      perf.mark('video_prepared', { videoCount: preparedVideos.length });
      await assertDeviceConnected(target, 'trước khi mở Facebook composer');
      await resetFacebookAppBeforeComposer(account, userId, target, config.appPackage, steps);
      openHome = await openFacebookComposer(account, userId, target, config, text, preparedVideos, 'video');
      perf.mark('composer_opened', { method: openHome.method || '' });
      if (openHome.method !== 'video_share_intent') {
        throw new Error('Không mở được composer video Facebook bằng Android share intent.');
      }
      const videoComposer = await waitForFacebookMediaComposer(target, text, 'video', 15_000);
      let stableVideoComposer = videoComposer;
      if (!videoComposer.ok) {
        const genericShare = await openFacebookGenericShareComposer(
          account,
          userId,
          target,
          config,
          buildFacebookShareIntentArgs(target, config, text, preparedVideos[0]),
          'video'
        );
        if (genericShare.ok) {
          openHome = genericShare;
          stableVideoComposer = await waitForFacebookMediaComposer(target, text, 'video', 15_000);
        }
      }
      const canContinueFromShareChooser = stableVideoComposer.state === 'share_chooser' || Boolean(openHome.generic);
      await writeLog(
        userId,
        account._id,
        stableVideoComposer.ok || canContinueFromShareChooser ? 'info' : 'error',
        'facebook_video_composer_ready',
        stableVideoComposer.ok
          ? 'Composer video đã hiển thị đầy đủ caption và video.'
          : canContinueFromShareChooser
            ? 'Android đang hoàn tất bộ chọn Facebook Feed; tiếp tục bằng state machine.'
            : 'Facebook không nhận được video trong composer; đã dừng để tránh đăng sai hoặc báo thành công giả.',
        {
          ...stableVideoComposer,
          genericShareFallback: Boolean(openHome.generic)
        }
      );
      perf.mark('video_composer_ready', {
        attempt: stableVideoComposer.attempt,
        hasTargetText: stableVideoComposer.hasTargetText,
        hasAttachedMedia: stableVideoComposer.hasAttachedMedia
      });
      if (!stableVideoComposer.ok && !canContinueFromShareChooser) {
        throw new Error('Facebook chưa nhận được video trong composer. Hãy kiểm tra định dạng video hoặc trạng thái ứng dụng rồi thử lại.');
      }
    } else if (images.length > 1) {
      await writeLog(
        userId,
        account._id,
        'warn',
        'facebook_native_multi_image_unsupported',
        'Facebook native nhiều ảnh qua SEND_MULTIPLE không ổn định trên LDPlayer; hãy gửi 1 ảnh collage.',
        {
          imageCount: images.length,
          recommendation: 'facebook_collage_single_image'
        }
      );
      throw new Error('Facebook không dùng nhiều ảnh native trên LDPlayer. Hãy gộp nhiều ảnh thành 1 collage trước khi đăng.');
    } else if (images.length === 1) {
      const isCollageImage = isFacebookCollageImage(images[0]);
      preparedImages = await prepareFacebookImages(account, userId, target, images, {
        cleanup: true,
        persistentCacheDir: false,
        storageAttempts: 8
      });
      perf.mark('image_prepared', { imageCount: preparedImages.length });
      await assertDeviceConnected(target, 'trước khi mở Facebook composer');
      await resetFacebookAppBeforeComposer(account, userId, target, config.appPackage, steps);
      const useDirectImageShare = isCollageImage || shouldUseFacebookImageShareIntent(account, text);
      openHome = await openFacebookComposer(account, userId, target, config, text, useDirectImageShare ? preparedImages : [], 'image');
      perf.mark('composer_opened', { method: openHome.method || '', directImageShare: useDirectImageShare, isCollageImage });
      if (useDirectImageShare && openHome.method === 'image_share_intent') {
        let imageComposer = await waitForFacebookMediaComposer(target, text, 'image', config.autoSubmit ? 12_000 : 20_000);
        let genericShare = null;
        if (!imageComposer.ok && imageComposer.state !== 'share_chooser') {
          genericShare = await openFacebookGenericShareComposer(
            account,
            userId,
            target,
            config,
            buildFacebookShareIntentArgs(target, config, text, preparedImages[0]),
            'image'
          );
          if (genericShare.ok) {
            openHome = genericShare;
            imageComposer = await waitForFacebookMediaComposer(target, text, 'image', config.autoSubmit ? 15_000 : 22_000);
          }
        }
        const canContinueFromShareChooser = imageComposer.state === 'share_chooser';
        const canContinueCollageDirect = isCollageImage
          && ['share_chooser', 'system_anr', 'ready_to_post', 'composer', 'stale_composer', 'unknown'].includes(imageComposer.state);
        await writeLog(
          userId,
          account._id,
          imageComposer.ok || canContinueFromShareChooser ? 'info' : 'warn',
          'facebook_image_composer_ready',
          imageComposer.ok
            ? 'Composer ảnh đã hiển thị đầy đủ caption và ảnh qua share intent.'
            : canContinueFromShareChooser
              ? 'Android đang hoàn tất bộ chọn Facebook Feed; tiếp tục bằng state machine.'
              : 'Facebook chưa xác nhận ảnh qua share intent; fallback sang composer text + gallery.',
          {
            ...imageComposer,
            genericShareFallback: Boolean(genericShare?.ok)
          }
        );
        perf.mark('image_composer_ready', {
          attempt: imageComposer.attempt,
          hasTargetText: imageComposer.hasTargetText,
          hasAttachedMedia: imageComposer.hasAttachedMedia
        });
        if (!imageComposer.ok && !canContinueFromShareChooser && !canContinueCollageDirect) {
          if (isCollageImage) {
            const screenshot = await captureScreenshot(account, userId, 'facebook_collage_share_not_confirmed');
            await writeLog(userId, account._id, 'error', 'facebook_collage_share_not_confirmed', 'Facebook chưa xác nhận ảnh collage qua share intent; dừng thay vì fallback gallery để tránh chọn nhầm media.', {
              imageComposer,
              genericShare,
              screenshot
            });
            throw new Error('Facebook chưa nhận ảnh collage vào composer. Tool đã dừng thay vì chuyển sang thư viện ảnh để tránh chọn nhầm media.');
          }
          const stop = await runCommand(env.mobileAutomation.adbPath, [
            '-s',
            target,
            'shell',
            'am',
            'force-stop',
            config.appPackage
          ], { timeoutMs: 8_000 });
          steps.push(stop);
          await writeLog(userId, account._id, stop.ok ? 'warn' : 'error', 'facebook_image_share_not_confirmed', 'Facebook chưa xác nhận ảnh qua share intent; chuyển sang composer text + gallery đã kiểm chứng thay vì dừng.', {
            stop,
            imageComposer
          });
          await delay(900);
          await assertDeviceConnected(target, 'trước khi fallback composer text + gallery');
          openHome = await openFacebookComposer(account, userId, target, config, text, [], 'image');
          perf.mark('image_share_fallback_to_gallery', {
            method: openHome.method || '',
            previousState: imageComposer.state || ''
          });
        }
      }
    } else {
      await assertDeviceConnected(target, 'trước khi mở Facebook composer');
      openHome = await openFacebookComposer(account, userId, target, config, text, [], 'image');
      perf.mark('composer_opened', { method: openHome.method || '' });
    }
    for (const preparedImage of preparedImages) steps.push(...preparedImage.steps);
    for (const preparedVideo of preparedVideos) steps.push(...preparedVideo.steps);
    steps.push(openHome);
    await assertDeviceConnected(target, 'sau khi mở Facebook composer');
    await delay(postStepDelay());

    const stateMachine = await runFacebookPostStateMachine(
      account,
      userId,
      target,
      config,
      text,
      preparedVideos.length ? preparedVideos : preparedImages,
      {
        imageSharedByIntent: ['image_share_intent', 'video_share_intent'].includes(openHome.method),
        imageSharedByIntentCount: openHome.method === 'image_share_intent' ? preparedImages.length : 0,
        mediaKind: preparedVideos.length ? 'video' : 'image',
        openMethod: openHome.method || '',
        directShareOnly: preparedImages.length === 1 && isFacebookCollageImage(images[0])
      }
    );
    steps.push(...stateMachine.steps);
    perf.mark('state_machine_finished', {
      finalState: stateMachine.finalState,
      submitVerified: stateMachine.submitVerified ?? false
    });

    const submitVerified = stateMachine.submitVerified ?? false;
    const submitReason = stateMachine.submitReason || (config.autoSubmit && stateMachine.composerPending ? 'state_machine_pending' : '');
    const finishedLevel = config.autoSubmit && !submitVerified ? 'warn' : 'info';
    const reachedSubmitPhase = ['submitted', 'submit_unverified', 'home'].includes(stateMachine.finalState)
      || ['home_after_next', 'published_post_evidence_pending', 'upload_completed_and_post_visible', 'published_post_visible'].includes(submitReason);
    const finishedMessage = config.autoSubmit && !submitVerified
      ? (reachedSubmitPhase
        ? 'Đã bấm Đăng nhưng chưa xác nhận Facebook đã nhận bài.'
        : 'Chưa gửi được bài; automation dừng trước bước xác nhận Đăng để tránh thao tác lặp.')
      : (config.autoSubmit ? 'Đã chạy luồng tự đăng Facebook.' : 'Đã mở composer Facebook, chờ kiểm tra/tự bấm đăng.');
    await writeLog(userId, account._id, finishedLevel, 'facebook_post_finished', finishedMessage, {
      autoSubmit: config.autoSubmit,
      finalState: stateMachine.finalState,
      submitVerified,
      submitReason,
      imageCount: preparedImages.length,
      videoCount: preparedVideos.length,
      perf: perf.snapshot()
    });

    return {
      ok: true,
      autoSubmit: config.autoSubmit,
      composerTap: config.composerTap,
      composerPending: stateMachine.composerPending,
      finalState: stateMachine.finalState,
      submitVerified,
      submitReason,
      screenshot: stateMachine.screenshot,
      screenshotVerified: Boolean(stateMachine.screenshotVerified),
      stepCount: steps.length,
      perf: perf.snapshot()
    };
  } finally {
    if ((images.length > 0 || videos.length > 0) && config.autoSubmit) {
      cleanupFacebookMediaLibrary(account, userId, target, 'after_publish').catch((error) => {
        writeLog(userId, account._id, 'warn', 'facebook_post_media_cleanup_deferred_failed', error.message, { target }).catch(() => null);
      });
    }
  }
}

function shouldUseFacebookImageShareIntent(account, text = '') {
  const instanceName = String(account?.instanceName || '');
  // LDPlayer-3 has repeatedly stalled after Facebook accepts an image share
  // intent. Keep this instance on the slower gallery path; other instances use
  // the faster direct share path and still have a fallback if validation fails.
  if (/LDPlayer-3/i.test(instanceName)) return false;

  // For one-image posts, direct share is safer than gallery because Facebook's
  // gallery can surface stale LDPlayer images ahead of the file we just pushed.
  // Caption correctness is still verified and repaired in the state machine.
  return true;
}

function isFacebookCollageImage(image = {}) {
  if (image?.isCollage) return true;
  const value = `${image.name || ''} ${image.url || ''} ${image.imageUrl || ''}`.toLowerCase();
  return value.includes('facebook-collage');
}

async function resetFacebookAppBeforeComposer(account, userId, target, appPackage, steps = []) {
  const reset = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'am',
    'force-stop',
    appPackage
  ], { timeoutMs: 8_000 });
  steps.push(reset);
  await writeLog(
    userId,
    account._id,
    reset.ok ? 'info' : 'warn',
    'facebook_post_reset_app_before_composer',
    reset.ok
      ? 'Đã reset nhanh Facebook trước khi mở composer để tránh dính draft cũ.'
      : 'Không reset được Facebook trước composer; tiếp tục mở composer theo trạng thái hiện tại.',
    reset
  );
  if (reset.ok) await delay(550);
  return reset;
}

export async function publishInstagramPostViaMobile(account, userId, payload = {}) {
  return runInstagramPublishExclusive(account, userId, payload, () => publishInstagramPostViaMobileUnsafe(account, userId, payload));
}

async function runInstagramPublishExclusive(account, userId, payload, operation) {
  const queueKey = getInstagramPublishQueueKey(account, payload);
  const previous = instagramPublishQueues.get(queueKey) || Promise.resolve();
  const queuedAt = Date.now();
  const queued = previous.catch(() => null).then(async () => {
    const waitMs = Date.now() - queuedAt;
    if (waitMs > 500) {
      await writeLog(userId, account._id, 'info', 'instagram_post_queue_wait', 'Luồng Instagram đang chờ task trước hoàn tất để tránh mở nhiều phiên LD/ADB cùng lúc.', {
        queueKey,
        waitMs
      });
    }
    return operation();
  });
  const cleanup = queued.then(
    () => null,
    () => null
  ).finally(() => {
    if (instagramPublishQueues.get(queueKey) === cleanup) {
      instagramPublishQueues.delete(queueKey);
    }
  });
  instagramPublishQueues.set(queueKey, cleanup);
  return queued;
}

function getInstagramPublishQueueKey(account, payload = {}) {
  const packageName = payload.appPackage || account?.metadata?.appPackage || defaultPackages.instagram;
  const target = getDeviceTarget(account) || account?.adbHost || account?.instanceName || account?._id || 'unknown';
  return `${target}:${packageName}:instagram`;
}

async function publishInstagramPostViaMobileUnsafe(account, userId, payload = {}) {
  const perf = createPerfTimer();
  let target = getDeviceTarget(account);
  const requestedImages = Array.isArray(payload.images) ? payload.images.slice(0, 10) : [];
  const postType = requestedImages.length > 1 ? 'carousel' : 'singlePhoto';
  const config = buildPostConfig(account, {
    appPackage: payload.appPackage || defaultPackages.instagram,
    autoSubmit: payload.autoSubmit,
    waitAfterSubmitMs: payload.waitAfterSubmitMs
  });
  const text = cleanIntentText(payload.text);
  const images = requestedImages;
  const cleanupAfterDryRun = Boolean(payload.cleanupAfterDryRun) && !config.autoSubmit;

  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!images.length) throw new Error('Instagram cần ít nhất 1 ảnh để đăng.');
  if (!config.appPackage) throw new Error('Thiếu Android package name của Instagram.');

  const gate = buildInstagramPostGateSummary(account, target, config, text, images, {
    cleanupAfterDryRun,
    postType
  });
  await writeLog(userId, account._id, 'info', 'instagram_post_started', `Bắt đầu mở composer Instagram cho ${account.displayName}.`, {
    target,
    appPackage: config.appPackage,
    autoSubmit: config.autoSubmit,
    postType,
    imageCount: images.length,
    gate
  });

  const steps = [];
  if (account.adbHost) {
    const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', account.adbHost]);
    steps.push(connect);
    await writeLog(userId, account._id, connect.ok ? 'info' : 'error', 'instagram_post_adb_connect', connect.ok ? `ADB connected: ${account.adbHost}.` : `ADB connect lỗi: ${account.adbHost}.`, connect);
    if (!connect.ok) throw new Error(connect.error || connect.stderr || 'ADB connect failed.');
  }

  target = await resolveStableDeviceTarget(target);
  let device = await ensureDeviceReady(account, userId, target, 2);
  target = device.resolvedTarget || target;
  if (!device.ok || String(device.stdout || '').trim() !== 'device') {
    await writeLog(userId, account._id, 'warn', 'instagram_post_launch_retry', `ADB ${target} chưa sẵn sàng, tự mở LDPlayer trước khi đăng Instagram.`);
    await openLdPlayer(account, userId, { bootPackage: config.appPackage });
    const launchedTarget = await getLdPlayerDeviceTarget(account.instanceName);
    target = await resolveStableDeviceTarget(launchedTarget || getDeviceTarget(account) || target);
    device = await ensureDeviceReady(account, userId, target, 28);
    target = device.resolvedTarget || target;
  }
  steps.push(device);
  if (!device.ok || String(device.stdout || '').trim() !== 'device') throw new Error(device.error || device.stderr || 'Device is not ready.');
  perf.mark('adb_ready', { target });

  const systemUi = await waitForSystemUiHealthy(account, userId, target, {
    phase: 'instagram_preflight',
    stableChecks: 2,
    maxAttempts: 8
  });
  steps.push(systemUi);
  if (!systemUi.ok) {
    throw new Error(systemUi.error || 'System UI của LDPlayer chưa ổn định trước khi đăng Instagram.');
  }

  const [display, permissions] = await Promise.all([
    resetInstagramDisplaySize(account, userId, target),
    grantInstagramRuntimePermissions(account, userId, target, config.appPackage)
  ]);
  steps.push(display);
  steps.push(...permissions);
  perf.mark('device_prepared', { permissionStepCount: permissions.length });

  const preparedImages = await prepareFacebookImages(account, userId, target, images, {
    cleanup: false,
    appPackage: config.appPackage,
    skipPermissionGrant: true
  });
  for (const preparedImage of preparedImages) steps.push(...preparedImage.steps);
  perf.mark('image_prepared', {
    imageCount: preparedImages.length,
    cacheHit: preparedImages.every((image) => image.cacheHit)
  });

  const openComposer = await openInstagramComposer(account, userId, target, config, text, preparedImages);
  steps.push(openComposer);
  perf.mark('composer_opened', { method: openComposer.method || '' });
  await delay(postStepDelay(0.75));

  const stateMachine = await runInstagramPostStateMachine(account, userId, target, config, text, steps);
  perf.mark('state_machine_finished', {
    finalState: stateMachine.finalState,
    submitVerified: stateMachine.submitVerified ?? false
  });
  let dryRunCleanup = null;
  if (cleanupAfterDryRun && !stateMachine.submitVerified) {
    dryRunCleanup = await cleanupInstagramDryRunComposer(account, userId, target, config);
    steps.push(...dryRunCleanup.steps);
    perf.mark('dry_run_cleanup_finished', { ok: dryRunCleanup.ok, discarded: dryRunCleanup.discarded });
  }
  const submitVerified = stateMachine.submitVerified ?? false;
  const finishedLevel = config.autoSubmit && !submitVerified ? 'warn' : 'info';
  const perfSnapshot = perf.snapshot();
  const optimization = analyzeInstagramPerf(perfSnapshot, {
    autoSubmit: config.autoSubmit,
    postType,
    submitVerified,
    submitReason: stateMachine.submitReason || '',
    finalState: stateMachine.finalState
  });
  await writeLog(userId, account._id, finishedLevel, 'instagram_post_finished', config.autoSubmit && !submitVerified ? 'Đã bấm Share Instagram nhưng chưa xác nhận app nhận bài.' : (config.autoSubmit ? 'Đã chạy luồng tự đăng Instagram.' : 'Đã mở composer Instagram, chờ kiểm tra/tự bấm share.'), {
    autoSubmit: config.autoSubmit,
    cleanupAfterDryRun,
    finalState: stateMachine.finalState,
    submitVerified,
    submitReason: stateMachine.submitReason || '',
    postType,
    imageCount: preparedImages.length,
    dryRunCleanup,
    perf: perfSnapshot,
    optimization
  });

  return {
    ok: true,
    autoSubmit: config.autoSubmit,
    postType,
    composerPending: stateMachine.composerPending,
    finalState: stateMachine.finalState,
    submitVerified,
    submitReason: stateMachine.submitReason || '',
    screenshot: stateMachine.screenshot,
    dryRunCleanup,
    stepCount: steps.length,
    perf: perfSnapshot,
    optimization
  };
}

function buildInstagramPostGateSummary(account, target, config, text, images, options = {}) {
  return {
    target,
    instanceName: account?.instanceName || '',
    platform: account?.platform || '',
    appPackage: config.appPackage,
    autoSubmit: Boolean(config.autoSubmit),
    cleanupAfterDryRun: Boolean(options.cleanupAfterDryRun),
    postType: options.postType || (images.length > 1 ? 'carousel' : 'singlePhoto'),
    imageCount: images.length,
    captionLength: text.length,
    hasCaption: Boolean(text.trim()),
    mode: config.autoSubmit ? 'submit' : 'dry_run_review'
  };
}

function analyzeInstagramPerf(perfSnapshot = {}, context = {}) {
  const stages = Array.isArray(perfSnapshot.stages) ? perfSnapshot.stages : [];
  const composerStage = stages.find((stage) => stage.name === 'composer_opened');
  const bottlenecks = stages
    .filter((stage) => Number(stage.durationMs) >= 10_000)
    .map((stage) => ({
      stage: stage.name,
      durationMs: stage.durationMs,
      elapsedMs: stage.elapsedMs,
      severity: stage.durationMs >= 60_000 ? 'high' : stage.durationMs >= 25_000 ? 'medium' : 'low'
    }))
    .sort((left, right) => right.durationMs - left.durationMs);
  const recommendations = [];
  if (bottlenecks.some((item) => item.stage === 'composer_opened')) {
    recommendations.push(`composer_opened chậm bằng ${composerStage?.method || 'unknown'}: giữ LD warm trước batch, tránh force-stop lặp lại, và ưu tiên method đã pass nhanh nhất trên account chuẩn.`);
  }
  if (bottlenecks.some((item) => item.stage === 'image_prepared')) {
    recommendations.push('image_prepared chậm: bật cache media theo hash/contentUri và dùng lại file đã push vào /sdcard/Pictures/SocialPilot.');
  }
  if (bottlenecks.some((item) => item.stage === 'state_machine_finished')) {
    recommendations.push('state_machine_finished chậm: cần kiểm tra label/foreground activity Instagram ở màn Next/caption để giảm vòng chờ.');
  }
  if (!context.autoSubmit && context.submitReason === 'review_mode') {
    recommendations.push('Dry-run đã tới review_mode an toàn; chỉ bật autoSubmit sau khi cùng payload pass ổn định trên account chuẩn.');
  }
  return {
    totalMs: perfSnapshot.totalMs || 0,
    bottlenecks,
    recommendations
  };
}

async function cleanupInstagramDryRunComposer(account, userId, target, config) {
  const steps = [];
  const back = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '4'], { timeoutMs: 10_000 });
  steps.push(back);
  await delay(postStepDelay(1.2));

  let discarded = false;
  const nodes = await dumpVisibleNodes(target);
  const discardNode = findNodeInNodes(nodes, instagramDiscardLabels, { exact: true, preferBottomRight: true });
  if (discardNode) {
    const point = {
      x: Math.round((discardNode.left + discardNode.right) / 2),
      y: Math.round((discardNode.top + discardNode.bottom) / 2)
    };
    const discard = await tapAndLog(userId, account._id, target, 'instagram_post_dry_run_discard_draft', point);
    steps.push(discard);
    discarded = Boolean(discard.ok);
    await delay(postStepDelay(0.8));
  }

  const stop = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', config.appPackage], { timeoutMs: 10_000 });
  steps.push(stop);
  const adbRecovery = await recoverInstagramAdbAfterCleanup(account, userId, target);
  steps.push(...adbRecovery.steps);
  await writeLog(userId, account._id, stop.ok ? 'info' : 'warn', 'instagram_post_dry_run_cleanup', stop.ok ? 'Đã dọn composer test Instagram sau dry-run để lần chạy sau không dính draft cũ.' : 'Không force-stop được Instagram sau dry-run.', {
    back,
    discarded,
    stop,
    adbRecovery
  });
  scheduleInstagramAdbStabilityProbe(account, userId, adbRecovery.health?.resolvedTarget || target, 'dry_run_cleanup');
  return { ok: Boolean(stop.ok && adbRecovery.ok), discarded, adbRecovery, steps };
}

async function cleanupInstagramFailedComposer(account, userId, target, config, reason = 'failed_composer') {
  const steps = [];
  const stop = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', config.appPackage], { timeoutMs: 10_000 });
  steps.push(stop);
  const adbRecovery = await recoverInstagramAdbAfterCleanup(account, userId, target);
  steps.push(...adbRecovery.steps);
  await writeLog(userId, account._id, stop.ok ? 'warn' : 'error', 'instagram_post_failed_cleanup', stop.ok ? 'Đã dọn Instagram sau lỗi để task kế tiếp không dính trạng thái cũ.' : 'Không dọn được Instagram sau lỗi.', {
    reason,
    stop,
    adbRecovery
  });
  scheduleInstagramAdbStabilityProbe(account, userId, adbRecovery.health?.resolvedTarget || target, reason);
  return { ok: Boolean(stop.ok && adbRecovery.ok), stop, adbRecovery, steps };
}

async function recoverInstagramAdbAfterCleanup(account, userId, target) {
  const steps = [];
  await delay(1_500);
  let health = await ensureDeviceReady(account, userId, target, 2);
  steps.push(health);
  if (health.ok && String(health.stdout || '').trim() === 'device') {
    await delay(4_000);
    const confirmedHealth = await ensureDeviceReady(account, userId, health.resolvedTarget || target, 2);
    steps.push(confirmedHealth);
    if (confirmedHealth.ok && String(confirmedHealth.stdout || '').trim() === 'device') {
      return { ok: true, recovered: false, health: confirmedHealth, initialHealth: health, steps };
    }
    await writeLog(userId, account._id, 'warn', 'instagram_post_cleanup_adb_late_offline', 'ADB ban đầu còn device nhưng rơi offline sau cleanup Instagram; chuyển sang recovery trước khi trả kết quả.', {
      target,
      initialHealth: health,
      confirmedHealth
    });
    health = confirmedHealth;
  }

  await writeLog(userId, account._id, 'warn', 'instagram_post_cleanup_adb_offline', 'ADB không còn ổn định sau cleanup Instagram; tự recovery đúng LDPlayer hiện tại để batch tiếp theo không chạy trên target offline.', {
    target,
    health
  });
  const launched = await openLdPlayer(account, userId, { bootPackage: defaultPackages.instagram });
  steps.push(launched);
  const launchedTarget = await getLdPlayerDeviceTarget(account.instanceName);
  const nextTarget = await resolveStableDeviceTarget(launchedTarget || getDeviceTarget(account) || target);
  health = await ensureDeviceReady(account, userId, nextTarget, 24);
  steps.push(health);
  const ok = Boolean(health.ok && String(health.stdout || '').trim() === 'device');
  await writeLog(userId, account._id, ok ? 'info' : 'error', 'instagram_post_cleanup_adb_recovery', ok ? 'ADB đã hồi phục sau cleanup Instagram.' : 'Không hồi phục được ADB sau cleanup Instagram.', {
    target,
    nextTarget,
    launched,
    health
  });
  return { ok, recovered: ok, launched, health, steps };
}

function scheduleInstagramAdbStabilityProbe(account, userId, target, reason = 'instagram_cleanup') {
  const checks = [25_000, 90_000];
  for (const delayMs of checks) {
    setTimeout(() => {
      recoverInstagramAdbIfOffline(account, userId, target, { reason, delayMs }).catch((error) => {
        writeLog(userId, account._id, 'warn', 'instagram_post_cleanup_adb_probe_failed', error.message, {
          target,
          reason,
          delayMs
        }).catch(() => null);
      });
    }, delayMs).unref?.();
  }
}

async function recoverInstagramAdbIfOffline(account, userId, target, context = {}) {
  const health = await ensureDeviceReady(account, userId, target, 2);
  if (health.ok && String(health.stdout || '').trim() === 'device') return { ok: true, recovered: false, health };

  await writeLog(userId, account._id, 'warn', 'instagram_post_cleanup_adb_delayed_offline', 'ADB rơi offline sau cleanup Instagram; watchdog đang recovery để chuẩn bị cho task kế tiếp.', {
    target,
    context,
    health
  });
  const recovery = await recoverInstagramAdbAfterCleanup(account, userId, health.resolvedTarget || target);
  await writeLog(userId, account._id, recovery.ok ? 'info' : 'error', 'instagram_post_cleanup_adb_delayed_recovery', recovery.ok ? 'Watchdog đã xác nhận ADB sẵn sàng sau cleanup Instagram.' : 'Watchdog không hồi phục được ADB sau cleanup Instagram.', {
    target,
    context,
    recovery
  });
  return { ...recovery, recovered: recovery.ok };
}

async function prewarmInstagramForShare(account, userId, target, config, options = {}) {
  const packageName = config.appPackage || defaultPackages.instagram;
  const cacheKey = `${target}:${packageName}`;
  const cachedAt = instagramSharePrewarmCache.get(cacheKey) || 0;
  if (!options.force && Date.now() - cachedAt < instagramSharePrewarmCacheTtlMs) {
    return { ok: true, skipped: true, reason: 'prewarm_cache', cacheAgeMs: Date.now() - cachedAt };
  }

  const stop = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 });
  await writeLog(userId, account._id, stop.ok ? 'info' : 'warn', 'instagram_post_reset_app_task', stop.ok ? 'Đã đóng task Instagram cũ trước khi prewarm composer.' : 'Không đóng được task Instagram cũ trước prewarm.', {
    ...stop,
    reason: options.reason || ''
  });
  await delay(postStepDelay(0.8));

  const launch = await launchAppWarm(target, packageName);
  let recoveryLaunch = null;
  let readiness = launch.ok
    ? await waitForAppForegroundReady(account, userId, target, packageName, 18_000, {
      stableChecks: 1,
      requireVisibleUi: false
    })
    : { ok: false, error: launch.error || launch.stderr || 'Không mở được Instagram để prewarm.' };

  if (!readiness.ok) {
    const fresh = await launchAppFresh(target, packageName);
    recoveryLaunch = fresh;
    readiness = fresh.ok
      ? await waitForAppForegroundReady(account, userId, target, packageName, 24_000, {
        stableChecks: 1,
        requireVisibleUi: false
      })
      : { ok: false, error: fresh.error || fresh.stderr || readiness.error };
    await writeLog(userId, account._id, fresh.ok ? 'info' : 'warn', 'instagram_post_prewarm_fresh_launch', fresh.ok ? 'Đã mở Instagram bằng fresh launch để prewarm share intent.' : 'Fresh launch Instagram để prewarm không thành công.', {
      fresh,
      readiness
    });
  }

  const ok = Boolean((launch.ok || recoveryLaunch?.ok) && readiness.ok);
  if (ok) instagramSharePrewarmCache.set(cacheKey, Date.now());
  await writeLog(userId, account._id, ok ? 'info' : 'warn', 'instagram_post_prewarm_share', ok ? 'Instagram đã được prewarm trước khi mở share intent.' : 'Prewarm Instagram chưa ổn định; vẫn tiếp tục thử share intent.', {
    reason: options.reason || '',
    launch,
    recoveryLaunch,
    readiness
  });
  return { ok, launch, recoveryLaunch, readiness };
}

function getCachedInstagramShareMethod(cacheKey) {
  const cached = instagramShareMethodCache.get(cacheKey);
  if (!cached) return '';
  if (Date.now() - cached.updatedAt > instagramShareMethodCacheTtlMs) {
    instagramShareMethodCache.delete(cacheKey);
    return '';
  }
  return cached.method || '';
}

function cacheInstagramShareMethod(cacheKey, method) {
  if (!cacheKey || !method) return;
  instagramShareMethodCache.set(cacheKey, {
    method,
    updatedAt: Date.now()
  });
}

function orderInstagramShareIntentAttempts(attempts = [], preferredMethod = '') {
  if (!preferredMethod) return attempts;
  const preferred = attempts.find((attempt) => attempt.method === preferredMethod);
  if (!preferred) return attempts;
  return [
    preferred,
    ...attempts.filter((attempt) => attempt.method !== preferredMethod)
  ];
}

async function openInstagramComposer(account, userId, target, config, text, images) {
  const media = Array.isArray(images) ? images : [];
  if (media.length > 1) {
    return openInstagramCarouselComposer(account, userId, target, config, text, media);
  }

  await prewarmInstagramForShare(account, userId, target, config, { force: false, noForceStop: true, reason: 'single_photo_initial' });

  const imageUris = media.map((image) => image.contentUri || `file://${image.remotePath}`);
  if (!imageUris.length) throw new Error('Không có media URI để mở Instagram composer.');
  const baseIntentArgs = [
    '-s',
    target,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.SEND',
    '-t',
    media[0].mimeType || 'image/*',
    '--grant-read-uri-permission',
    '--eu',
    'android.intent.extra.STREAM',
    imageUris[0]
  ];
  // Instagram xử lý EXTRA_TEXT không ổn định: có phiên bản chỉ giữ emoji
  // hoặc bỏ hashtag. Chỉ mở media ở đây và nhập caption sau bằng ADB Keyboard.
  const shareMethodCacheKey = `${target}:${config.appPackage}:single_photo`;
  const cachedShareMethod = getCachedInstagramShareMethod(shareMethodCacheKey);
  const defaultIntentAttempts = [
    {
      args: [...baseIntentArgs, '-p', config.appPackage],
      method: 'package_share_media_only',
      bootstrapTimeoutMs: 12_000,
      commandTimeoutMs: 10_000
    },
    {
      args: [...baseIntentArgs, '-n', `${config.appPackage}/${instagramFeedShareActivity}`],
      method: 'feed_share_activity_media_only',
      bootstrapTimeoutMs: 9_000,
      commandTimeoutMs: 8_000
    }
  ];
  const intentAttempts = orderInstagramShareIntentAttempts(defaultIntentAttempts, cachedShareMethod);
  let shareIntent = null;
  let intentArgs = intentAttempts[0].args;
  let method = intentAttempts[0].method;
  let bootstrap = null;

  for (let index = 0; index < intentAttempts.length; index += 1) {
    if (index > 0) {
      await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', config.appPackage], { timeoutMs: 10_000 });
      await delay(postStepDelay());
    }
    intentArgs = intentAttempts[index].args;
    method = intentAttempts[index].method;
    const shareAttempt = await runInstagramShareIntentWithAdbRetry(account, userId, target, intentArgs, {
      timeoutMs: intentAttempts[index].commandTimeoutMs
    });
    target = shareAttempt.target;
    intentArgs = shareAttempt.intentArgs;
    shareIntent = shareAttempt.result;
    await writeLog(
      userId,
      account._id,
      shareIntent.ok ? 'info' : 'warn',
      'instagram_post_open_feed_share_composer',
      shareIntent.ok ? 'Đã mở Instagram Feed/Profile composer bằng Android share intent.' : 'Không mở được Instagram Feed/Profile share intent.',
      {
        ...shareIntent,
        args: maskShareIntentArgs(intentArgs),
        method,
        imageCount: imageUris.length
      }
    );
    if (!shareIntent.ok) continue;

    bootstrap = await waitForInstagramComposerBootstrap(account, userId, target, config, text, method, intentAttempts[index].bootstrapTimeoutMs);
    if (bootstrap.ok) {
      cacheInstagramShareMethod(shareMethodCacheKey, method);
      break;
    }
    await writeLog(userId, account._id, 'warn', 'instagram_post_share_bootstrap_retry', 'Instagram đã nhận intent nhưng chưa hiện màn Next/Share; thử phương thức mở composer kế tiếp.', {
      method,
      bootstrap
    });
  }

  const opened = Boolean(shareIntent?.ok && bootstrap?.ok);
  await writeLog(userId, account._id, opened ? 'info' : 'error', 'instagram_post_open_share_composer', opened ? 'Đã mở Instagram Feed/Profile composer bằng Android share intent.' : 'Không mở được Instagram Feed/Profile share intent.', {
    ...shareIntent,
    args: maskShareIntentArgs(intentArgs),
    method,
    imageCount: imageUris.length,
    bootstrap
  });
  if (!opened) {
    if (isInstagramShareHandlerStuck({ shareIntent, bootstrap, method })) {
      await cleanupInstagramFailedComposer(account, userId, target, config, 'single_photo_share_handler_stuck');
      throw new Error('Instagram ShareHandlerActivity bị kẹt, không render màn Next/Share. Đã dừng sớm để tránh treo LDPlayer; hãy mở Instagram thủ công một lần rồi thử lại.');
    }
    const nativeComposer = await openInstagramNativeSinglePhotoComposer(account, userId, target, config, text, media, {
      shareIntent,
      bootstrap,
      failedMethod: method
    });
    if (nativeComposer.ok) return nativeComposer;
    throw new Error(nativeComposer.error || shareIntent?.error || shareIntent?.stderr || bootstrap?.error || 'Không mở được Instagram Feed/Profile composer.');
  }
  return { ...shareIntent, method, bootstrap };
}

async function runInstagramShareIntentWithAdbRetry(account, userId, target, intentArgs, options = {}) {
  let currentTarget = target;
  let currentArgs = intentArgs;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 12_000;
  let result = await runCommand(env.mobileAutomation.adbPath, currentArgs, { timeoutMs });
  if (!result.ok && isTransientAdbCheckOutput(`${result.error || ''} ${result.stderr || ''}`)) {
    const retryReady = await ensureDeviceReady(account, userId, currentTarget, 12);
    currentTarget = retryReady.resolvedTarget || currentTarget;
    if (retryReady.ok && String(retryReady.stdout || '').trim() === 'device') {
      currentArgs = currentArgs.map((arg, argIndex) => (argIndex > 0 && currentArgs[argIndex - 1] === '-s' ? currentTarget : arg));
      result = await runCommand(env.mobileAutomation.adbPath, currentArgs, { timeoutMs: Math.max(timeoutMs, 10_000) });
    }
  }
  return { result, target: currentTarget, intentArgs: currentArgs };
}

async function openInstagramCarouselComposer(account, userId, target, config, text, images) {
  const multiImageComposer = await openInstagramMultipleImageComposer(account, userId, target, config, text, images);
  if (multiImageComposer.ok) return multiImageComposer;

  await writeLog(userId, account._id, 'warn', 'instagram_post_album_multi_share_fallback', 'Không mở được Album bằng SEND_MULTIPLE; chuyển sang luồng Instagram Home/Create.', {
    multiImageComposer
  });

  if (isInstagramSendMultipleUnsupported(multiImageComposer)) {
    const error = new Error('LDPlayer/Android hiện tại không hỗ trợ mở Album Instagram bằng SEND_MULTIPLE (--eul), còn luồng Home/Create gây kẹt app. Tạm dừng Album để giữ ADB ổn định.');
    await writeLog(userId, account._id, 'error', 'instagram_post_album_unsupported_fast_stop', error.message, {
      multiImageComposer
    });
    await cleanupInstagramFailedComposer(account, userId, target, config, 'album_send_multiple_unsupported');
    throw error;
  }

  try {
    const nativeAlbumComposer = await openInstagramNativeAlbumComposer(account, userId, target, config, text, images);
    if (nativeAlbumComposer.ok) return nativeAlbumComposer;
  } catch (error) {
    await writeLog(userId, account._id, 'error', 'instagram_post_album_native_failed', 'Luồng Home/Create Album chưa ổn định; dừng album để tránh kẹt LD bằng nhánh Add More.', {
      error: error.message,
      multiImageComposer
    });
    await cleanupInstagramFailedComposer(account, userId, target, config, 'album_native_failed');
    throw error;
  }

  const firstImageComposer = await openInstagramComposer(account, userId, target, config, text, [images[0]]);
  let nodes = await dumpVisibleNodes(target);
  let addMoreNode = findInstagramAddMoreMediaButton(nodes);
  if (!addMoreNode) {
    const ready = await waitForInstagramAddMoreButton(target, 25_000);
    nodes = ready?.nodes || nodes;
    addMoreNode = ready?.node || null;
  }
  if (!addMoreNode) {
    await writeLog(userId, account._id, 'warn', 'instagram_post_album_add_more_missing', 'Composer share không có nút Add More; chuyển sang luồng Instagram Home/Create để tạo Album.', {
      firstImageComposer
    });
    return openInstagramNativeAlbumComposer(account, userId, target, config, text, images, firstImageComposer);
  }

  await delay(postStepDelay(3));
  let gallery = null;
  for (let attempt = 1; attempt <= 3 && !gallery; attempt += 1) {
    const currentNodes = await dumpVisibleNodes(target);
    const currentAddMoreNode = findInstagramAddMoreMediaButton(currentNodes) || addMoreNode;
    const addMorePoint = {
      x: Math.round((currentAddMoreNode.left + currentAddMoreNode.right) / 2),
      y: Math.round((currentAddMoreNode.top + currentAddMoreNode.bottom) / 2)
    };
    await tapAndLog(userId, account._id, target, 'instagram_post_open_add_more_gallery', addMorePoint);
    gallery = await waitForInstagramAddMoreGallery(target, attempt === 1 ? 10_000 : 7_000);
    if (!gallery) {
      const afterTapNodes = await dumpVisibleNodes(target);
      await writeLog(userId, account._id, 'warn', 'instagram_post_add_more_retry', 'Nút Add More chưa mở gallery, đang thử lại.', {
        attempt,
        point: addMorePoint,
        labels: afterTapNodes.map((node) => node.text || node.desc).filter(Boolean).slice(0, 50),
        foreground: await getForegroundAndroidPackage(target)
      });
      await delay(postStepDelay(1.5));
    }
  }
  if (!gallery) throw new Error('Instagram không mở thư viện từ nút Add More Photos and Videos.');

  const selection = await selectInstagramRecentAlbumPhotos(account, userId, target, images.length, {
    skipFirstCandidate: true
  });
  if (!selection.ok) throw new Error(selection.error);

  const finalNodes = await dumpVisibleNodes(target);
  const finalState = detectInstagramState(finalNodes, text);
  await writeLog(userId, account._id, 'info', 'instagram_post_album_ready', `Đã chọn ${images.length} ảnh cho Album Instagram.`, {
    imageCount: images.length,
    selectedCount: selection.selectedCount,
    state: finalState
  });
  return {
    ok: true,
    method: 'instagram_share_add_more_carousel',
    imageCount: images.length,
    firstImageComposer,
    selection,
    bootstrap: {
      ok: finalState.name === 'next',
      method: 'instagram_share_add_more_carousel',
      state: finalState
    }
  };
}

async function openInstagramMultipleImageComposer(account, userId, target, config, text, images) {
  const media = Array.isArray(images) ? images : [];
  const imageUris = media.map((image) => image.contentUri || `file://${image.remotePath}`).filter(Boolean);
  if (imageUris.length < 2) return { ok: false, error: 'Cần ít nhất 2 ảnh để mở album bằng SEND_MULTIPLE.' };

  const stop = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', config.appPackage], { timeoutMs: 10_000 });
  await writeLog(userId, account._id, stop.ok ? 'info' : 'warn', 'instagram_post_reset_app_task', stop.ok ? 'Đã đóng task Instagram cũ trước khi mở Album.' : 'Không đóng được task Instagram cũ trước Album.', stop);
  await delay(postStepDelay());

  const baseIntentArgs = [
    '-s',
    target,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.SEND_MULTIPLE',
    '-t',
    'image/*',
    '--grant-read-uri-permission',
    '--eul',
    'android.intent.extra.STREAM',
    imageUris.join(',')
  ];
  const intentAttempts = [
    {
      args: [...baseIntentArgs, '-n', `${config.appPackage}/${instagramFeedShareActivity}`],
      method: 'feed_share_activity_album_multiple'
    },
    {
      args: [...baseIntentArgs, '-p', config.appPackage],
      method: 'package_share_album_multiple'
    }
  ];

  let shareIntent = null;
  let intentArgs = intentAttempts[0].args;
  let method = intentAttempts[0].method;
  let bootstrap = null;

  for (let index = 0; index < intentAttempts.length; index += 1) {
    if (index > 0) {
      await prewarmInstagramForShare(account, userId, target, config, { force: true, reason: intentAttempts[index].method });
    }
    intentArgs = intentAttempts[index].args;
    method = intentAttempts[index].method;
    const shareAttempt = await runInstagramShareIntentWithAdbRetry(account, userId, target, intentArgs);
    target = shareAttempt.target;
    intentArgs = shareAttempt.intentArgs;
    shareIntent = shareAttempt.result;
    await writeLog(
      userId,
      account._id,
      shareIntent.ok ? 'info' : 'warn',
      'instagram_post_open_album_share_composer',
      shareIntent.ok ? 'Đã mở Instagram Album bằng Android SEND_MULTIPLE.' : 'Không mở được Instagram Album bằng Android SEND_MULTIPLE.',
      {
        ...shareIntent,
        args: maskShareIntentArgs(intentArgs),
        method,
        imageCount: imageUris.length
      }
    );
    if (!shareIntent.ok) continue;

    bootstrap = await waitForInstagramComposerBootstrap(account, userId, target, config, text, method, 24_000);
    if (bootstrap.ok) break;
    await writeLog(userId, account._id, 'warn', 'instagram_post_album_multi_bootstrap_retry', 'Instagram đã nhận SEND_MULTIPLE nhưng chưa hiện màn Next/Share; thử phương thức kế tiếp.', {
      method,
      bootstrap
    });
  }

  const opened = Boolean(shareIntent?.ok && bootstrap?.ok);
  await writeLog(userId, account._id, opened ? 'info' : 'warn', 'instagram_post_album_multi_opened', opened ? 'Instagram Album composer đã sẵn sàng bằng SEND_MULTIPLE.' : 'SEND_MULTIPLE chưa mở được Album composer.', {
    ...shareIntent,
    args: maskShareIntentArgs(intentArgs),
    method,
    imageCount: imageUris.length,
    bootstrap
  });

  return opened
    ? { ...shareIntent, ok: true, method, imageCount: imageUris.length, bootstrap }
    : { ok: false, method, imageCount: imageUris.length, shareIntent, bootstrap, error: shareIntent?.error || shareIntent?.stderr || bootstrap?.error || 'SEND_MULTIPLE không mở được Album composer.' };
}

function isInstagramSendMultipleUnsupported(result = null) {
  if (!result) return false;
  const text = JSON.stringify(result).slice(0, 5000);
  return /Unknown option:\s*--eul/i.test(text);
}

function isInstagramShareHandlerStuck(result = null) {
  if (!result) return false;
  const text = JSON.stringify(result).slice(0, 5000);
  return /ShareHandlerActivity/i.test(text)
    && /chưa hiện màn Next\/Share|no_uiautomator_nodes|no_known_labels/i.test(text);
}

async function openInstagramNativeAlbumComposer(account, userId, target, config, text, images, firstImageComposer = null) {
  await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', config.appPackage], { timeoutMs: 10_000 });
  await delay(postStepDelay(1.5));

  const home = await openInstagramHomeForAlbum(account, userId, target, config.appPackage);
  if (!home.ok) throw new Error(home.error || 'Không mở được Instagram Home để tạo Album.');

  const gallery = await openInstagramAlbumGallery(account, userId, target, config.appPackage, 3);
  if (!gallery) throw new Error('Instagram không mở được thư viện Album từ Home/Create.');

  const multiple = await enableInstagramSelectMultiple(account, userId, target, gallery.nodes);
  if (!multiple.ok) throw new Error(multiple.error);

  const selection = await selectInstagramRecentAlbumPhotos(account, userId, target, images.length, {
    initialSelectedCount: 0
  });
  if (!selection.ok) throw new Error(selection.error);

  const nodes = await dumpVisibleNodes(target);
  const next = await tapTextOrPoint(account, userId, target, instagramNextLabels, getInstagramBottomRightFallbackPoint(nodes), 'instagram_post_album_tap_next', {
    exact: true,
    preferBottomRight: true,
    nodes
  });
  await delay(postStepDelay(1.5));
  const finalNodes = await dumpVisibleNodes(target);
  const finalState = detectInstagramState(finalNodes, text);
  await writeLog(userId, account._id, 'info', 'instagram_post_album_ready_native', `Đã chọn ${images.length} ảnh cho Album Instagram qua Home/Create.`, {
    imageCount: images.length,
    selectedCount: selection.selectedCount,
    homeState: home.state,
    multiple,
    next,
    state: finalState
  });
  return {
    ok: true,
    method: 'instagram_home_create_carousel',
    imageCount: images.length,
    firstImageComposer,
    home,
    gallery,
    multiple,
    selection,
    next,
    bootstrap: {
      ok: ['next', 'caption', 'info_dialog'].includes(finalState.name),
      method: 'instagram_home_create_carousel',
      state: finalState
    }
  };
}

async function openInstagramNativeSinglePhotoComposer(account, userId, target, config, text, images, failedShareComposer = null) {
  await writeLog(userId, account._id, 'warn', 'instagram_post_single_native_fallback', 'Share intent Instagram không ổn định; chuyển sang luồng Home/Create để chọn ảnh đơn.', {
    failedShareComposer
  });
  const systemUi = await waitForSystemUiHealthy(account, userId, target, {
    phase: 'instagram_single_native_fallback',
    stableChecks: 2,
    maxAttempts: 8
  });
  if (!systemUi.ok) {
    return {
      ok: false,
      error: systemUi.error || 'System UI của LDPlayer chưa ổn định trước fallback Home/Create.',
      systemUi
    };
  }
  if (hasTransientAdbFailureDetails(failedShareComposer)) {
    const recovery = await recoverInstagramAdbAfterCleanup(account, userId, target);
    if (!recovery.ok) {
      return {
        ok: false,
        error: 'ADB không ổn định sau khi mở share intent Instagram; đã dừng fallback native để tránh treo API.',
        recovery
      };
    }
    target = recovery.health?.resolvedTarget || target;
    await writeLog(userId, account._id, 'info', 'instagram_post_single_native_adb_recovered', 'Đã recovery ADB trước khi chạy fallback Home/Create cho ảnh đơn Instagram.', {
      target,
      recovery
    });
  }
  await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', config.appPackage], { timeoutMs: 10_000 });
  await delay(postStepDelay(1.5));

  const home = await openInstagramHomeForAlbum(account, userId, target, config.appPackage);
  if (!home.ok) return { ok: false, error: home.error || 'Không mở được Instagram Home để tạo bài ảnh đơn.', home };

  const gallery = await openInstagramAlbumGallery(account, userId, target, config.appPackage, 3);
  if (!gallery) return { ok: false, error: 'Instagram không mở được thư viện ảnh từ Home/Create.', home, gallery };

  const selection = await selectInstagramRecentAlbumPhotos(account, userId, target, 1, {
    initialSelectedCount: 0
  });
  if (!selection.ok) return { ok: false, error: selection.error, home, gallery, selection };

  const nodes = await dumpVisibleNodes(target);
  const next = await tapTextOrPoint(account, userId, target, instagramNextLabels, getInstagramBottomRightFallbackPoint(nodes), 'instagram_post_single_native_tap_next', {
    exact: true,
    preferBottomRight: true,
    nodes
  });
  await delay(postStepDelay(1.5));
  const ready = await waitForInstagramState(target, text, ['next', 'caption', 'info_dialog', 'blocked'], 12_000);
  const finalNodes = ready?.nodes || await dumpVisibleNodes(target);
  const finalState = ready?.state || detectInstagramState(finalNodes, text);
  await writeLog(userId, account._id, ['next', 'caption', 'info_dialog'].includes(finalState.name) ? 'info' : 'warn', 'instagram_post_single_native_ready', 'Đã mở composer ảnh đơn Instagram qua Home/Create.', {
    imageCount: images.length,
    homeState: home.state,
    selection,
    next,
    state: finalState
  });
  return ['next', 'caption', 'info_dialog'].includes(finalState.name)
    ? {
      ok: true,
      method: 'instagram_home_create_single_photo',
      imageCount: 1,
      failedShareComposer,
      home,
      gallery,
      selection,
      next,
      bootstrap: {
        ok: true,
        method: 'instagram_home_create_single_photo',
        state: finalState
      }
    }
    : {
      ok: false,
      error: 'Luồng Home/Create chưa đưa Instagram tới màn Next/Caption.',
      method: 'instagram_home_create_single_photo',
      home,
      gallery,
      selection,
      next,
      state: finalState
    };
}

async function waitForInstagramAddMoreButton(target, timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(450);
    const nodes = await dumpVisibleNodes(target);
    const node = findInstagramAddMoreMediaButton(nodes);
    if (node) return { node, nodes };
  }
  return null;
}

function findInstagramAddMoreMediaButton(nodes = []) {
  return findNodeInNodes(nodes, instagramAddMoreMediaLabels, { exact: true })
    || nodes.find((node) => /add more photos? and videos?/i.test(node.desc || node.text || ''))
    || null;
}

function findInstagramCreateButton(nodes = []) {
  return findNodeInNodes(nodes, instagramCreateLabels, { exact: true })
    || nodes.find((node) => /com\.instagram\.android:id\/creation_tab/i.test(node.raw || ''))
    || null;
}

async function enableInstagramSelectMultiple(account, userId, target, nodes = []) {
  let currentNodes = nodes?.length ? nodes : await dumpVisibleNodes(target);
  let selectNode = findNodeInNodes(currentNodes, instagramSelectMultipleLabels)
    || currentNodes.find((node) => /multi_select_slide_button/i.test(node.raw || ''));
  if (!selectNode) {
    return { ok: false, error: 'Không tìm thấy nút Select multiple trong thư viện Instagram.' };
  }
  const bounds = selectNode.bounds || selectNode;
  const point = {
    x: Math.round((bounds.left + bounds.right) / 2),
    y: Math.round((bounds.top + bounds.bottom) / 2)
  };
  const tap = await tapAndLog(userId, account._id, target, 'instagram_post_enable_select_multiple', point);
  await delay(postStepDelay(1.2));
  currentNodes = await dumpVisibleNodes(target);
  await writeLog(userId, account._id, tap.ok ? 'info' : 'warn', 'instagram_post_select_multiple_enabled', tap.ok ? 'Đã bật Select multiple trong thư viện Instagram.' : 'Không bật được Select multiple.', {
    tap,
    point
  });
  return { ok: tap.ok, tap, point, nodes: currentNodes, error: tap.error || tap.stderr || '' };
}

async function waitForInstagramAddMoreGallery(target, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(450);
    const nodes = await dumpVisibleNodes(target);
    const permission = findNodeInNodes(nodes, galleryPermissionLabels);
    if (permission) {
      await runCommand(env.mobileAutomation.adbPath, [
        '-s',
        target,
        'shell',
        'input',
        'tap',
        String(Math.round((permission.left + permission.right) / 2)),
        String(Math.round((permission.top + permission.bottom) / 2))
      ], { timeoutMs: 8_000 });
      await delay(postStepDelay(1.5));
      continue;
    }
    const hasPhotos = nodes.some((node) => /gallery_grid_item_thumbnail/i.test(node.raw || ''))
      || nodes.some((node) => /(?:Unselected\s+)?Photo thumbnail|Ảnh chụp|Anh chup/i.test(node.desc || node.text || ''));
    const hasNext = findNodeInNodes(nodes, instagramNextLabels, { exact: true });
    const hasSelectMultiple = findNodeInNodes(nodes, instagramSelectMultipleLabels)
      || nodes.some((node) => /multi_select_slide_button/i.test(node.raw || ''));
    const hasGalleryTitle = findNodeInNodes(nodes, [...instagramNewPostLabels, ...galleryLabels])
      || nodes.some((node) => /new_post_title|gallery|recents/i.test(node.raw || node.text || node.desc || ''));
    if (hasPhotos && (hasNext || hasSelectMultiple || hasGalleryTitle)) return { nodes };
  }
  return null;
}

async function openInstagramHomeForAlbum(account, userId, target, packageName) {
  let launch = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'monkey',
    '-p',
    packageName,
    '-c',
    'android.intent.category.LAUNCHER',
    '1'
  ], { timeoutMs: 8_000, retryTransient: false });
  let ready = await waitForInstagramAlbumEntry(target, packageName, 15_000);
  if (ready) return { ok: true, launch, ...ready };

  await writeLog(userId, account._id, 'warn', 'instagram_post_album_home_restart', 'Instagram chưa render Home/Create, đang khởi động lại app để thoát màn trắng.', {
    launch
  });
  if (!launch.ok) {
    return {
      ok: false,
      launch,
      error: launch.error || launch.stderr || 'Instagram Home không phản hồi khi mở bằng ADB monkey.'
    };
  }
  launch = await launchAppFresh(target, packageName);
  if (!launch.ok) return { ok: false, launch, error: launch.error || launch.stderr || 'Không mở được Instagram.' };

  ready = await waitForInstagramAlbumEntry(target, packageName, 30_000);
  if (ready) return { ok: true, launch, restarted: true, ...ready };
  return {
    ok: false,
    launch,
    error: 'Instagram vẫn ở màn trắng hoặc chưa hiển thị nút Create sau khi khởi động lại.'
  };
}

function hasTransientAdbFailureDetails(value = null) {
  if (!value) return false;
  const text = JSON.stringify(value).slice(0, 4000);
  return /SIGTERM|timed out|timeout|offline|no devices|not found|closed|transport error|protocol fault|killed/i.test(text);
}

async function waitForInstagramAlbumEntry(target, packageName, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(700);
    const [nodes, foreground] = await Promise.all([
      dumpVisibleNodes(target),
      getForegroundAndroidPackage(target)
    ]);
    const instagramNodeVisible = nodes.some((node) => /package="com\.instagram\.android"/i.test(node.raw || ''));
    if (foreground.packageName !== packageName && !instagramNodeVisible) continue;
    const hasGallery = (findNodeInNodes(nodes, instagramNewPostLabels, { exact: true })
      || nodes.some((node) => /new_post_title/i.test(node.raw || '')))
      && (findNodeInNodes(nodes, instagramSelectMultipleLabels)
        || nodes.some((node) => /multi_select_slide_button/i.test(node.raw || '')));
    if (hasGallery) return { state: 'gallery', nodes, foreground, elapsedMs: Date.now() - startedAt };
    if (findInstagramCreateButton(nodes)) {
      return { state: 'home', nodes, foreground, elapsedMs: Date.now() - startedAt };
    }
  }
  return null;
}

async function openInstagramAlbumGallery(account, userId, target, packageName, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const existing = await waitForInstagramAlbumGallery(target, attempt === 1 ? 3_000 : 2_000);
    if (existing) return existing;

    let nodes = await dumpVisibleNodes(target);
    const createNode = findInstagramCreateButton(nodes);
    if (createNode) {
      const bounds = createNode.bounds || createNode;
      const point = {
        x: Math.round((bounds.left + bounds.right) / 2),
        y: Math.round((bounds.top + bounds.bottom) / 2)
      };
      await tapAndLog(userId, account._id, target, 'instagram_post_open_album_gallery', point);
      await delay(900);
      const anrState = await detectPackageAnr(target, packageName);
      if (anrState.active) {
        await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 });
        await writeLog(userId, account._id, 'error', 'instagram_post_album_create_anr', 'Instagram bị ANR sau khi bấm Create; dừng luồng Album để tránh làm ADB/LDPlayer offline.', {
          attempt,
          point,
          anrState
        });
        return null;
      }
    } else {
      await writeLog(userId, account._id, 'warn', 'instagram_post_album_create_missing', 'Chưa tìm thấy nút Create, chờ Instagram Home ổn định rồi thử lại.', {
        attempt,
        labels: nodes.map((node) => node.text || node.desc).filter(Boolean).slice(0, 40)
      });
    }

    await delay(700);
    nodes = await dumpVisibleNodes(target);
    const postDestination = findNodeInNodes(nodes, instagramPostDestinationLabels, { exact: true });
    if (postDestination && !findNodeInNodes(nodes, instagramNewPostLabels, { exact: true })) {
      const point = {
        x: Math.round((postDestination.left + postDestination.right) / 2),
        y: Math.round((postDestination.top + postDestination.bottom) / 2)
      };
      await tapAndLog(userId, account._id, target, 'instagram_post_choose_post_destination', point);
    }

    const gallery = await waitForInstagramAlbumGallery(target, 12_000);
    if (gallery) return gallery;
    await writeLog(userId, account._id, 'warn', 'instagram_post_album_gallery_retry', 'Instagram chưa hiện thư viện Album, đang thử mở lại.', {
      attempt
    });
    if (attempt < maxAttempts) {
      const recovered = await openInstagramHomeForAlbum(account, userId, target, packageName);
      if (!recovered.ok) return null;
    }
  }
  return null;
}

async function detectPackageAnr(target, packageName) {
  const windowState = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'dumpsys',
    'window',
    'windows'
  ], { timeoutMs: 6_000 });
  const output = `${windowState.stdout || ''}\n${windowState.stderr || ''}`;
  return {
    ok: windowState.ok,
    active: hasActivePackageAnr(output, packageName),
    packageName,
    output: output.slice(0, 1200),
    error: windowState.error || windowState.stderr || ''
  };
}

async function waitForInstagramAlbumGallery(target, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(500);
    const nodes = await dumpVisibleNodes(target);
    const hasNewPost = findNodeInNodes(nodes, instagramNewPostLabels, { exact: true })
      || nodes.some((node) => /new_post_title/i.test(node.raw || ''));
    const hasSelectMultiple = findNodeInNodes(nodes, instagramSelectMultipleLabels)
      || nodes.some((node) => /multi_select_slide_button/i.test(node.raw || ''));
    if (hasNewPost && hasSelectMultiple) return { nodes };
  }
  return null;
}

async function selectInstagramRecentAlbumPhotos(account, userId, target, imageCount, options = {}) {
  let selectedCount = Number.isInteger(options.initialSelectedCount) ? options.initialSelectedCount : 1;
  let scrollCount = 0;
  let firstCandidateBounds = null;
  let tappedBounds = [];

  while (selectedCount < imageCount && scrollCount <= 10) {
    const nodes = await dumpVisibleNodes(target);
    let visibleCandidates = nodes
      .filter((node) => /gallery_grid_item_thumbnail/i.test(node.raw || ''))
      .filter((node) => /^Unselected Photo thumbnail/i.test(node.desc || ''))
      .filter((node) => {
        const height = node.bounds.bottom - node.bounds.top;
        const centerY = (node.bounds.top + node.bounds.bottom) / 2;
        return height >= 80 && centerY < 820;
      })
      .sort((left, right) => left.bounds.top - right.bounds.top || left.bounds.left - right.bounds.left);

    // Sau khi cuộn, hàng ảnh cũ vẫn còn hiển thị ở phía trên. Không tap lại
    // hàng này vì Instagram sẽ bỏ chọn ảnh đã thêm trước đó. Chỉ lấy hàng mới
    // thấp nhất vừa xuất hiện trong viewport.
    if (scrollCount > 0 && visibleCandidates.length) {
      const lowestRowTop = Math.max(...visibleCandidates.map((node) => node.bounds.top));
      visibleCandidates = visibleCandidates.filter((node) => Math.abs(node.bounds.top - lowestRowTop) <= 24);
    }

    if (options.skipFirstCandidate && !firstCandidateBounds && scrollCount === 0 && visibleCandidates.length) {
      firstCandidateBounds = { ...visibleCandidates[0].bounds };
    }

    visibleCandidates = visibleCandidates.filter((candidate) => {
      if (firstCandidateBounds && boundsOverlap(firstCandidateBounds, candidate.bounds) >= 0.8) return false;
      return !tappedBounds.some((bounds) => boundsOverlap(bounds, candidate.bounds) >= 0.8);
    });

    const candidate = visibleCandidates[0];
    if (candidate) {
      const point = {
        x: Math.round((candidate.bounds.left + candidate.bounds.right) / 2),
        y: Math.round((candidate.bounds.top + candidate.bounds.bottom) / 2)
      };
      await tapAndLog(userId, account._id, target, 'instagram_post_select_album_photo', point);
      tappedBounds.push({ ...candidate.bounds });
      selectedCount += 1;
      await delay(postStepDelay(0.5));
      // UI gallery thay đổi trạng thái node sau mỗi lần chọn. Đọc lại hierarchy
      // ở vòng kế tiếp thay vì tiếp tục dùng danh sách tọa độ cũ.
      continue;
    }

    const swipe = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'input',
      'swipe',
      '800',
      '795',
      '800',
      '590',
      '350'
    ], { timeoutMs: 10_000 });
    if (!swipe.ok) {
      return { ok: false, error: swipe.error || swipe.stderr || 'Không cuộn được thư viện Instagram.', selectedCount };
    }
    scrollCount += 1;
    tappedBounds = [];
    await delay(postStepDelay(1.5));
  }

  if (selectedCount !== imageCount) {
    return {
      ok: false,
      error: `Chỉ chọn được ${selectedCount}/${imageCount} ảnh trong thư viện Instagram.`,
      selectedCount,
      scrollCount
    };
  }
  return { ok: true, selectedCount, scrollCount };
}

async function waitForInstagramComposerBootstrap(account, userId, target, config, text, method, timeoutMs = 14_000) {
  const startedAt = Date.now();
  let deadlineAt = startedAt + timeoutMs;
  let lastState = null;
  let lastForeground = null;
  let resolverHandledAt = 0;
  let loggedShareHandlerWait = false;
  while (Date.now() < deadlineAt) {
    await delay(550);
    const [nodes, foreground] = await Promise.all([
      dumpVisibleNodes(target),
      getForegroundAndroidPackage(target)
    ]);
    let state = detectInstagramState(nodes, text);
    lastState = state;
    lastForeground = foreground;

    if (state.name === 'share_resolver') {
      if (!resolverHandledAt || Date.now() - resolverHandledAt > 5_000) {
        const resolved = await selectInstagramFeedAlways(account, userId, target, nodes);
        resolverHandledAt = Date.now();
        if (!resolved.ok) {
          return {
            ok: false,
            method,
            error: resolved.error,
            state,
            foreground,
            elapsedMs: Date.now() - startedAt
          };
        }
      }
      await delay(postStepDelay(1.5));
      deadlineAt = Math.max(deadlineAt, Date.now() + 20_000);
      continue;
    }

    if (['unknown', 'home'].includes(state.name) && foreground.packageName === config.appPackage && isInstagramCreationActivity(foreground.activityName)) {
      state = { ...state, name: 'next', reason: `activity:${foreground.activityName}`, active: foreground };
      lastState = state;
    }

    if (state.name === 'next' && isInstagramShareHandlerActivity(foreground.activityName)) {
      if (!loggedShareHandlerWait) {
        await writeLog(userId, account._id, 'info', 'instagram_post_wait_creation_activity', 'Instagram đã nhận share intent nhưng còn ở ShareHandlerActivity; đợi màn tạo bài thật để tránh bấm Next sai tọa độ.', {
          method,
          elapsedMs: Date.now() - startedAt,
          state,
          foreground
        });
        loggedShareHandlerWait = true;
      }
      continue;
    }

    if (['caption', 'info_dialog'].includes(state.name) || (state.name === 'next' && (
      isInstagramCreationActivity(foreground.activityName)
      || foreground.packageName !== config.appPackage
      || !foreground.activityName
    ))) {
      await writeLog(userId, account._id, 'info', 'instagram_post_composer_ready', `Instagram composer đã sẵn sàng qua ${method}.`, {
        method,
        elapsedMs: Date.now() - startedAt,
        state,
        foreground
      });
      return { ok: true, method, state, foreground, elapsedMs: Date.now() - startedAt };
    }
  }

  const error = lastState?.name === 'loading'
    ? 'Instagram share handler bị kẹt ở màn loading.'
    : 'Instagram share handler chưa hiện màn Next/Share.';
  await writeLog(userId, account._id, 'warn', 'instagram_post_composer_bootstrap_pending', error, {
    method,
    elapsedMs: Date.now() - startedAt,
    state: lastState,
    foreground: lastForeground
  });
  return { ok: false, method, error, state: lastState, foreground: lastForeground, elapsedMs: Date.now() - startedAt };
}

async function runInstagramPostStateMachine(account, userId, target, config, text, steps) {
  const startedAt = Date.now();
  const hardDeadlineMs = config.autoSubmit ? 150_000 : 95_000;
  let screenshot = null;
  let finalState = 'unknown';
  let recoveredEmptyUiOnce = false;
  let captionEntered = false;
  let captionAttempts = 0;
  let lastLoggedState = '';
  let nextFallbackAttempts = 0;
  let dryRunNextFallbackAttempts = 0;
  let nextTextMissingAttempts = 0;
  let semanticNextTaps = 0;
  const requiresCaption = Boolean(text.trim());

  for (let attempt = 1; attempt <= 24; attempt += 1) {
    if (Date.now() - startedAt > hardDeadlineMs) {
      await writeLog(userId, account._id, 'warn', 'instagram_post_state_machine_timeout', 'Instagram state machine vượt quá thời gian cho phép; dừng sớm để tránh treo batch hoặc làm ADB offline.', {
        finalState,
        elapsedMs: Date.now() - startedAt,
        hardDeadlineMs,
        autoSubmit: config.autoSubmit,
        semanticNextTaps,
        nextTextMissingAttempts
      });
      return { finalState, screenshot: null, steps, composerPending: true, submitVerified: false, submitReason: 'state_machine_timeout' };
    }
    const nodes = await dumpVisibleNodes(target);
    let state = detectInstagramState(nodes, text);
    let active = null;
    if (['unknown', 'home'].includes(state.name)) {
      active = await getForegroundAndroidPackage(target);
      if (active.packageName === config.appPackage && isInstagramCreationActivity(active.activityName)) {
        state = { ...state, name: 'next', reason: `activity:${active.activityName}`, active };
      }
    } else if (state.name === 'next') {
      active = await getForegroundAndroidPackage(target);
      if (active.packageName === config.appPackage && isInstagramShareHandlerActivity(active.activityName)) {
        state = { ...state, reason: 'share_handler_waiting_for_creation_activity', active };
      }
    }
    finalState = state.name;
    const stateSignature = `${state.name}:${state.reason}:${state.hasTargetText}`;
    if (stateSignature !== lastLoggedState) {
      await writeLog(userId, account._id, 'info', 'instagram_post_state', `Instagram state: ${state.name}.`, {
        attempt,
        reason: state.reason,
        hasTargetText: state.hasTargetText
      });
      lastLoggedState = stateSignature;
    }

    if (state.name === 'info_dialog') {
      const ok = await tapTextOrPoint(account, userId, target, instagramDismissLabels, { x: 800, y: 716 }, 'instagram_post_dismiss_info_dialog', { exact: true, nodes });
      steps.push(ok);
      await delay(postStepDelay());
      continue;
    }

    if (state.name === 'share_resolver') {
      const resolved = await selectInstagramFeedAlways(account, userId, target, nodes);
      steps.push(...resolved.steps);
      if (!resolved.ok) throw new Error(resolved.error);
      await delay(postStepDelay(1.5));
      continue;
    }

    if (state.name === 'blocked') {
      screenshot = await captureScreenshot(account, userId, 'instagram_post_blocked');
      throw new Error('Instagram đang ở màn đăng nhập/checkpoint/session expired. Cần xử lý thủ công trước khi tự đăng.');
    }

    if (state.name === 'preview') {
      const back = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '4'], { timeoutMs: 10_000 });
      steps.push(back);
      await writeLog(userId, account._id, back.ok ? 'info' : 'warn', 'instagram_post_close_preview', back.ok ? 'Đã quay lại màn tạo bài từ Preview.' : 'Không thoát được màn Preview.', {
        ...back,
        state
      });
      await delay(postStepDelay(1.2));
      continue;
    }

    if (state.name === 'submitting') {
      if (!config.autoSubmit) {
        screenshot = await captureScreenshot(account, userId, 'instagram_post_dry_run_unexpected_submit');
        await writeLog(userId, account._id, 'error', 'instagram_post_dry_run_unexpected_submit', 'Dry-run phát hiện Instagram đã chuyển sang trạng thái gửi; dừng và báo lỗi vì autoSubmit=false.', {
          state,
          attempt
        });
        return { finalState: state.name, screenshot, steps, composerPending: false, submitVerified: false, submitReason: 'dry_run_unexpected_submit' };
      }
      const verification = await verifyInstagramPostSubmit(account, userId, target, config.waitAfterSubmitMs);
      return { finalState: verification.ok ? 'submitted' : verification.finalState, screenshot: verification.screenshot, steps, composerPending: verification.composerPending, submitVerified: verification.ok, submitReason: verification.reason };
    }

    if (state.name === 'submitted') {
      if (!config.autoSubmit) {
        screenshot = await captureScreenshot(account, userId, 'instagram_post_dry_run_unexpected_submitted');
        await writeLog(userId, account._id, 'error', 'instagram_post_dry_run_unexpected_submitted', 'Dry-run phát hiện Instagram đã rời composer như đã gửi; báo lỗi vì autoSubmit=false.', {
          state,
          attempt
        });
        return { finalState: state.name, screenshot, steps, composerPending: false, submitVerified: false, submitReason: 'dry_run_unexpected_submitted' };
      }
      screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
      return { finalState: 'submitted', screenshot, steps, composerPending: false, submitVerified: true, submitReason: 'share_confirmation_visible' };
    }

    if (requiresCaption && !captionEntered && ['home'].includes(state.name)) {
      screenshot = await captureScreenshot(account, userId, 'instagram_post_caption_missing_before_submit');
      await writeLog(userId, account._id, 'warn', 'instagram_post_caption_missing_before_submit', 'Instagram đã rời màn soạn trước khi automation xác minh được caption; dừng để tránh đăng thiếu emoji/hashtag.', {
        state,
        captionAttempts,
        textLength: text.length
      });
      return { finalState: state.name, screenshot, steps, composerPending: false, submitVerified: false, submitReason: 'caption_missing_before_submit' };
    }

    if (state.name === 'next') {
      if (state.reason === 'share_handler_waiting_for_creation_activity') {
        await writeLog(userId, account._id, 'info', 'instagram_post_share_handler_wait', 'Instagram vẫn ở ShareHandlerActivity; chưa bấm Next để tránh kẹt màn tạo bài.', {
          attempt,
          state,
          visibleLabels: summarizeVisibleLabels(nodes)
        });
        await delay(postStepDelay(1.5));
        continue;
      }
      const nextMatch = findNodeInNodes(nodes, instagramNextLabels, { exact: true, preferBottomRight: true });
      const submitRisk = hasInstagramSubmitRisk(nodes);
      const loadingOnly = hasInstagramLoadingOnly(nodes);
      if (!nextMatch && loadingOnly) {
        await writeLog(userId, account._id, 'info', 'instagram_post_next_loading_wait', 'Instagram đang xử lý màn Next/Loading; tiếp tục đợi thay vì dừng batch quá sớm.', {
          attempt,
          state,
          elapsedMs: Date.now() - startedAt,
          visibleLabels: summarizeVisibleLabels(nodes)
        });
        await delay(postStepDelay(1.8));
        continue;
      }
      nextTextMissingAttempts = nextMatch ? 0 : nextTextMissingAttempts + 1;
      if (!config.autoSubmit && requiresCaption && submitRisk.ok) {
        screenshot = await captureScreenshot(account, userId, 'instagram_post_dry_run_submit_risk_on_next');
        await writeLog(userId, account._id, 'error', 'instagram_post_dry_run_submit_risk_on_next', 'Dry-run thấy dấu hiệu Share/submitting khi state vẫn là Next; dừng để tránh đăng thật.', {
          attempt,
          state,
          semanticNextTaps,
          submitRisk,
          visibleLabels: summarizeVisibleLabels(nodes)
        });
        return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'dry_run_submit_risk_on_next' };
      }
      if (!config.autoSubmit && requiresCaption && semanticNextTaps >= 2) {
        screenshot = await captureScreenshot(account, userId, 'instagram_post_dry_run_next_not_advancing');
        await writeLog(userId, account._id, 'warn', 'instagram_post_dry_run_next_not_advancing', 'Dry-run đã bấm Next hai lần nhưng Instagram chưa chuyển sang caption; dừng để tránh bấm nhầm sang bước Share/đăng.', {
          attempt,
          state,
          semanticNextTaps,
          textLength: text.length,
          visibleLabels: summarizeVisibleLabels(nodes)
        });
        return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'dry_run_next_not_advancing' };
      }
      if (!nextMatch && requiresCaption) {
        const canDryRunCoordinateNext = !config.autoSubmit
          && /^activity:/i.test(state.reason || '')
          && isInstagramCreationActivity(state.active?.activityName)
          && !submitRisk.ok
          && (semanticNextTaps >= 1 || nextTextMissingAttempts >= 1)
          && dryRunNextFallbackAttempts < 1;
        if (canDryRunCoordinateNext) {
          dryRunNextFallbackAttempts += 1;
          const fallbackPoint = await getInstagramNextFallbackPoint(target, nodes);
          const next = await tapAndLog(userId, account._id, target, 'instagram_post_dry_run_tap_next_activity_fallback', fallbackPoint);
          steps.push(next);
          await writeLog(userId, account._id, next.ok ? 'info' : 'warn', 'instagram_post_dry_run_next_activity_fallback', next.ok ? 'Dry-run đã bấm Next bằng tọa độ fallback trong MediaCaptureActivity vì UIAutomator không trả node Next.' : 'Dry-run không bấm được Next fallback trong MediaCaptureActivity.', {
            attempt,
            state,
            point: fallbackPoint,
            semanticNextTaps,
            dryRunNextFallbackAttempts
          });
          await waitForInstagramState(target, text, ['caption', 'info_dialog', 'blocked', 'submitting'], 8_000);
          continue;
        }
        if (!config.autoSubmit && nextTextMissingAttempts >= 3) {
          await writeLog(userId, account._id, 'warn', 'instagram_post_next_text_missing_stuck', 'Instagram đang ở màn tạo nội dung nhưng không trả node Next nhiều lần; dừng dry-run để tránh treo và tránh bấm tọa độ mù.', {
            attempt,
            state,
            semanticNextTaps,
            dryRunNextFallbackAttempts,
            nextTextMissingAttempts,
            elapsedMs: Date.now() - startedAt,
            visibleLabels: summarizeVisibleLabels(nodes)
          });
          return { finalState, screenshot: null, steps, composerPending: true, submitVerified: false, submitReason: 'next_text_missing_stuck' };
        }
        const allowCoordinateFallback = config.autoSubmit && /^activity:/i.test(state.reason || '') && attempt >= 3;
        if (allowCoordinateFallback) {
          nextFallbackAttempts += 1;
          if (nextFallbackAttempts > 2) {
            screenshot = await captureScreenshot(account, userId, 'instagram_post_next_fallback_stuck');
            await writeLog(userId, account._id, 'warn', 'instagram_post_next_fallback_stuck', 'Đã bấm Next fallback nhiều lần nhưng Instagram không chuyển màn; dừng gate để tránh treo lâu.', {
              attempt,
              state,
              nextFallbackAttempts
            });
            return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'next_fallback_stuck' };
          }
          const fallbackPoint = await getInstagramNextFallbackPoint(target, nodes);
          const next = await tapAndLog(userId, account._id, target, 'instagram_post_tap_next_activity_fallback', fallbackPoint);
          steps.push(next);
          await writeLog(userId, account._id, next.ok ? 'info' : 'warn', 'instagram_post_next_activity_fallback', next.ok ? 'Đã bấm Next bằng tọa độ fallback khi ShareHandlerActivity không trả node.' : 'Không bấm được Next bằng tọa độ fallback.', {
            attempt,
            state,
            point: fallbackPoint
          });
          await waitForInstagramState(target, text, ['caption', 'info_dialog', 'blocked'], 8_000);
          continue;
        }
        await writeLog(userId, account._id, 'warn', 'instagram_post_next_text_missing', 'Instagram đang ở màn tạo nội dung nhưng không thấy nút Next; không bấm tọa độ để tránh đăng thiếu caption.', {
          state,
          textLength: text.length
        });
        await delay(postStepDelay(1.25));
        continue;
      }
      const next = await tapTextOrPoint(account, userId, target, instagramNextLabels, getInstagramBottomRightFallbackPoint(nodes), 'instagram_post_tap_next', { exact: true, preferBottomRight: true, nodes });
      steps.push(next);
      if (next.ok) semanticNextTaps += 1;
      await waitForInstagramState(target, text, ['caption', 'info_dialog', 'blocked', 'submitting'], 6_000);
      continue;
    }

    if (state.name === 'caption') {
      if (text.trim() && !captionEntered && !state.hasTargetText && captionAttempts < 3) {
        captionAttempts += 1;
        const caption = await enterInstagramCaption(account, userId, target, text, nodes);
        steps.push(...caption.steps);
        if (caption.clearFailed) {
          return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'caption_clear_failed' };
        }
        captionEntered = caption.hasTargetText;
        if (captionEntered) {
          if (!config.autoSubmit) {
            screenshot = await captureScreenshot(account, userId, 'instagram_post_ready_to_share');
            return { finalState, screenshot, steps, composerPending: false, submitVerified: false, submitReason: 'review_mode' };
          }
          return submitInstagramShare(account, userId, target, config, steps, finalState);
        }
        await delay(postStepDelay(0.75));
        continue;
      }

      if (requiresCaption && !state.hasTargetText) {
        if (captionAttempts < 3) {
          captionAttempts += 1;
          const caption = await enterInstagramCaption(account, userId, target, text, nodes);
          steps.push(...caption.steps);
          if (caption.clearFailed) {
            return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'caption_clear_failed' };
          }
          captionEntered = caption.hasTargetText;
          if (captionEntered) {
            if (!config.autoSubmit) {
              screenshot = await captureScreenshot(account, userId, 'instagram_post_ready_to_share');
              return { finalState, screenshot, steps, composerPending: false, submitVerified: false, submitReason: 'review_mode' };
            }
            return submitInstagramShare(account, userId, target, config, steps, finalState);
          }
          await delay(postStepDelay(0.75));
          continue;
        }
        screenshot = await captureScreenshot(account, userId, 'instagram_post_caption_not_verified');
        await writeLog(userId, account._id, 'warn', 'instagram_post_caption_not_verified', 'Đã dừng trước khi Share vì chưa xác minh được caption trong Instagram.', {
          captionAttempts,
          textLength: text.length
        });
        return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'caption_not_verified' };
      }

      if (!config.autoSubmit) {
        screenshot = await captureScreenshot(account, userId, 'instagram_post_ready_to_share');
        return { finalState, screenshot, steps, composerPending: false, submitVerified: false, submitReason: 'review_mode' };
      }

      return submitInstagramShare(account, userId, target, config, steps, finalState);
    }

    await delay(postStepDelay(attempt <= 4 ? 1.75 : 1.25));
  }

  screenshot = await captureScreenshot(account, userId, 'instagram_post_state_machine_pending');
  await writeLog(userId, account._id, 'warn', 'instagram_post_state_machine_pending', 'Không đưa được Instagram tới trạng thái share sau nhiều bước.', {
    finalState
  });
  return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'state_machine_pending' };
}

async function submitInstagramShare(account, userId, target, config, steps, finalState) {
  const share = await tapInstagramShareButton(account, userId, target, 'instagram_post_tap_share');
  steps.push(share);
  await delay(postStepDelay(1.5));

  let verification = await verifyInstagramPostSubmit(account, userId, target, Math.max(10_000, Math.min(config.waitAfterSubmitMs || 0, 14_000)));
  for (let retry = 1; !verification.ok && verification.reason === 'still_on_share_screen' && retry <= 2; retry += 1) {
    const retryShare = await tapInstagramShareButton(account, userId, target, 'instagram_post_tap_share_retry');
    steps.push(retryShare);
    verification = await verifyInstagramPostSubmit(account, userId, target, config.waitAfterSubmitMs);
  }
  return { finalState: verification.ok ? 'submitted' : verification.finalState, screenshot: verification.screenshot, steps, composerPending: verification.composerPending, submitVerified: verification.ok, submitReason: verification.reason };
}

function isInstagramCreationActivity(activityName = '') {
  return /MediaCaptureActivity/i.test(String(activityName || ''));
}

function isInstagramShareHandlerActivity(activityName = '') {
  return /ShareHandlerActivity/i.test(String(activityName || ''));
}

function isInstagramPostSubmitClosedActivity(activityName = '') {
  const value = String(activityName || '');
  return /InstagramMainActivity|MainTabActivity/i.test(value)
    || (value && !isInstagramCreationActivity(value) && !isInstagramShareHandlerActivity(value));
}

async function tapInstagramShareButton(account, userId, target, action) {
  let nodes = await dumpVisibleNodes(target);
  let state = detectInstagramState(nodes, '');
  if (state.name === 'preview') {
    const back = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '4'], { timeoutMs: 10_000 });
    await writeLog(userId, account._id, back.ok ? 'info' : 'warn', 'instagram_post_close_preview_before_share', back.ok ? 'Đã thoát màn Preview trước khi bấm Share.' : 'Không thoát được màn Preview.', {
      ...back,
      state
    });
    await delay(postStepDelay(1.2));
    nodes = await dumpVisibleNodes(target);
    state = detectInstagramState(nodes, '');
  }

  let shareNode = findInstagramShareButton(nodes);
  const doneNode = findNodeInNodes(nodes, instagramDoneLabels, { exact: true, preferBottomRight: true });
  if (doneNode) {
    const donePoint = {
      x: Math.round((doneNode.left + doneNode.right) / 2),
      y: Math.round((doneNode.top + doneNode.bottom) / 2)
    };
    const done = await tapAndLog(userId, account._id, target, `${action}_dismiss_done`, donePoint);
    await writeLog(userId, account._id, done.ok ? 'info' : 'warn', 'instagram_post_dismiss_done_before_share', done.ok ? 'Đã bấm Done để đóng bàn phím trước khi bấm Share.' : 'Không bấm được Done trước khi bấm Share.', {
      bounds: doneNode,
      point: donePoint,
      state
    });
    await delay(postStepDelay(1.3));
    nodes = await dumpVisibleNodes(target);
    state = detectInstagramState(nodes, '');
    shareNode = findInstagramShareButton(nodes);
  }
  if (shareNode) {
    const width = nodes.reduce((max, node) => Math.max(max, node.bounds?.right || 0), 0) || shareNode.right || 900;
    const nodeWidth = Math.max(0, shareNode.right - shareNode.left);
    const point = {
      x: nodeWidth >= width * 0.75
        ? Math.round(shareNode.right - Math.min(120, nodeWidth * 0.08))
        : Math.round((shareNode.left + shareNode.right) / 2),
      y: Math.round((shareNode.top + shareNode.bottom) / 2)
    };
    const result = await tapAndLog(userId, account._id, target, action, point);
    await writeLog(userId, account._id, 'info', `${action}_by_node`, 'Tap nút Share Instagram theo node.', {
      bounds: shareNode,
      point
    });
    return { ...result, point, matchedText: shareNode.label || 'Share' };
  }

  const screenshot = await captureScreenshot(account, userId, 'instagram_post_share_button_missing');
  await writeLog(userId, account._id, 'error', 'instagram_post_share_button_missing', 'Không tìm thấy nút Share Instagram; dừng để tránh bấm nhầm vào ảnh Preview.', {
    state,
    screenshot
  });
  throw new Error('Không tìm thấy nút Share Instagram.');
}

async function enterInstagramCaption(account, userId, target, text, nodes = []) {
  const steps = [];
  const captionNode = findInstagramCaptionInput(nodes);
  const existingCaptionText = captionNode?.text && !/add a caption|write a caption/i.test(captionNode.text)
    ? String(captionNode.text)
    : '';
  if (captionNode) {
    const point = {
      x: Math.round((captionNode.left + captionNode.right) / 2),
      y: Math.round((captionNode.top + captionNode.bottom) / 2)
    };
    const tap = await tapAndLog(userId, account._id, target, 'instagram_post_tap_caption_field', point);
    steps.push(tap);
    await writeLog(userId, account._id, 'info', 'instagram_post_tap_caption_field_by_node', 'Đã focus ô caption Instagram.', {
      bounds: captionNode,
      point
    });
  } else {
    const captionTap = await tapTextOrPoint(account, userId, target, instagramCaptionLabels, getInstagramCaptionFallbackPoint(nodes), 'instagram_post_tap_caption', { nodes });
    steps.push(captionTap);
  }
  await delay(postStepDelay(0.7));

  const inputText = prepareInstagramCaptionInput(text);
  if (existingCaptionText) {
    const clear = await clearFocusedTextWithDeleteKey(target, Math.min(180, Math.max(40, existingCaptionText.length + 20)));
    steps.push(clear);
    await writeLog(userId, account._id, clear.ok ? 'info' : 'warn', 'instagram_post_clear_existing_caption', clear.ok ? 'Đã xóa caption cũ trước khi nhập caption mới.' : 'Không xóa chắc chắn được caption cũ trước khi nhập mới.', {
      existingLength: existingCaptionText.length,
      clear
    });
    if (!clear.ok) {
      return { steps, hasTargetText: false, clearFailed: true };
    }
    await delay(postStepDelay(0.5));
  }
  let input = await replaceFocusedText(target, inputText);
  if (!input.ok) {
    await writeLog(userId, account._id, 'warn', 'instagram_post_replace_caption_unavailable', 'Không replace được caption bằng ADB Keyboard, chuyển sang paste/input.', input);
    input = await inputDeviceText(target, inputText);
  }
  steps.push(input);
  await writeLog(userId, account._id, input.ok ? 'info' : 'error', 'instagram_post_input_caption', input.ok ? 'Đã nhập caption Instagram.' : 'Không nhập được caption Instagram.', input);
  if (!input.ok) throw new Error(input.error || input.stderr || 'instagram_post_input_caption failed.');

  await delay(postStepDelay(0.75));
  const verifyNodes = await dumpVisibleNodes(target);
  const captionVerification = verifyCompleteCaption(verifyNodes, text);
  const hasTargetText = captionVerification.ok;
  await writeLog(userId, account._id, hasTargetText ? 'info' : 'warn', 'instagram_post_verify_caption', hasTargetText ? 'Đã xác nhận caption xuất hiện trong Instagram.' : 'Chưa xác nhận được caption trong Instagram sau khi nhập.', {
    method: input.method,
    textLength: text.length,
    verification: captionVerification
  });
  return { steps, hasTargetText };
}

function prepareInstagramCaptionInput(text) {
  const value = cleanClipboardText(text).trimEnd();
  // Một delimiter sau hashtag cuối sẽ đóng gợi ý autocomplete của Instagram.
  // Instagram tự bỏ khoảng trắng cuối khi lưu caption.
  return /#[\p{L}\p{N}_]+$/u.test(value) ? `${value} ` : value;
}

function getInstagramCaptionFallbackPoint(nodes = []) {
  const width = nodes.reduce((max, node) => Math.max(max, node.bounds?.right || 0), 0) || 900;
  const height = nodes.reduce((max, node) => Math.max(max, node.bounds?.bottom || 0), 0) || 1600;
  if (width > height) {
    return {
      x: Math.round(width * 0.68),
      y: Math.round(height * 0.28)
    };
  }
  return {
    x: Math.round(width * 0.5),
    y: Math.round(height * 0.33)
  };
}

function getInstagramBottomRightFallbackPoint(nodes = []) {
  const width = nodes.reduce((max, node) => Math.max(max, node.bounds?.right || 0), 0) || 900;
  const height = nodes.reduce((max, node) => Math.max(max, node.bounds?.bottom || 0), 0) || 1600;
  return {
    x: Math.round(width * 0.94),
    y: Math.round(height * 0.08)
  };
}

async function getInstagramNextFallbackPoint(target, nodes = []) {
  let width = nodes.reduce((max, node) => Math.max(max, node.bounds?.right || 0), 0);
  let height = nodes.reduce((max, node) => Math.max(max, node.bounds?.bottom || 0), 0);
  const size = await getDeviceScreenSize(target);
  if (size?.width && size?.height && size.width > size.height) {
    width = size.width;
    height = size.height;
  } else if (!width || !height) {
    width = size?.width || 900;
    height = size?.height || 1600;
  }
  if (width > height && width < 1400) {
    // LDPlayer can report a scaled wm size (for example 1240x615) while ADB
    // input still uses the 1600x900 surface coordinates returned by UI nodes.
    width = 1600;
    height = 900;
  }
  if (width > height) {
    // Instagram creation UI in LDPlayer landscape exposes the actionable Next
    // affordance near the visual bottom-right of the 1600x900 surface.
    return {
      x: Math.round(width * 0.958),
      y: Math.round(height * 0.949)
    };
  }
  return {
    x: Math.round(width * 0.94),
    y: Math.round(height * 0.08)
  };
}

function findInstagramCaptionInput(nodes = []) {
  const labeled = findNodeInNodes(nodes, instagramCaptionLabels);
  if (labeled) return labeled;
  const editTexts = nodes
    .filter((node) => /EditText/i.test(node.className || '') && node.enabled !== false)
    .map((node) => {
      const width = Math.max(0, node.bounds.right - node.bounds.left);
      const height = Math.max(0, node.bounds.bottom - node.bounds.top);
      return {
        ...node.bounds,
        label: node.text || node.desc || 'EditText',
        text: node.text,
        desc: node.desc,
        area: width * height
      };
    })
    .filter((node) => node.area > 1000);
  return editTexts.sort((a, b) => b.area - a.area || a.top - b.top)[0] || null;
}

function findInstagramShareButton(nodes = []) {
  const byResource = nodes.find((node) => /share_footer_button/i.test(node.raw || '') && node.enabled !== false);
  if (byResource?.bounds) {
    return {
      ...byResource.bounds,
      label: byResource.text || byResource.desc || 'Share',
      text: byResource.text,
      desc: byResource.desc
    };
  }
  return findNodeInNodes(nodes, instagramShareLabels, { exact: true, preferBottomRight: true });
}

function hasInstagramSubmitRisk(nodes = []) {
  const risk = {
    shareButton: Boolean(findInstagramShareButton(nodes)),
    shareText: Boolean(findNodeInNodes(nodes, instagramShareLabels, { exact: true })),
    progress: Boolean(findNodeInNodes(nodes, instagramSharingProgressLabels)),
    submitted: Boolean(findNodeInNodes(nodes, instagramSharedConfirmationLabels))
  };
  return {
    ...risk,
    ok: risk.shareButton || risk.shareText || risk.progress || risk.submitted
  };
}

function hasInstagramLoadingOnly(nodes = []) {
  const labels = summarizeVisibleLabels(nodes, 8);
  if (!labels.length) return false;
  return labels.every((label) => /^loading(?:…|\.\.\.)?$/i.test(String(label).trim()));
}

function summarizeVisibleLabels(nodes = [], limit = 40) {
  return Array.from(new Set(
    nodes
      .map((node) => String(node.text || node.desc || '').trim())
      .filter(Boolean)
  )).slice(0, limit);
}

async function selectInstagramFeedAlways(account, userId, target, nodes = []) {
  const steps = [];
  let currentNodes = nodes;
  let alwaysNode = findNodeInNodes(currentNodes, instagramResolverAlwaysLabels, { exact: true, preferBottomRight: true });
  let onceNode = findNodeInNodes(currentNodes, instagramResolverOnceLabels, { exact: true, preferBottomRight: true });

  if ((!onceNode || onceNode.enabled === false) && (!alwaysNode || alwaysNode.enabled === false)) {
    const feedNode = findNodeInNodes(currentNodes, instagramResolverFeedLabels, { exact: true });
    if (feedNode) {
      const feedPoint = {
        x: Math.round((feedNode.left + feedNode.right) / 2),
        y: Math.round((feedNode.top + feedNode.bottom) / 2)
      };
      const feed = await tapAndLog(userId, account._id, target, 'instagram_post_choose_feed', feedPoint);
      steps.push(feed);
      await delay(postStepDelay());
      currentNodes = await dumpVisibleNodes(target);
      alwaysNode = findNodeInNodes(currentNodes, instagramResolverAlwaysLabels, { exact: true, preferBottomRight: true });
      onceNode = findNodeInNodes(currentNodes, instagramResolverOnceLabels, { exact: true, preferBottomRight: true });
    }
  }

  const confirmNode = alwaysNode?.enabled !== false ? alwaysNode : onceNode;
  if (!confirmNode || confirmNode.enabled === false) {
    await writeLog(userId, account._id, 'error', 'instagram_post_share_resolver_confirm_missing', 'Hộp chọn ứng dụng xuất hiện nhưng không tìm thấy nút JUST ONCE/ALWAYS khả dụng.', {
      labels: currentNodes.map((node) => node.text || node.desc).filter(Boolean)
    });
    return {
      ok: false,
      error: 'Không tìm thấy nút JUST ONCE/ALWAYS khả dụng trong hộp chọn Instagram.',
      steps
    };
  }

  const point = {
    x: Math.round((confirmNode.left + confirmNode.right) / 2),
    y: Math.round((confirmNode.top + confirmNode.bottom) / 2)
  };
  const confirm = await tapAndLog(userId, account._id, target, 'instagram_post_choose_feed_confirm', point);
  steps.push(confirm);
  await writeLog(userId, account._id, 'info', 'instagram_post_share_resolver_confirmed', `Đã chọn Instagram Feed và ${confirmNode.label}.`, {
    bounds: confirmNode,
    point,
    mode: confirmNode.label
  });
  return { ok: true, steps };
}

function detectInstagramState(nodes, text) {
  if (!nodes.length) return { name: 'unknown', reason: 'no_uiautomator_nodes', hasTargetText: false };
  const hasTargetText = verifyCompleteCaption(nodes, text).ok;
  if (hasVisibleProgressOnly(nodes)) return { name: 'loading', reason: 'progress_only', hasTargetText };
  if (findNodeInNodes(nodes, instagramBlockedLabels)) return { name: 'blocked', reason: 'login_or_checkpoint', hasTargetText };
  const hasResolverAction = findNodeInNodes(nodes, instagramResolverAlwaysLabels, { exact: true })
    || findNodeInNodes(nodes, instagramResolverOnceLabels, { exact: true });
  const hasResolverContext = findNodeInNodes(nodes, instagramResolverDialogLabels)
    || findNodeInNodes(nodes, instagramResolverFeedLabels, { exact: true });
  if (hasResolverAction && hasResolverContext) return { name: 'share_resolver', reason: 'android_share_target_resolver', hasTargetText };
  if (findNodeInNodes(nodes, instagramInfoDialogLabels)) return { name: 'info_dialog', reason: 'instagram_info_dialog', hasTargetText };
  if (findNodeInNodes(nodes, instagramPreviewLabels, { exact: true }) && !findInstagramShareButton(nodes)) return { name: 'preview', reason: 'preview_visible', hasTargetText };
  if (findNodeInNodes(nodes, instagramSharedConfirmationLabels)) return { name: 'submitted', reason: 'share_confirmation_visible', hasTargetText };
  if (findNodeInNodes(nodes, instagramSharingProgressLabels)) return { name: 'submitting', reason: 'sharing_progress_visible', hasTargetText };
  if (findInstagramShareButton(nodes)) return { name: 'caption', reason: 'share_button_visible', hasTargetText };
  if (findNodeInNodes(nodes, instagramShareLabels, { exact: true })) return { name: 'caption', reason: 'share_visible', hasTargetText };
  if (findNodeInNodes(nodes, instagramCaptionLabels)) return { name: 'caption', reason: 'caption_field_visible', hasTargetText };
  if (findNodeInNodes(nodes, instagramNextLabels, { exact: true })) return { name: 'next', reason: 'next_visible', hasTargetText };
  if (findNodeInNodes(nodes, instagramDoneLabels, { exact: true })) return { name: 'caption', reason: 'done_visible', hasTargetText };
  if (findNodeInNodes(nodes, instagramHomeLabels, { exact: true })) return { name: 'home', reason: 'instagram_home_visible', hasTargetText };
  return { name: 'unknown', reason: 'no_known_labels', hasTargetText };
}

async function waitForInstagramState(target, text, expectedStates, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(450);
    const nodes = await dumpVisibleNodes(target);
    const state = detectInstagramState(nodes, text);
    if (expectedStates.includes(state.name)) return { state, nodes };
  }
  return null;
}

function hasVisibleProgressOnly(nodes = []) {
  const actionableNodes = nodes.filter((node) => normalizeSearchText(`${node.text} ${node.desc}`));
  return nodes.some((node) => /ProgressBar/i.test(node.className || '')) && actionableNodes.length === 0;
}

async function grantInstagramRuntimePermissions(account, userId, target, packageName) {
  const cacheKey = `${target}:${packageName}`;
  const cachedAt = instagramPermissionCache.get(cacheKey) || 0;
  if (Date.now() - cachedAt < instagramPermissionCacheTtlMs) {
    await writeLog(userId, account._id, 'info', 'instagram_post_permissions_cached', 'Quyền Instagram đã được kiểm tra gần đây, bỏ qua bước cấp lại.', {
      target,
      packageName,
      cacheAgeMs: Date.now() - cachedAt
    });
    return [];
  }

  const permissions = [
    'android.permission.CAMERA',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE'
  ];
  const steps = await Promise.all(permissions.map(async (permission) => {
    const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'pm', 'grant', packageName, permission], { timeoutMs: 10_000 });
    await writeLog(userId, account._id, result.ok ? 'info' : 'warn', 'instagram_post_grant_permission', result.ok ? `Đã cấp quyền ${permission} cho Instagram.` : `Không cấp được quyền ${permission}.`, {
      permission,
      ...result
    });
    return result;
  }));
  instagramPermissionCache.set(cacheKey, Date.now());
  return steps;
}

async function verifyInstagramPostSubmit(account, userId, target, waitAfterSubmitMs = 0) {
  const startedAt = Date.now();
  const verificationWindowMs = Math.max(18_000, waitAfterSubmitMs || 0);
  const deadline = startedAt + verificationWindowMs;
  const packageName = account.metadata?.appPackage || defaultPackages.instagram;
  let lastLoggedState = '';
  let lastStateLoggedAt = 0;
  let consecutiveCaptionStates = 0;
  let sawSubmitting = false;
  let submittingSince = 0;
  while (Date.now() < deadline) {
    await delay(650);
    const [foreground, nodes] = await Promise.all([
      getForegroundAndroidPackage(target),
      dumpVisibleNodes(target)
    ]);
    if (foreground.packageName && foreground.packageName !== packageName) {
      const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
      await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram đã rời foreground sau khi bấm Share.', {
        elapsedMs: Date.now() - startedAt,
        foreground
      });
      return { ok: true, reason: 'instagram_left_foreground_after_share', screenshot, composerPending: false, finalState: 'submitted' };
    }

    const state = detectInstagramState(nodes, '');
    if (sawSubmitting && state.name === 'unknown' && isInstagramPostSubmitClosedActivity(foreground.activityName)) {
      const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
      await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram đã xử lý Share và quay về màn chính sau khi gửi.', {
        elapsedMs: Date.now() - startedAt,
        foreground,
        state
      });
      return { ok: true, reason: 'main_activity_after_share_progress', screenshot, composerPending: false, finalState: 'submitted' };
    }
    if (state.name === 'caption') {
      consecutiveCaptionStates += 1;
      const elapsedMs = Date.now() - startedAt;
      if (lastLoggedState !== state.name || elapsedMs - lastStateLoggedAt >= 5_000) {
        await writeLog(userId, account._id, 'info', 'instagram_post_submit_still_on_share_screen', 'Instagram vẫn còn ở màn Share sau khi bấm.', {
          elapsedMs,
          state
        });
        lastLoggedState = state.name;
        lastStateLoggedAt = elapsedMs;
      }
      if (consecutiveCaptionStates >= 8 && elapsedMs >= 10_000) {
        return { ok: false, reason: 'still_on_share_screen', screenshot: null, composerPending: true, finalState: 'caption' };
      }
      continue;
    }
    consecutiveCaptionStates = 0;
    if (state.name === 'submitted') {
      const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
      await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram hiển thị tín hiệu đã chia sẻ bài.', {
        elapsedMs: Date.now() - startedAt,
        state
      });
      return { ok: true, reason: 'share_confirmation_visible', screenshot, composerPending: false, finalState: 'submitted' };
    }
    if (state.name === 'submitting') {
      sawSubmitting = true;
      if (!submittingSince) submittingSince = Date.now();
      const elapsedMs = Date.now() - startedAt;
      if (lastLoggedState !== state.name || elapsedMs - lastStateLoggedAt >= 5_000) {
        await writeLog(userId, account._id, 'info', 'instagram_post_submit_waiting', 'Instagram đang xử lý sau khi bấm Share.', {
          elapsedMs,
          state
        });
        lastLoggedState = state.name;
        lastStateLoggedAt = elapsedMs;
      }
      if (Date.now() - submittingSince >= instagramFastSubmitProgressMs) {
        const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_progress_verified');
        await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram đã nhận bài và đang upload; trả kết quả sớm để không chờ processing nền.', {
          elapsedMs,
          state,
          fastSubmitProgressMs: instagramFastSubmitProgressMs
        });
        return { ok: true, reason: 'share_progress_visible_fast_path', screenshot, composerPending: false, finalState: 'submitted' };
      }
      continue;
    }
    if (state.name === 'home') {
      const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
      await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram đã rời màn share sau khi bấm Share.', {
        elapsedMs: Date.now() - startedAt,
        state
      });
      return { ok: true, reason: 'composer_closed_after_share', screenshot, composerPending: false, finalState: 'submitted' };
    }
  }

  await delay(700);
  const [finalForeground, finalNodes] = await Promise.all([
    getForegroundAndroidPackage(target),
    dumpVisibleNodes(target)
  ]);
  const finalState = detectInstagramState(finalNodes, '');
  if (sawSubmitting && finalState.name === 'unknown' && isInstagramPostSubmitClosedActivity(finalForeground.activityName)) {
    const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
    await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram đã xử lý Share và quay về màn chính ở bước kiểm tra cuối.', {
      elapsedMs: Date.now() - startedAt,
      foreground: finalForeground,
      state: finalState
    });
    return { ok: true, reason: 'main_activity_after_share_progress_final_check', screenshot, composerPending: false, finalState: 'submitted' };
  }
  if (finalState.name === 'caption') {
    const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_unverified');
    await writeLog(userId, account._id, 'warn', 'instagram_post_submit_unverified', 'Đã bấm Share nhưng Instagram vẫn còn ở màn Share.', {
      elapsedMs: Date.now() - startedAt,
      foreground: finalForeground,
      state: finalState
    });
    return { ok: false, reason: 'still_on_share_screen', screenshot, composerPending: true, finalState: 'caption' };
  }
  if (finalState.name === 'submitted') {
    const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
    await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram hiển thị tín hiệu đã chia sẻ ở bước kiểm tra cuối.', {
      elapsedMs: Date.now() - startedAt,
      foreground: finalForeground,
      state: finalState
    });
    return { ok: true, reason: 'share_confirmation_visible_final_check', screenshot, composerPending: false, finalState: 'submitted' };
  }
  if ((finalForeground.packageName && finalForeground.packageName !== packageName) || finalState.name === 'home') {
    const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_verified');
    await writeLog(userId, account._id, 'info', 'instagram_post_submit_verified', 'Instagram đã rời màn share ở bước kiểm tra cuối.', {
      elapsedMs: Date.now() - startedAt,
      foreground: finalForeground,
      state: finalState
    });
    return { ok: true, reason: 'composer_closed_on_final_check', screenshot, composerPending: false, finalState: 'submitted' };
  }

  const screenshot = await captureScreenshot(account, userId, 'instagram_post_submit_unverified');
  const stillOnShareScreen = finalState.name === 'caption';
  await writeLog(userId, account._id, 'warn', 'instagram_post_submit_unverified', 'Đã bấm Share nhưng chưa thấy tín hiệu xác nhận Instagram nhận bài.', {
    elapsedMs: Date.now() - startedAt,
    foreground: finalForeground,
    state: finalState
  });
  return {
    ok: false,
    reason: stillOnShareScreen ? 'still_on_share_screen' : 'no_confirmation_after_share',
    screenshot,
    composerPending: true,
    finalState: stillOnShareScreen ? 'caption' : 'submit_unverified'
  };
}

async function resolveStableDeviceTarget(target) {
  if (!target?.includes(':')) return target;

  const devices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 10_000 });
  const emulatorTargets = devices.ok
    ? devices.stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter(([serial, state]) => /^emulator-\d+$/.test(serial) && state === 'device')
      .map(([serial]) => serial)
    : [];
  if (!emulatorTargets.length) return target;

  const tcpSerial = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'getprop', 'ro.serialno'], { timeoutMs: 10_000 });
  if (!tcpSerial.ok || !tcpSerial.stdout) return target;

  for (const emulatorTarget of emulatorTargets) {
    const emulatorSerial = await runCommand(env.mobileAutomation.adbPath, ['-s', emulatorTarget, 'shell', 'getprop', 'ro.serialno'], { timeoutMs: 10_000 });
    if (emulatorSerial.ok && emulatorSerial.stdout === tcpSerial.stdout) return emulatorTarget;
  }

  return target;
}

async function assertDeviceConnected(target, stage = '') {
  let state = await runCommand(
    env.mobileAutomation.adbPath,
    ['-s', target, 'get-state'],
    { timeoutMs: 4_000 }
  );
  if (state.ok && String(state.stdout || '').trim() === 'device') return state;

  await runCommand(env.mobileAutomation.adbPath, ['start-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await delay(attempt < 3 ? 500 : 800);
    state = await runCommand(
      env.mobileAutomation.adbPath,
      ['-s', target, 'get-state'],
      { timeoutMs: 4_000, retryTransient: false }
    );
    if (!state.ok || String(state.stdout || '').trim() !== 'device') continue;

    const shell = await runCommand(
      env.mobileAutomation.adbPath,
      ['-s', target, 'shell', 'echo', 'socialpilot-ready'],
      { timeoutMs: 4_000, retryTransient: false }
    );
    if (shell.ok && String(shell.stdout || '').trim() === 'socialpilot-ready') {
      return {
        ...state,
        recovered: true,
        recoveryAttempt: attempt,
        shell
      };
    }
  }

  const detail = stage ? ` ${stage}` : '';
  throw new Error(`ADB ${target} đã mất kết nối${detail}. Hãy chờ LDPlayer ổn định rồi thử lại.`);
}

async function openFacebookComposer(account, userId, target, config, text, media = [], mediaKind = 'image') {
  await dismissStaleFacebookComposer(account, userId, target, text);

  // Prefer share intents so Facebook receives caption and media together.
  // The multi-image caller intentionally fails instead of falling back to
  // gallery selection when SEND_MULTIPLE is not accepted.
  const shareMedia = media.length > 1 ? media : (media.length === 1 ? media[0] : null);
  if (!shareMedia && cleanClipboardText(text).trim()) {
    const textIntentArgs = buildFacebookShareIntentArgs(target, config, text, null);
    const textShareIntent = await runCommand(env.mobileAutomation.adbPath, textIntentArgs, { timeoutMs: 15_000 });
    if (isSuccessfulFacebookShareIntent(textShareIntent)) {
      await writeLog(userId, account._id, 'info', config.autoSubmit ? 'facebook_post_open_text_share_composer' : 'facebook_post_open_text_share_composer_review', config.autoSubmit ? 'Đã mở composer text-only bằng share intent trước khi tự đăng.' : 'Đã mở composer text-only bằng share intent ở chế độ kiểm tra.', {
        ...textShareIntent,
        args: maskShareIntentArgs(textIntentArgs)
      });
      return { ...textShareIntent, method: config.autoSubmit ? 'text_share_intent' : 'text_share_intent_review' };
    }

    const genericShare = await openFacebookGenericShareComposer(account, userId, target, config, textIntentArgs, 'text');
    if (genericShare.ok) return genericShare;

    await writeLog(userId, account._id, 'warn', config.autoSubmit ? 'facebook_post_open_text_share_composer_failed' : 'facebook_post_open_text_share_composer_review_failed', 'Không mở được composer text-only bằng share intent; fallback về Home.', {
      explicit: {
        ...textShareIntent,
        args: maskShareIntentArgs(textIntentArgs)
      },
      generic: {
        ...genericShare,
        args: maskShareIntentArgs(genericShare.args || [])
      },
      autoSubmit: config.autoSubmit
    });
    return openFacebookHomeForManualText(account, userId, target, config);
  }

  const intentArgs = buildFacebookShareIntentArgs(target, config, text, shareMedia);

  const isMultiMediaShare = Array.isArray(shareMedia) && shareMedia.length > 1;
  const isCollageShare = !Array.isArray(shareMedia) && isFacebookCollageImage(shareMedia);
  const preferGenericCollageShare = isCollageShare && !/LDPlayer-2/i.test(String(account?.instanceName || ''));
  let shareIntent = isMultiMediaShare
    ? await openFacebookGenericShareComposer(account, userId, target, config, intentArgs, mediaKind)
    : preferGenericCollageShare
      ? await openFacebookGenericShareComposer(account, userId, target, config, intentArgs, mediaKind)
      : await runCommand(env.mobileAutomation.adbPath, intentArgs, { timeoutMs: 12_000 });
  let coldRetry = null;
  if (!isMultiMediaShare && !isSuccessfulFacebookShareIntent(shareIntent)) {
    coldRetry = await resetFacebookTaskForComposer(account, userId, target, config.appPackage, shareIntent);
    shareIntent = preferGenericCollageShare
      ? await openFacebookGenericShareComposer(account, userId, target, config, intentArgs, mediaKind)
      : await runCommand(env.mobileAutomation.adbPath, intentArgs, { timeoutMs: 15_000 });
  }

  if (isSuccessfulFacebookShareIntent(shareIntent)) {
    await writeLog(userId, account._id, 'info', 'facebook_post_open_share_composer', 'Đã mở Facebook composer bằng Android share intent để giữ Unicode.', {
      ...shareIntent,
      args: maskShareIntentArgs(intentArgs),
      launchMode: coldRetry ? 'cold_retry' : 'warm',
      coldRetry
    });
    return { ...shareIntent, method: shareMedia ? `${mediaKind}_share_intent` : 'text_share_intent' };
  }

  if (!isMultiMediaShare && (shareMedia?.remotePath || !shareMedia)) {
    const genericShare = await openFacebookGenericShareComposer(account, userId, target, config, intentArgs, mediaKind);
    if (genericShare.ok) return genericShare;
  }

  return openFacebookHome(account, userId, target, config, shareIntent);
}

async function dismissStaleFacebookComposer(account, userId, target, nextText) {
  const state = await detectFacebookState(target, nextText);
  if (!['composer', 'ready_to_post', 'text_editor', 'stale_composer', 'share_chooser'].includes(state.name)) {
    return { ok: true, dismissed: false, state: state.name };
  }

  const back = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'input',
    'keyevent',
    '4'
  ], { timeoutMs: 5_000 });
  await delay(450);
  const afterBack = await detectFacebookState(target, nextText);
  let discard = null;
  if (afterBack.name === 'discard_dialog') {
    discard = await tapTextOrPoint(
      account,
      userId,
      target,
      discardPostLabels,
      { x: 450, y: 1460 },
      'facebook_post_discard_stale_before_share',
      { exact: true }
    );
    await delay(650);
  }

  await writeLog(
    userId,
    account._id,
    back.ok ? 'info' : 'warn',
    'facebook_post_stale_composer_cleared',
    back.ok
      ? 'Đã đóng composer còn sót từ phiên trước trước khi mở bài mới.'
      : 'Không đóng được composer còn sót từ phiên trước.',
    {
      previousState: state.name,
      afterBackState: afterBack.name,
      discarded: Boolean(discard?.ok)
    }
  );
  return { ok: back.ok, dismissed: true, state: afterBack.name };
}

function buildFacebookShareIntentArgs(target, config, text, primaryMedia = null) {
  const mediaItems = Array.isArray(primaryMedia)
    ? primaryMedia.filter((item) => item?.remotePath || item?.contentUri)
    : (primaryMedia ? [primaryMedia] : []);
  const multiMedia = mediaItems.length > 1;
  const intentType = multiMedia ? 'image/*' : (mediaItems[0]?.mimeType || 'text/plain');
  const intentArgs = [
    '-s',
    target,
    'shell',
    'am',
    'start',
    '-a',
    multiMedia ? 'android.intent.action.SEND_MULTIPLE' : 'android.intent.action.SEND',
    '-t',
    intentType,
    '--es',
    'android.intent.extra.TEXT',
    quoteAdbShellArg(text)
  ];
  if (multiMedia) {
    intentArgs.push(
      '--grant-read-uri-permission',
      '--eul',
      'android.intent.extra.STREAM',
      mediaItems.map((item) => item.contentUri || `file://${item.remotePath}`).join(',')
    );
  } else if (mediaItems[0]?.remotePath || mediaItems[0]?.contentUri) {
    intentArgs.push(
      '--grant-read-uri-permission',
      '--eu',
      'android.intent.extra.STREAM',
      mediaItems[0].contentUri || `file://${mediaItems[0].remotePath}`
    );
  }
  intentArgs.push(
    '-n',
    `${config.appPackage}/com.facebook.composer.shareintent.ImplicitShareIntentHandlerDefaultAlias`
  );
  return intentArgs;
}

function isSuccessfulFacebookShareIntent(result) {
  if (!result?.ok) return false;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return !/error:|unable to resolve|activity not started|exception/i.test(output);
}

async function resetFacebookTaskForComposer(account, userId, target, packageName, firstAttempt) {
  const stop = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'am',
    'force-stop',
    packageName
  ], { timeoutMs: 8_000 });
  await writeLog(
    userId,
    account._id,
    stop.ok ? 'warn' : 'error',
    'facebook_post_reset_app_task_retry',
    stop.ok
      ? 'Warm start composer thất bại; đã đóng Facebook để thử lại một lần.'
      : 'Warm start composer thất bại và không đóng được Facebook để retry.',
    {
      stop,
      firstAttempt: {
        ...firstAttempt,
        args: maskShareIntentArgs(firstAttempt?.args || [])
      }
    }
  );
  if (stop.ok) await delay(800);
  return stop;
}

async function openFacebookGenericShareComposer(account, userId, target, config, baseIntentArgs, mediaKind) {
  const genericArgs = baseIntentArgs
    .slice(0, -2)
    .concat(['-p', config.appPackage]);
  const genericShare = await runCommand(env.mobileAutomation.adbPath, genericArgs);
  await writeLog(
    userId,
    account._id,
    genericShare.ok ? 'info' : 'warn',
    'facebook_post_open_generic_share_composer',
    genericShare.ok
      ? 'Đã mở Facebook composer bằng Android share intent tổng quát.'
      : 'Không mở được Facebook composer bằng share intent tổng quát.',
    {
      ...genericShare,
      args: maskShareIntentArgs(genericArgs),
      mediaKind
    }
  );
  const hasMediaStream = genericArgs.includes('android.intent.extra.STREAM');
  return genericShare.ok
    ? { ...genericShare, method: hasMediaStream ? `${mediaKind}_share_intent` : 'text_share_intent', generic: true }
    : genericShare;
}

async function cleanupFacebookMediaLibrary(account, userId, target, reason) {
  const steps = [];
  const mediaUris = ['content://media/external/images/media', 'content://media/external/video/media'];
  let deletedMediaRows = 0;
  const mediaDeletes = [];

  for (const mediaUri of mediaUris) {
    const query = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'content',
      'query',
      '--uri',
      mediaUri,
      '--projection',
      '_id:_data'
    ], { timeoutMs: 20_000 });
    steps.push(query);

    const mediaIds = query.ok
      ? String(query.stdout || '')
        .split(/\r?\n/)
        .filter((row) => row.includes(`${facebookMediaRoot}/`) || row.includes(`${facebookMediaCacheRoot}/`))
        .map((row) => row.match(/_id=(\d+)/)?.[1])
        .filter(Boolean)
      : [];
    deletedMediaRows += mediaIds.length;

    const deletes = await Promise.all(mediaIds.map((mediaId) => runCommand(
      env.mobileAutomation.adbPath,
      [
        '-s',
        target,
        'shell',
        'content',
        'delete',
        '--uri',
        mediaUri,
        '--where',
        `_id=${mediaId}`
      ],
      { timeoutMs: 10_000 }
    )));
    mediaDeletes.push(...deletes);
  }
  steps.push(...mediaDeletes);

  const removeFiles = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'rm',
    '-rf',
    facebookMediaRoot,
    facebookMediaCacheRoot
  ], { timeoutMs: 20_000 });
  steps.push(removeFiles);

  const mediaStoreOk = mediaDeletes.every((result) => result.ok);
  const ok = removeFiles.ok;
  await writeLog(
    userId,
    account._id,
    'info',
    'facebook_post_media_cleanup',
    ok
      ? 'Đã dọn ảnh tạm của phiên đăng khỏi LDPlayer.'
      : 'Không xóa được thư mục media tạm; tool sẽ thử lại trước phiên đăng tiếp theo.',
    {
      reason,
      deletedMediaRows,
      mediaStoreOk,
      removeFiles: {
        ok: removeFiles.ok,
        stderr: removeFiles.stderr,
        error: removeFiles.error
      }
    }
  );

  return { ok, steps, deletedMediaRows };
}

async function prepareFacebookMediaSession(account, userId, target, options = {}) {
  const cleanupBeforePublish = options.cleanup !== false;
  const steps = [];
  const storageReady = await ensureAndroidStorageReady(account, userId, target, options.storageAttempts || 45);
  steps.push(storageReady);
  if (!storageReady.ok) throw new Error(storageReady.error);

  if (cleanupBeforePublish) {
    const cleanup = await cleanupFacebookMediaLibrary(account, userId, target, 'before_publish');
    steps.push(...cleanup.steps);
  }
  const sessionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const remoteDir = options.persistentCacheDir ? facebookMediaCacheRoot : `${facebookMediaRoot}/${sessionId}`;

  let mkdir = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    mkdir = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'mkdir', '-p', remoteDir]);
    if (mkdir.ok) break;
    await delay(1200);
  }
  steps.push(mkdir);
  if (!mkdir?.ok) throw new Error(mkdir?.error || mkdir?.stderr || 'Không tạo được thư mục ảnh trong LDPlayer.');

  if (!options.skipPermissionGrant) {
    const grantPackage = options.appPackage || 'com.facebook.katana';
    const grantRead = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'pm',
      'grant',
      grantPackage,
      'android.permission.READ_EXTERNAL_STORAGE'
    ]);
    const grantWrite = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'pm',
      'grant',
      grantPackage,
      'android.permission.WRITE_EXTERNAL_STORAGE'
    ]);
    steps.push(grantRead, grantWrite);
  }

  return { remoteDir, steps };
}

async function prepareFacebookImages(account, userId, target, images, options = {}) {
  const mediaSession = await prepareFacebookMediaSession(account, userId, target, {
    persistentCacheDir: Boolean(options.persistentCacheDir),
    ...options
  });
  const baseTimestamp = Date.now() - images.length * 2000;
  const descriptors = images.map((image, index) => createFacebookImageDescriptor(
    image,
    mediaSession,
    index + 1,
    baseTimestamp + ((images.length - index - 1) * 2000)
  ));
  const pushedImages = await Promise.all(descriptors.map((descriptor) => pushFacebookImageFile(
    account,
    userId,
    target,
    descriptor
  )));

  // Chép file chạy song song. Đăng ký MediaStore theo batch nhỏ để giữ tốc độ
  // nhưng không làm ADB/System UI quá tải trên LDPlayer.
  const preparedImages = [];
  for (let index = 0; index < pushedImages.length; index += 2) {
    const batch = pushedImages.slice(index, index + 2);
    preparedImages.push(...await Promise.all(batch.map((pushedImage) => registerFacebookImageMedia(
      account,
      userId,
      target,
      pushedImage
    ))));
  }
  if (preparedImages[0]) {
    preparedImages[0].steps = [...mediaSession.steps, ...preparedImages[0].steps];
  }
  return preparedImages;
}

async function prepareFacebookVideos(account, userId, target, videos, options = {}) {
  const mediaSession = await prepareFacebookMediaSession(account, userId, target, { cleanup: false, ...options });
  const mediaTimestamp = Date.now();
  const descriptors = videos.map((video, index) => createFacebookVideoDescriptor(
    video,
    mediaSession,
    index + 1,
    mediaTimestamp
  ));
  const preparedVideos = [];
  for (const descriptor of descriptors) {
    const pushedVideo = await pushFacebookVideoFile(account, userId, target, descriptor);
    preparedVideos.push(await registerFacebookVideoMedia(account, userId, target, pushedVideo));
  }
  if (preparedVideos[0]) {
    preparedVideos[0].steps = [...mediaSession.steps, ...preparedVideos[0].steps];
  }
  return preparedVideos;
}

function createFacebookImageDescriptor(image, mediaSession, displayOrder, mediaTimestamp) {
  const localPath = getLocalUploadPath(image.url);
  if (!localPath || !existsSync(localPath)) {
    throw new Error('Ảnh chưa được upload vào server hoặc không còn tồn tại.');
  }

  const extension = path.extname(localPath).toLowerCase() || '.jpg';
  const imageHash = getLocalImageHash(localPath);
  const filename = `socialpilot-${String(displayOrder).padStart(2, '0')}-${imageHash.slice(0, 20)}${extension}`;
  const remoteDir = mediaSession.remoteDir;
  const remotePath = `${remoteDir}/${filename}`;

  return {
    localPath,
    imageHash,
    filename,
    sourceName: image.name || path.basename(localPath),
    isCollage: isFacebookCollageImage(image),
    remotePath,
    mediaTimestamp,
    mimeType: image.mimeType || mimeTypeFromExtension(extension)
  };
}

function createFacebookVideoDescriptor(video, mediaSession, displayOrder, mediaTimestamp) {
  const localPath = getLocalUploadPath(video.url);
  if (!localPath || !existsSync(localPath)) {
    throw new Error('Video chưa được upload vào server hoặc không còn tồn tại.');
  }

  const extension = path.extname(localPath).toLowerCase() || '.mp4';
  const videoHash = getLocalImageHash(localPath);
  const filename = `socialpilot-video-${String(displayOrder).padStart(2, '0')}-${videoHash.slice(0, 20)}${extension}`;
  const remoteDir = mediaSession.remoteDir;
  const remotePath = `${remoteDir}/${filename}`;

  return {
    localPath,
    videoHash,
    filename,
    remotePath,
    mediaTimestamp,
    mimeType: video.mimeType || videoMimeTypeFromExtension(extension)
  };
}

async function pushFacebookImageFile(account, userId, target, descriptor) {
  const {
    localPath,
    filename,
    remotePath,
    imageHash
  } = descriptor;
  const steps = [];

  const remoteExists = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'test', '-f', remotePath], { timeoutMs: 10_000 });
  steps.push(remoteExists);
  const cacheHit = remoteExists.ok;
  if (!cacheHit) {
    const push = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'push', localPath, remotePath], { timeoutMs: 120_000 });
    steps.push(push);
    await writeLog(userId, account._id, push.ok ? 'info' : 'error', 'facebook_post_push_image', push.ok ? `Đã chép ảnh ${filename} vào LDPlayer.` : 'Không chép được ảnh vào LDPlayer.', {
      ...push,
      args: ['-s', target, 'push', path.basename(localPath), remotePath]
    });
    if (!push.ok) throw new Error(push.error || push.stderr || 'ADB push ảnh thất bại.');
  } else {
    await writeLog(userId, account._id, 'info', 'facebook_post_image_cache_hit', 'Ảnh đã có trong LDPlayer, bỏ qua bước sao chép.', {
      filename,
      remotePath,
      imageHash
    });
  }

  return { ...descriptor, steps, cacheHit };
}

async function pushFacebookVideoFile(account, userId, target, descriptor) {
  const {
    localPath,
    filename,
    remotePath,
    videoHash
  } = descriptor;
  const steps = [];

  const remoteExists = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'test', '-f', remotePath], { timeoutMs: 10_000 });
  steps.push(remoteExists);
  const cacheHit = remoteExists.ok;
  if (!cacheHit) {
    const push = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'push', localPath, remotePath], { timeoutMs: 240_000 });
    steps.push(push);
    await writeLog(userId, account._id, push.ok ? 'info' : 'error', 'facebook_post_push_video', push.ok ? `Đã chép video ${filename} vào LDPlayer.` : 'Không chép được video vào LDPlayer.', {
      ...push,
      args: ['-s', target, 'push', path.basename(localPath), remotePath]
    });
    if (!push.ok) throw new Error(push.error || push.stderr || 'ADB push video thất bại.');
  } else {
    await writeLog(userId, account._id, 'info', 'facebook_post_video_cache_hit', 'Video đã có trong LDPlayer, bỏ qua bước sao chép.', {
      filename,
      remotePath,
      videoHash
    });
  }

  return { ...descriptor, steps, cacheHit };
}

async function registerFacebookImageMedia(account, userId, target, preparedImage) {
  const {
    filename,
    remotePath,
    mediaTimestamp,
    mimeType,
    cacheHit
  } = preparedImage;
  const steps = [...preparedImage.steps];
  const existingMedia = await findAndroidMediaByPath(target, remotePath);
  steps.push(existingMedia.query);
  let contentUri = existingMedia.contentUri;
  let mediaInsert = null;
  if (contentUri) {
    const mediaUpdate = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'content',
      'update',
      '--uri',
      contentUri,
      '--bind',
      `date_added:l:${Math.floor(mediaTimestamp / 1000)}`,
      '--bind',
      `date_modified:l:${Math.floor(mediaTimestamp / 1000)}`,
      '--bind',
      `datetaken:l:${mediaTimestamp}`
    ]);
    steps.push(mediaUpdate);
  } else {
    mediaInsert = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'content',
      'insert',
      '--uri',
      'content://media/external/images/media',
      '--bind',
      `_data:s:${remotePath}`,
      '--bind',
      `mime_type:s:${mimeType}`,
      '--bind',
      `_display_name:s:${filename}`,
      '--bind',
      `title:s:${path.parse(filename).name}`,
      '--bind',
      `date_added:l:${Math.floor(mediaTimestamp / 1000)}`,
      '--bind',
      `date_modified:l:${Math.floor(mediaTimestamp / 1000)}`,
      '--bind',
      `datetaken:l:${mediaTimestamp}`
    ]);
    steps.push(mediaInsert);
    contentUri = String(mediaInsert.stdout || '').match(/content:\/\/media\/external\/images\/media\/\d+/)?.[0] || '';
  }
  let mediaQuery = null;
  if (!contentUri) {
    const scan = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'am',
      'broadcast',
      '-a',
      'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
      '-d',
      `file://${remotePath}`
    ]);
    steps.push(scan);
    await delay(postStepDelay());
    const scannedMedia = await findAndroidMediaByPath(target, remotePath);
    mediaQuery = scannedMedia.query;
    steps.push(mediaQuery);
    contentUri = scannedMedia.contentUri;
  }
  await writeLog(
    userId,
    account._id,
    contentUri ? 'info' : 'warn',
    'facebook_post_media_ready',
    contentUri ? 'Ảnh đã sẵn sàng trong thư viện Android.' : 'Chưa lấy được media URI, sẽ dùng đường dẫn ảnh dự phòng.',
    {
      remotePath,
      contentUri,
      mediaQuery: {
        ok: mediaQuery?.ok ?? true,
        stdout: mediaQuery?.stdout || mediaInsert?.stdout || existingMedia.query.stdout,
        stderr: mediaQuery?.stderr || mediaInsert?.stderr || existingMedia.query.stderr,
        error: mediaQuery?.error || mediaInsert?.error || existingMedia.query.error
      },
      cacheHit
    }
  );

  return {
    mimeType,
    remotePath,
    contentUri,
    sourceName: preparedImage.sourceName || '',
    isCollage: Boolean(preparedImage.isCollage),
    steps
  };
}

async function registerFacebookVideoMedia(account, userId, target, preparedVideo) {
  const {
    filename,
    remotePath,
    mediaTimestamp,
    mimeType,
    cacheHit
  } = preparedVideo;
  const steps = [...preparedVideo.steps];
  const mediaInsert = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'content',
    'insert',
    '--uri',
    'content://media/external/video/media',
    '--bind',
    `_data:s:${remotePath}`,
    '--bind',
    `mime_type:s:${mimeType}`,
    '--bind',
    `_display_name:s:${filename}`,
    '--bind',
    `title:s:${path.parse(filename).name}`,
    '--bind',
    `date_added:l:${Math.floor(mediaTimestamp / 1000)}`,
    '--bind',
    `date_modified:l:${Math.floor(mediaTimestamp / 1000)}`
  ], { timeoutMs: 10_000 });
  steps.push(mediaInsert);
  let contentUri = String(mediaInsert.stdout || '').match(/content:\/\/media\/external\/video\/media\/\d+/)?.[0] || '';

  if (!contentUri) {
    const existingMedia = await findAndroidMediaByPath(target, remotePath, 'video');
    steps.push(existingMedia.query);
    contentUri = existingMedia.contentUri;
  }

  // Start metadata extraction asynchronously. Some LDPlayer builds keep this
  // broadcast open for tens of seconds, while Facebook can already consume the
  // stable content URI created above.
  const scan = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'am',
    'broadcast',
    '-a',
    'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d',
    `file://${remotePath}`
  ], { timeoutMs: 2_500 });
  steps.push(scan);
  await writeLog(
    userId,
    account._id,
    contentUri ? 'info' : 'warn',
    'facebook_post_video_ready',
    contentUri ? 'Video đã sẵn sàng trong thư viện Android.' : 'Chưa lấy được video URI, sẽ dùng đường dẫn video dự phòng.',
    {
      remotePath,
      contentUri,
      cacheHit,
      scanDurationMs: scan.durationMs || 0,
      scanStarted: scan.ok || /timed out/i.test(scan.error || '')
    }
  );

  if (!contentUri) {
    throw new Error('Android chưa đăng ký được video vào thư viện. Không thể mở Facebook composer an toàn.');
  }

  return {
    mimeType,
    remotePath,
    contentUri,
    steps
  };
}

function getLocalImageHash(localPath) {
  const stats = statSync(localPath);
  const cacheKey = `${localPath}:${stats.size}:${stats.mtimeMs}`;
  const cached = localImageHashCache.get(cacheKey);
  if (cached) return cached;

  const hash = createHash('sha256').update(readFileSync(localPath)).digest('hex');
  localImageHashCache.set(cacheKey, hash);
  if (localImageHashCache.size > 200) {
    localImageHashCache.delete(localImageHashCache.keys().next().value);
  }
  return hash;
}

async function findAndroidMediaByPath(target, remotePath, mediaKind = 'image') {
  const mediaUri = mediaKind === 'video'
    ? 'content://media/external/video/media'
    : 'content://media/external/images/media';
  const query = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'content',
    'query',
    '--uri',
    mediaUri,
    '--projection',
    '_id:_data',
    '--where',
    `_data=\\'${remotePath.replace(/'/g, "''")}\\'`
  ], { timeoutMs: 8_000, maxBuffer: 256 * 1024 });
  const mediaRow = query.ok
    ? String(query.stdout || '').split(/\r?\n/).find((row) => row.includes(remotePath))
    : '';
  const mediaId = mediaRow?.match(/_id=(\d+)/)?.[1] || null;
  return {
    query,
    contentUri: mediaId ? `${mediaUri}/${mediaId}` : ''
  };
}

function maskShareIntentArgs(args = []) {
  return args.map((value, index) => {
    const previous = args[index - 1];
    if (previous === 'android.intent.extra.TEXT') return '***';
    if (previous === 'android.intent.extra.STREAM') return 'file://***';
    return value;
  });
}

function mimeTypeFromExtension(extension) {
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff'
  };
  return types[extension] || 'image/jpeg';
}

function videoMimeTypeFromExtension(extension) {
  const types = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.3gp': 'video/3gpp',
    '.3gpp': 'video/3gpp'
  };
  return types[extension] || 'video/mp4';
}

async function openFacebookHome(account, userId, target, config, shareIntent) {
  await writeLog(userId, account._id, 'warn', 'facebook_post_open_share_composer_failed', 'Không mở được share intent, chuyển sang mở Facebook Home.', {
    ...shareIntent,
    args: ['-s', target, 'shell', 'am', 'start', '-a', 'android.intent.action.SEND', '-t', 'text/plain', '--es', 'android.intent.extra.TEXT', '***', '-p', config.appPackage]
  });

  const launcher = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', config.appPackage, '-c', 'android.intent.category.LAUNCHER', '1']);
  await writeLog(userId, account._id, launcher.ok ? 'info' : 'warn', 'facebook_post_open_home', launcher.ok ? 'Đã gọi mở Facebook.' : 'Không gọi được Facebook launcher, tiếp tục tap trên màn hiện tại.', launcher);
  return { ...launcher, method: 'launcher' };
}

async function openFacebookHomeForManualText(account, userId, target, config) {
  let launcher = await launchFacebookWarm(target, config.appPackage);
  let readiness = await waitForAppForegroundReady(account, userId, target, config.appPackage, 18_000, {
    stableChecks: 1,
    requireVisibleUi: true
  });
  let home = readiness.ok
    ? await ensureFacebookHomeOnOpen(account, userId, target, config.appPackage, {
      fast: false,
      recentlyBooted: false
    })
    : null;

  if (!readiness.ok || !home?.verified) {
    const fresh = await launchFacebookFresh(target, config.appPackage);
    await delay(1_800);
    invalidateUiDump(target);
    const retryReadiness = await waitForAppForegroundReady(account, userId, target, config.appPackage, 24_000, {
      stableChecks: 1,
      requireVisibleUi: true
    });
    const retryHome = retryReadiness.ok
      ? await ensureFacebookHomeOnOpen(account, userId, target, config.appPackage, {
        fast: false,
        recentlyBooted: true
      })
      : null;
    launcher = {
      ...fresh,
      launchMethod: 'manual_text_fresh_retry',
      previousLaunch: launcher,
      previousReadiness: readiness,
      previousHome: home
    };
    readiness = retryReadiness;
    home = retryHome;
  }

  await writeLog(
    userId,
    account._id,
    launcher.ok && readiness.ok ? 'info' : 'warn',
    'facebook_post_open_home_for_manual_text',
    launcher.ok && readiness.ok
      ? 'Bài text-only: mở Facebook Home trước, sau đó tap composer và nhập nội dung để thao tác tự nhiên hơn.'
      : 'Bài text-only: không gọi được Facebook launcher, tiếp tục xử lý trên màn hiện tại.',
    {
      launcher,
      readiness,
      home
    }
  );
  return {
    ...launcher,
    ok: Boolean(launcher.ok && readiness.ok),
    method: home?.verified ? 'manual_text_home_verified' : 'manual_text_home_unverified',
    readiness,
    home
  };
}

async function runFacebookPostStateMachine(account, userId, target, config, text, images = [], options = {}) {
  const steps = [];
  const mediaKind = options.mediaKind === 'video' ? 'video' : 'image';
  let emptyUiRecoveryCount = 0;
  let unknownStateStreak = 0;
  let textEntered = false;
  let composerNextTaps = 0;
  let composerTextOpenAttempts = 0;
  let placeholderComposerWaits = 0;
  let attachedImageCount = options.imageSharedByIntent && images.length
    ? Math.max(1, Math.min(Number(options.imageSharedByIntentCount) || 1, images.length))
    : 0;
  const imageCount = images.length;
  let screenshot = null;
  let finalState = 'unknown';

  if (attachedImageCount) {
    await writeLog(
      userId,
      account._id,
      'info',
      'facebook_post_image_attached',
      `${mediaKind === 'video' ? 'Video' : 'Ảnh'} đã được chuyển trực tiếp vào Facebook composer.`,
      {
        requestedCount: imageCount,
        method: 'android_share_intent',
        contentUri: images[0]?.contentUri || ''
      }
    );
  }

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const state = await resolveFacebookOpenState(target, await detectFacebookState(target, text));
    if (state.hasTargetText) textEntered = true;
    if (
      options.directShareOnly
      && imageCount > 0
      && state.hasAttachedImage
      && attachedImageCount < imageCount
    ) {
      attachedImageCount = imageCount;
      await writeLog(
        userId,
        account._id,
        'info',
        'facebook_post_direct_share_image_evidence',
        'Đã thấy ảnh direct-share trong composer; không chạy fallback gallery.',
        {
          state: state.name,
          reason: state.reason,
          imageCount
        }
      );
    }
    if (state.name !== 'composer' || state.hasTargetText) composerTextOpenAttempts = 0;
    finalState = state.name;
    unknownStateStreak = state.name === 'unknown' ? unknownStateStreak + 1 : 0;
    if (
      attachedImageCount > 0
      && imageCount > 0
      && mediaKind === 'image'
      && !options.directShareOnly
      && ['ready_to_post', 'composer', 'stale_composer'].includes(state.name)
      && !state.hasAttachedImage
    ) {
      await writeLog(
        userId,
        account._id,
        'warn',
        'facebook_post_image_intent_missing_in_composer',
        'Facebook composer không còn bằng chứng ảnh sau share intent; chuyển sang attach ảnh lại trong composer.',
        {
          attempt,
          previousAttachedImageCount: attachedImageCount,
          state: state.name,
          reason: state.reason
        }
      );
      attachedImageCount = 0;
    }
    await writeLog(userId, account._id, 'info', 'facebook_post_state', `Facebook state: ${state.name}.`, {
      attempt,
      reason: state.reason,
      unknownStateStreak,
      hasAttachedImage: Boolean(state.hasAttachedImage),
      captionVerified: Boolean(state.captionVerified),
      observedText: state.observedText || ''
    });

    if (state.name === 'system_anr') {
      const recovered = await recoverSystemUiAnr(account, userId, target, state);
      steps.push(recovered);
      if (!recovered.ok) {
        screenshot = await captureScreenshot(account, userId, 'system_ui_anr_unresolved');
        throw new Error('System UI của LDPlayer không phản hồi. Hãy tăng RAM/CPU hoặc khởi động lại LDPlayer.');
      }
      continue;
    }

    if (state.name === 'unknown' && state.reason === 'no_uiautomator_nodes') {
      await assertDeviceConnected(target, 'trong lúc điều khiển Facebook');
      if (emptyUiRecoveryCount >= 2) {
        screenshot = await captureScreenshot(account, userId, 'facebook_ui_nodes_unavailable');
        throw new Error('Facebook hoặc System UI không phản hồi trên LDPlayer. Đã dừng sớm để tránh workflow chạy treo.');
      }
      emptyUiRecoveryCount += 1;
      await writeLog(
        userId,
        account._id,
        'warn',
        'facebook_post_empty_ui_recovery',
        emptyUiRecoveryCount === 1
          ? 'UIAutomator chưa trả node; tạm dừng nhập liệu và chờ System UI/Facebook ổn định lại.'
          : 'UIAutomator vẫn chưa trả node; khởi động lại Facebook để phục hồi màn đăng.',
        { attempt, textEntered, recoveryCount: emptyUiRecoveryCount }
      );
      let healthy = null;
      if (emptyUiRecoveryCount === 1) {
        healthy = await waitForSystemUiHealthy(account, userId, target, {
          phase: 'facebook_empty_ui_recovery',
          stableChecks: 2,
          maxAttempts: 8,
          initialDelayMs: 600
        });
        steps.push(healthy);
      } else {
        const stop = await runCommand(env.mobileAutomation.adbPath, [
          '-s',
          target,
          'shell',
          'am',
          'force-stop',
          config.appPackage
        ], { timeoutMs: 8_000 });
        steps.push(stop);
        await writeLog(
          userId,
          account._id,
          stop.ok ? 'info' : 'warn',
          'facebook_post_empty_ui_app_restart',
          stop.ok
            ? 'Đã force-stop Facebook sau khi UIAutomator mất node lặp lại.'
            : 'Không force-stop được Facebook sau khi UIAutomator mất node lặp lại.',
          stop
        );
        await delay(900);
        const launch = await launchFacebookWarm(target, config.appPackage);
        steps.push(launch);
        await writeLog(
          userId,
          account._id,
          launch.ok ? 'info' : 'warn',
          'facebook_post_empty_ui_reopen_app',
          launch.ok
            ? 'Đã mở lại Facebook sau phục hồi UIAutomator.'
            : 'Không mở lại được Facebook sau phục hồi UIAutomator.',
          launch
        );
        healthy = await waitForSystemUiHealthy(account, userId, target, {
          phase: 'facebook_empty_ui_app_restart',
          stableChecks: 2,
          maxAttempts: 8,
          initialDelayMs: 800
        });
        steps.push(healthy);
      }
      invalidateUiDump(target);
      if (!healthy.ok) {
        screenshot = await captureScreenshot(account, userId, 'facebook_ui_recovery_failed');
        throw new Error(healthy.error || 'System UI của LDPlayer chưa ổn định.');
      }
      continue;
    }

    if (state.name === 'unknown' && unknownStateStreak >= 3) {
      const foreground = await getForegroundAndroidPackage(target);
      if (foreground.packageName === config.appPackage) {
        screenshot = await captureScreenshot(account, userId, 'facebook_post_unknown_state_fast_stop');
        await writeLog(
          userId,
          account._id,
          'warn',
          'facebook_post_unknown_state_fast_stop',
          'Facebook vẫn ở foreground nhưng state machine không nhận diện được màn hình sau nhiều lần; dừng sớm để không kẹt batch.',
          {
            attempt,
            reason: state.reason,
            openMethod: options.openMethod || '',
            foreground
          }
        );
        return {
          finalState,
          screenshot,
          steps,
          composerPending: true,
          submitVerified: false,
          submitReason: 'unknown_state_fast_stop'
        };
      }
    }

    if (state.name === 'blocked') {
      screenshot = await captureScreenshot(account, userId, 'facebook_post_blocked');
      throw new Error('Facebook đang ở màn đăng nhập/checkpoint/session expired. Cần xử lý thủ công trước khi tự đăng.');
    }

    if (['published_post', 'old_post_detail'].includes(state.name) && !config.autoSubmit) {
      const back = await keyEventAndLog(userId, account._id, target, 'facebook_post_dry_run_leave_old_post_detail', '4');
      steps.push(back);
      await writeLog(
        userId,
        account._id,
        'warn',
        'facebook_post_dry_run_old_post_detail',
        'Dry-run đang ở màn bài viết cũ trước khi bấm đăng; quay lại feed/home để mở composer mới.',
        {
          attempt,
          reason: state.reason,
          detailEvidence: state.detailEvidence || null
        }
      );
      await delay(postStepDelay(1.25));
      continue;
    }

    if (state.name === 'share_chooser') {
      const feed = await tapTextOrPoint(account, userId, target, shareFeedLabels, { x: 225, y: 1250 }, 'facebook_post_choose_feed', { exact: false });
      steps.push(feed);
      await delay(650);
      const afterFeed = await detectFacebookState(target, text);
      if (afterFeed.name === 'share_chooser') {
        const once = await tapTextOrPoint(account, userId, target, shareOnceLabels, { x: 600, y: 1550 }, 'facebook_post_choose_feed_once', { exact: true });
        steps.push(once);
      }
      await delay(postStepDelay(1.5));
      continue;
    }

    if (state.name === 'menu') {
      await closeFacebookMenuIfOpen(account, userId, target);
      await delay(postStepDelay());
      continue;
    }

    if (state.name === 'discard_dialog') {
      const discard = await tapTextOrPoint(account, userId, target, discardPostLabels, { x: 450, y: 1460 }, 'facebook_post_discard_stale_draft', { exact: true });
      steps.push(discard);
      await delay(postStepDelay(1.25));
      continue;
    }

    if (state.name === 'feeling_picker') {
      const back = await keyEventAndLog(userId, account._id, target, 'facebook_post_close_feeling_picker', '4');
      steps.push(back);
      await delay(postStepDelay(1.25));
      continue;
    }

    if (state.name === 'meta_ai') {
      const back = await keyEventAndLog(userId, account._id, target, 'facebook_post_close_meta_ai', '4');
      steps.push(back);
      await writeLog(
        userId,
        account._id,
        back.ok ? 'warn' : 'error',
        'facebook_post_meta_ai_interstitial',
        back.ok
          ? 'Meta AI đang che luồng đăng; đã bấm Back và sẽ mở lại composer.'
          : 'Meta AI đang che luồng đăng nhưng chưa đóng được bằng Back.',
        {
          state,
          back
        }
      );
      await delay(postStepDelay(1.25));
      continue;
    }

    if (state.name === 'stale_composer') {
      if (textEntered && isComposerPlaceholderText(state.observedText) && placeholderComposerWaits < 2) {
        placeholderComposerWaits += 1;
        await writeLog(
          userId,
          account._id,
          'info',
          'facebook_post_wait_placeholder_after_input',
          'Facebook vừa nhập text nhưng UI vẫn trả placeholder; chờ ngắn để tránh paste lặp nội dung dài.',
          {
            placeholderComposerWaits,
            observedText: state.observedText
          }
        );
        await delay(postStepDelay(2));
        invalidateUiDump(target);
        continue;
      }

      const editor = await tapTextOrPoint(
        account,
        userId,
        target,
        state.observedText ? [state.observedText] : composerLabels,
        { x: 450, y: 360 },
        'facebook_post_edit_stale_text',
        { exact: Boolean(state.observedText) }
      );
      steps.push(editor);
      await delay(postStepDelay(1.25));
      const replace = await replaceFocusedText(target, text, { inputMode: config.textInputMode });
      await writeLog(userId, account._id, replace.ok ? 'info' : 'error', 'facebook_post_replace_stale_text', replace.ok ? 'Đã thay nội dung draft cũ bằng nội dung mới.' : 'Không thay được nội dung draft cũ.', replace);
      if (!replace.ok) throw new Error(replace.error || replace.stderr || 'Không thay được nội dung draft cũ.');
      steps.push(replace);
      textEntered = true;
      await delay(postStepDelay(1.25));
      const verifiedInput = await verifyFacebookComposerCaptionAfterInput(
        account,
        userId,
        target,
        text,
        config.textInputMode,
        'facebook_post_replace_stale_text_verified'
      );
      steps.push(...verifiedInput.steps);
      if (!verifiedInput.ok) {
        screenshot = await captureScreenshot(account, userId, 'facebook_post_caption_missing_after_replace');
        throw new Error('Facebook đã mở composer nhưng chưa xác minh được nội dung sau khi nhập. Đã dừng để tránh báo thành công sai.');
      }
      const editorState = await detectFacebookState(target, text);
      if (editorState.name === 'text_editor') {
        const done = await tapTextOrPoint(account, userId, target, doneLabels, config.doneTap || { x: 844, y: 70 }, 'facebook_post_done_replaced_text', { exact: true });
        steps.push(done);
        await delay(postStepDelay(1.25));
      }
      continue;
    }

    if (state.name === 'ready_to_post') {
      if (attachedImageCount < imageCount) {
        if (options.directShareOnly) {
          screenshot = await captureCleanFacebookReviewScreenshot(account, userId, target, 'facebook_direct_share_image_missing_ready');
          throw new Error('Facebook chưa xác nhận ảnh direct-share trong composer. Tool đã dừng thay vì mở thư viện ảnh để tránh chọn nhầm media.');
        }
        const attachment = await attachFacebookImages(
          account,
          userId,
          target,
          imageCount - attachedImageCount,
          text,
          {
            preserveExisting: attachedImageCount > 0,
            galleryStartOffset: attachedImageCount,
            currentState: state
          }
        );
        steps.push(...attachment.steps);
        attachedImageCount += attachment.attachedCount || 1;
        await delay(postStepDelay(0.6));
        continue;
      }

      const repaired = await repairFacebookCaptionIfNeeded(account, userId, target, text, state);
      if (repaired.changed) {
        steps.push(...repaired.steps);
        textEntered = true;
        await delay(postStepDelay(1.25));
        continue;
      }

      if (!config.autoSubmit) {
        screenshot = await captureCleanFacebookReviewScreenshot(account, userId, target, 'facebook_post_ready_to_post');
        return { finalState, screenshot, steps, composerPending: false, screenshotVerified: Boolean(state.captionVerified) };
      }

      if (state.nextPoint) {
        if (composerNextTaps >= 2) {
          const healthy = await waitForSystemUiHealthy(account, userId, target, {
            phase: 'facebook_next_tap_stalled',
            stableChecks: 2,
            maxAttempts: 5,
            initialDelayMs: 250
          });
          steps.push(healthy);
          if (healthy.recoveryCount > 0) {
            await writeLog(userId, account._id, 'warn', 'facebook_post_next_tap_recovered_system_ui', 'System UI vừa hồi phục sau khi nút Tiếp không chuyển màn; kiểm tra lại trạng thái trước khi bấm tiếp.', {
              composerNextTaps,
              healthy
            });
            invalidateUiDump(target);
            await delay(postStepDelay(0.8));
            continue;
          }
          if (composerNextTaps >= 4) {
            screenshot = await captureScreenshot(account, userId, 'facebook_post_next_not_advancing');
            await writeLog(userId, account._id, 'warn', 'facebook_post_next_not_advancing', 'Facebook không chuyển màn sau nhiều lần bấm Tiếp; dừng để tránh bấm lặp.', {
              composerNextTaps,
              state
            });
            return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'next_not_advancing' };
          }
        }
        const next = await tapFacebookNextButton(account, userId, target, 'facebook_post_tap_next', state.nextPoint);
        steps.push(next);
        composerNextTaps += 1;
        await delay(postStepDelay(0.8));
        continue;
      }

      const submitted = await submitFacebookPost(
        account,
        userId,
        target,
        config,
        text,
        steps,
        'facebook_post_submit_tap',
        imageCount,
        state.submitPoint,
        mediaKind
      );
      return submitted;
    }

    if (state.name === 'text_editor') {
      let enteredState = null;
      if (!textEntered) {
        if (state.inputPoint) {
          const focus = await tapAndLog(userId, account._id, target, 'facebook_post_focus_text_input', state.inputPoint);
          steps.push(focus);
          await delay(postStepDelay(0.45));
          invalidateUiDump(target);
        }
        const input = await inputAndLog(userId, account._id, target, 'facebook_post_input_text', text, false, { inputMode: config.textInputMode });
        steps.push(input);
        textEntered = true;
        await delay(postStepDelay(1.25));
        const verifiedInput = await verifyFacebookComposerCaptionAfterInput(
          account,
          userId,
          target,
          text,
          config.textInputMode,
          'facebook_post_verify_text'
        );
        steps.push(...verifiedInput.steps);
        if (!verifiedInput.ok) {
          screenshot = await captureScreenshot(account, userId, 'facebook_post_caption_missing_after_input');
          throw new Error('Facebook đã mở composer nhưng chưa xác minh được nội dung sau khi nhập. Đã dừng để tránh báo thành công sai.');
        }
        enteredState = await detectFacebookState(target, text);
        await writeLog(userId, account._id, enteredState.captionVerified ? 'info' : 'warn', 'facebook_post_verify_text_state', enteredState.captionVerified ? 'Đã xác nhận text đầy đủ trong editor.' : 'Chưa xác nhận được text đầy đủ trong editor sau khi nhập.', {
          state: enteredState.name,
          reason: enteredState.reason,
          hasTargetText: enteredState.hasTargetText,
          captionVerified: enteredState.captionVerified
        });
      }

      if (!config.autoSubmit && !imageCount) {
        const done = await tapTextOrPoint(account, userId, target, doneLabels, { x: 846, y: 72 }, 'facebook_post_done_text_review', { exact: true });
        steps.push(done);
        await delay(postStepDelay(1.5));
        const reviewState = await detectFacebookState(target, text);
        screenshot = await captureCleanFacebookReviewScreenshot(account, userId, target, 'facebook_post_ready_to_review');
        if (!reviewState.captionVerified) {
          await writeLog(userId, account._id, 'warn', 'facebook_post_review_caption_not_verified', 'Composer đã mở nhưng nội dung chưa được xác minh đầy đủ; không trả trạng thái sẵn sàng.', {
            state: reviewState.name,
            reason: reviewState.reason,
            hasTargetText: reviewState.hasTargetText,
            captionVerified: reviewState.captionVerified
          });
          return {
            finalState: reviewState.name || finalState,
            screenshot,
            steps,
            composerPending: true,
            submitVerified: false,
            submitReason: 'review_caption_not_verified'
          };
        }
        return {
          finalState: reviewState.name || finalState,
          screenshot,
          steps,
          composerPending: false,
          submitVerified: false,
          submitReason: 'review_mode',
          screenshotVerified: true
        };
      }

      if (
        enteredState
        && enteredState.captionVerified
        && ['ready_to_post', 'composer'].includes(enteredState.name)
      ) {
        await writeLog(
          userId,
          account._id,
          'info',
          'facebook_post_text_ready_without_done',
          'Facebook đã nhận nội dung ngay trong màn Bài viết mới; bỏ qua nút Xong và tiếp tục kiểm tra nút Đăng.',
          {
            state: enteredState.name,
            reason: enteredState.reason
          }
        );
        await delay(postStepDelay(0.8));
        continue;
      }

      const done = await tapTextOrPoint(account, userId, target, doneLabels, { x: 846, y: 72 }, 'facebook_post_done_text', { exact: true });
      steps.push(done);
      await delay(postStepDelay(1.5));
      continue;
    }

    if (state.name === 'composer') {
      if (state.hasTargetText) {
        if (attachedImageCount < imageCount) {
          if (options.directShareOnly) {
            screenshot = await captureCleanFacebookReviewScreenshot(account, userId, target, 'facebook_direct_share_image_missing_composer');
            throw new Error('Facebook chưa xác nhận ảnh direct-share trong composer. Tool đã dừng thay vì mở thư viện ảnh để tránh chọn nhầm media.');
          }
          const attachment = await attachFacebookImages(
            account,
            userId,
            target,
            imageCount - attachedImageCount,
            text,
            {
              preserveExisting: attachedImageCount > 0,
              galleryStartOffset: attachedImageCount,
              currentState: state
            }
          );
          steps.push(...attachment.steps);
          attachedImageCount += attachment.attachedCount || 1;
          await delay(postStepDelay(0.6));
          continue;
        }

        const repaired = await repairFacebookCaptionIfNeeded(account, userId, target, text, state);
        if (repaired.changed) {
          steps.push(...repaired.steps);
          textEntered = true;
          await delay(postStepDelay(1.25));
          continue;
        }

        if (!config.autoSubmit) {
          screenshot = await captureCleanFacebookReviewScreenshot(account, userId, target, 'facebook_post_composer_ready');
          return { finalState, screenshot, steps, composerPending: false, screenshotVerified: Boolean(state.captionVerified || state.hasTargetText) };
        }
        if (state.nextPoint) {
          const next = await tapFacebookNextButton(account, userId, target, 'facebook_post_tap_next_from_composer', state.nextPoint);
          steps.push(next);
          composerNextTaps += 1;
          await delay(postStepDelay(0.8));
          continue;
        }
        const submitted = await submitFacebookPost(
          account,
          userId,
          target,
          config,
          text,
          steps,
          'facebook_post_submit_from_composer',
          imageCount,
          state.submitPoint,
          mediaKind
        );
        return submitted;
      }

      composerTextOpenAttempts += 1;
      if (composerTextOpenAttempts >= 3) {
        const healthy = await waitForSystemUiHealthy(account, userId, target, {
          phase: 'facebook_composer_tap_stalled',
          stableChecks: 2,
          maxAttempts: 5,
          initialDelayMs: 250
        });
        steps.push(healthy);
        if (healthy.recoveryCount > 0) {
          await writeLog(userId, account._id, 'warn', 'facebook_post_composer_tap_recovered_system_ui', 'System UI vừa hồi phục sau khi composer không mở editor; kiểm tra lại trạng thái trước khi tap tiếp.', {
            composerTextOpenAttempts,
            healthy
          });
          invalidateUiDump(target);
          await delay(postStepDelay(0.8));
          continue;
        }
        if (composerTextOpenAttempts >= 8) {
          screenshot = await captureScreenshot(account, userId, 'facebook_post_composer_editor_not_opening');
          await writeLog(userId, account._id, 'warn', 'facebook_post_composer_editor_not_opening', 'Facebook không mở editor sau nhiều lần tap composer; dừng để tránh treo workflow.', {
            composerTextOpenAttempts,
            state
          });
          return { finalState, screenshot, steps, composerPending: true, submitVerified: false, submitReason: 'composer_editor_not_opening' };
        }
      }
      const bodyTap = await tapTextOrPoint(account, userId, target, composerLabels, { x: 450, y: 218 }, 'facebook_post_open_text_editor');
      steps.push(bodyTap);
      await delay(postStepDelay(1.25));
      continue;
    }

    if (state.name === 'home') {
      if (config.autoSubmit && composerNextTaps > 0 && attachedImageCount >= imageCount) {
        const verification = await verifyFacebookPostSubmit(
          account,
          userId,
          target,
          text,
          config.waitAfterSubmitMs,
          imageCount,
          mediaKind,
          true
        );
        return {
          finalState: verification?.ok ? 'submitted' : verification?.finalState,
          screenshot: verification?.screenshot,
          screenshotVerified: Boolean(verification?.screenshotVerified),
          steps,
          composerPending: verification?.composerPending ?? false,
          submitVerified: Boolean(verification?.ok),
          submitReason: verification?.reason || 'home_after_next'
        };
      }

      const composerTap = await tapTextOrPoint(account, userId, target, composerLabels, config.composerTap, 'facebook_post_tap_composer');
      steps.push(composerTap);
      await delay(postStepDelay(1.25));
      continue;
    }

    if (attempt <= 4) {
      await writeLog(userId, account._id, 'info', 'facebook_post_wait_for_ui', 'Đang chờ Facebook hoàn tất chuyển màn.', {
        attempt,
        state: state.name
      });
      await delay(postStepDelay(1.25));
      continue;
    }

    const home = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', config.appPackage, '-c', 'android.intent.category.LAUNCHER', '1']);
    steps.push(home);
    await writeLog(userId, account._id, home.ok ? 'info' : 'warn', 'facebook_post_reopen_home', home.ok ? 'Đã mở lại Facebook để tìm Home.' : 'Mở lại Facebook lỗi.', home);
    await delay(postStepDelay(1.25));
  }

  screenshot = await captureScreenshot(account, userId, 'facebook_post_state_machine_pending');
  await writeLog(userId, account._id, 'warn', 'facebook_post_state_machine_pending', 'Không đưa được Facebook tới trạng thái đăng bài sau nhiều bước.', {
    finalState
  });
  return { finalState, screenshot, steps, composerPending: true };
}

async function verifyFacebookComposerCaptionAfterInput(account, userId, target, text, inputMode, action) {
  const expected = cleanClipboardText(text).trim();
  if (!expected) return { ok: true, steps: [], verification: { ok: true, source: 'empty_text' } };

  let nodes = await dumpVisibleNodes(target);
  let verification = verifyCompleteCaption(nodes, expected);
  await writeLog(
    userId,
    account._id,
    verification.ok ? 'info' : 'warn',
    action,
    verification.ok ? 'Đã xác minh nội dung đầy đủ sau khi nhập.' : 'Nội dung chưa khớp đầy đủ sau khi nhập; kiểm tra fallback nếu cần.',
    {
      inputMode,
      verification
    }
  );

  const steps = [];
  if (verification.ok) {
    return { ok: verification.ok, steps, verification };
  }

  if (inputMode !== 'natural') {
    await delay(postStepDelay(1.5));
    nodes = await dumpVisibleNodes(target);
    verification = verifyCompleteCaption(nodes, expected);
    if (verification.ok) {
      await writeLog(
        userId,
        account._id,
        'info',
        `${action}_settled_verified`,
        'Đã xác minh nội dung sau khi chờ Facebook cập nhật editor.',
        verification
      );
      return { ok: true, steps, verification };
    }

    const replace = await replaceFocusedText(target, expected, { inputMode: 'stable' });
    steps.push(replace);
    await writeLog(
      userId,
      account._id,
      replace.ok ? 'info' : 'error',
      `${action}_stable_retry`,
      replace.ok ? 'Đã nhập lại nội dung bằng stable input sau khi xác minh lần đầu chưa khớp.' : 'Nhập lại stable input thất bại.',
      replace
    );
    if (!replace.ok) {
      return { ok: false, steps, verification, error: replace.error || replace.stderr || 'stable_retry_failed' };
    }

    await delay(postStepDelay(1.4));
    nodes = await dumpVisibleNodes(target);
    verification = verifyCompleteCaption(nodes, expected);
    await writeLog(
      userId,
      account._id,
      verification.ok ? 'info' : 'warn',
      `${action}_stable_retry_verified`,
      verification.ok ? 'Đã xác minh nội dung sau stable retry.' : 'Stable retry vẫn chưa xác minh được nội dung.',
      verification
    );
    return { ok: verification.ok, steps, verification };
  }

  const replace = await replaceFocusedText(target, expected, { inputMode: 'stable' });
  steps.push(replace);
  await writeLog(
    userId,
    account._id,
    replace.ok ? 'info' : 'error',
    `${action}_stable_fallback`,
    replace.ok ? 'Nhập tự nhiên chưa xác minh được; đã fallback sang nhập ổn định.' : 'Fallback nhập ổn định thất bại.',
    replace
  );
  if (!replace.ok) {
    return { ok: false, steps, verification, error: replace.error || replace.stderr || 'stable_fallback_failed' };
  }

  await delay(postStepDelay(1.1));
  nodes = await dumpVisibleNodes(target);
  verification = verifyCompleteCaption(nodes, expected);
  await writeLog(
    userId,
    account._id,
    verification.ok ? 'info' : 'warn',
    `${action}_stable_fallback_verified`,
    verification.ok ? 'Đã xác minh nội dung sau fallback ổn định.' : 'Fallback ổn định vẫn chưa xác minh được nội dung.',
    verification
  );

  return { ok: verification.ok, steps, verification };
}

async function captureCleanFacebookReviewScreenshot(account, userId, target, reason) {
  let lastRecovery = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const recovery = await recoverSystemUiAnrIfVisible(account, userId, target, `${reason}_system_ui_anr_${attempt}`);
    lastRecovery = recovery;
    if (!recovery.recovered) break;
    await delay(postStepDelay(attempt + 1));
  }

  const nodes = await dumpVisibleNodes(target);
  const blockingAnr = detectSystemUiAnr(nodes);
  if (blockingAnr) {
    const screenshot = await captureScreenshot(account, userId, `${reason}_blocked_by_system_ui_anr`);
    await writeLog(
      userId,
      account._id,
      'error',
      'facebook_review_screenshot_blocked_by_system_ui_anr',
      'Không dùng ảnh review vì hộp thoại System UI ANR vẫn đang che composer.',
      {
        reason,
        blockingAnr,
        lastRecovery,
        screenshotOk: Boolean(screenshot?.ok)
      }
    );
    return {
      ...(screenshot || {}),
      ok: false,
      blockedBySystemUiAnr: true,
      error: 'System UI ANR is still blocking the composer screenshot.'
    };
  }

  let screenshot = await captureScreenshot(account, userId, reason);
  for (let attempt = 1; attempt <= 2 && !screenshot?.ok; attempt += 1) {
    await delay(700 * attempt);
    await assertDeviceConnected(target, `trước khi chụp lại màn composer lần ${attempt + 1}`);
    screenshot = await captureScreenshot(account, userId, `${reason}_retry_${attempt}`);
  }
  return screenshot;
}

async function repairFacebookCaptionIfNeeded(account, userId, target, text, state = {}) {
  const expected = cleanClipboardText(text).trim();
  if (!expected) return { changed: false, steps: [] };
  if (state.captionVerified) {
    return { changed: false, steps: [], verification: { ok: true, source: 'detect_facebook_state' } };
  }

  const nodes = await dumpVisibleNodes(target);
  const verification = verifyCompleteCaption(nodes, expected);
  if (verification.ok) return { changed: false, steps: [], verification };

  const steps = [];
  const textNode = findFacebookComposerTextNode(nodes, state);
  const focusPoint = textNode
    ? {
      x: Math.round((textNode.left + textNode.right) / 2),
      y: Math.round((textNode.top + textNode.bottom) / 2)
    }
    : { x: 450, y: 385 };

  const focus = await tapNodeOrPoint(
    account,
    userId,
    target,
    textNode,
    focusPoint,
    'facebook_post_repair_caption_focus',
    { nodeSource: 'caption_text_node' }
  );
  steps.push(focus);
  await delay(postStepDelay(1.1));

  const replace = await replaceFocusedText(target, expected, { inputMode: 'stable' });
  await writeLog(
    userId,
    account._id,
    replace.ok ? 'info' : 'error',
    'facebook_post_repair_caption',
    replace.ok ? 'Đã nhập lại caption bằng Unicode-safe input.' : 'Không nhập lại được caption Unicode.',
    {
      ...replace,
      verification,
      focusPoint,
      textNode
    }
  );
  steps.push(replace);
  if (!replace.ok) throw new Error(replace.error || replace.stderr || 'Không nhập lại được caption Unicode.');

  await delay(postStepDelay(1.1));
  const editorState = await detectFacebookState(target, expected);
  if (editorState.name === 'text_editor') {
    const done = await tapTextOrPoint(account, userId, target, doneLabels, { x: 846, y: 72 }, 'facebook_post_done_repaired_caption', { exact: true });
    steps.push(done);
    await delay(postStepDelay(1.25));
  }

  const repairedNodes = await dumpVisibleNodes(target);
  const repairedVerification = verifyCompleteCaption(repairedNodes, expected);
  await writeLog(
    userId,
    account._id,
    repairedVerification.ok ? 'info' : 'warn',
    'facebook_post_repair_caption_verified',
    repairedVerification.ok ? 'Đã xác nhận caption Unicode đúng sau khi nhập lại.' : 'Caption vẫn chưa khớp hoàn toàn sau khi nhập lại.',
    repairedVerification
  );

  return {
    changed: true,
    steps,
    verification: repairedVerification
  };
}

function findFacebookComposerTextNode(nodes = [], state = {}) {
  const editText = nodes.find((node) => node.className.includes('EditText') && normalizeSearchText(node.text));
  if (editText) return { ...editText.bounds, text: editText.text, desc: editText.desc, className: editText.className, resourceId: editText.resourceId };

  const observed = normalizeSearchText(state.observedText || '');
  if (observed) {
    const match = nodes.find((node) => normalizeSearchText(`${node.text} ${node.desc}`).includes(observed));
    if (match) return { ...match.bounds, text: match.text, desc: match.desc, className: match.className, resourceId: match.resourceId };
  }

  return null;
}

async function waitForFacebookMediaComposer(target, text, mediaKind = 'image', timeoutMs = 12_000) {
  const startedAt = Date.now();
  let attempt = 0;
  let lastState = null;
  const attachmentLabels = mediaKind === 'video' ? attachedVideoLabels : attachedImageLabels;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    invalidateUiDump(target);
    const nodes = await dumpVisibleNodes(target);
    lastState = await detectFacebookState(target, text, nodes);
    const hasTargetText = screenHasText(nodes, text);
    const hasAttachedMedia = hasFacebookAttachedMediaEvidence(nodes, mediaKind, lastState);
    const textRequirementOk = mediaKind === 'image' ? true : hasTargetText;
    if (['share_chooser', 'system_anr'].includes(lastState.name)) {
      return {
        ok: false,
        attempt,
        elapsedMs: Date.now() - startedAt,
        state: lastState.name,
        hasTargetText,
        hasAttachedMedia
      };
    }
    if (
      ['ready_to_post', 'composer', 'stale_composer'].includes(lastState.name)
      && textRequirementOk
      && hasAttachedMedia
    ) {
      return {
        ok: true,
        attempt,
        elapsedMs: Date.now() - startedAt,
        state: lastState.name,
        hasTargetText,
        hasAttachedMedia
      };
    }
    await delay(attempt < 3 ? 550 : 800);
  }

  return {
    ok: false,
    attempt,
    elapsedMs: Date.now() - startedAt,
    state: lastState?.name || 'unknown',
    hasTargetText: Boolean(lastState?.hasTargetText),
    hasAttachedMedia: Boolean(lastState?.hasAttachedImage)
  };
}

async function submitFacebookPost(account, userId, target, config, text, steps, action, mediaCount = 0, knownSubmitPoint = null, mediaKind = 'image') {
  const submitAttempts = await buildSubmitTapAttempts(target, knownSubmitPoint);
  let submitAccepted = false;
  let submitProgressSeen = false;

  for (let index = 0; index < submitAttempts.length; index += 1) {
    const attempt = submitAttempts[index];
    const submit = await tapAndLog(
      userId,
      account._id,
      target,
      index === 0 ? action : `${action}_retry_${index}`,
      attempt.point
    );
    steps.push(submit);

    await delay(index === 0 ? (mediaCount > 0 ? 2_500 : 450) : (mediaCount > 0 ? 1_500 : 700));
    const nodes = await dumpVisibleNodes(target);
    const progress = findPostingProgressNode(nodes);
    const confirmation = findNodeInNodes(nodes, postedConfirmationLabels);
    const submitStillVisible = findSemanticSubmitButton(nodes);
    if (progress || confirmation) {
      submitAccepted = true;
      submitProgressSeen = Boolean(progress);
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_accepted', 'Facebook đã nhận thao tác bấm nút đăng.', {
        attempt: index + 1,
        method: attempt.method,
        point: attempt.point,
        progress,
        confirmation
      });
      break;
    }

    if (!submitStillVisible) {
      await delay(1_500);
      invalidateUiDump(target);
      const transitionState = await detectFacebookState(target, text);
      if (['ready_to_post', 'composer', 'text_editor'].includes(transitionState.name)) {
        if (!transitionState.hasTargetText && !transitionState.observedText) {
          submitAccepted = true;
          await writeLog(
            userId,
            account._id,
            'info',
            'facebook_post_submit_content_consumed',
            'Facebook đã nhận caption và reset composer; dừng bấm lại để tránh đăng trùng.',
            {
              attempt: index + 1,
              method: attempt.method,
              point: attempt.point,
              state: transitionState
            }
          );
          break;
        }
        await writeLog(
          userId,
          account._id,
          'warn',
          'facebook_post_submit_button_returned',
          'Nút Đăng chỉ tạm ẩn khi video đang hoàn tất tải; tiếp tục thử lại sau khi composer ổn định.',
          {
            attempt: index + 1,
            method: attempt.method,
            point: attempt.point,
            state: transitionState
          }
        );
        await delay(900);
        continue;
      }
      await writeLog(
        userId,
        account._id,
        'info',
        'facebook_post_submit_transitioning',
        'Nút Đăng đã biến mất; dừng thao tác bấm và chuyển sang bước xác minh để tránh đăng lặp.',
        {
          attempt: index + 1,
          method: attempt.method,
          point: attempt.point
        }
      );
      break;
    }

    await writeLog(userId, account._id, 'warn', 'facebook_post_submit_retry', submitStillVisible
      ? 'Nút đăng vẫn còn hiển thị, thử bấm lại.'
      : 'Chưa thấy tín hiệu Facebook nhận bài, kiểm tra lại trước khi thử bấm lần nữa.', {
      attempt: index + 1,
      point: attempt.point,
      method: attempt.method,
      matchedSubmit: submitStillVisible
    });
    await delay(postStepDelay());
  }

  const verification = await verifyFacebookPostSubmit(
    account,
    userId,
    target,
    text,
    config.waitAfterSubmitMs,
    mediaCount,
    mediaKind,
    submitProgressSeen
  );
  if (!submitAccepted && verification.composerPending) {
    await writeLog(userId, account._id, 'warn', 'facebook_post_submit_not_accepted', 'Facebook chưa nhận thao tác bấm nút đăng sau các lần thử.', {
      attempts: submitAttempts.length
    });
  }

  if (verification && verification.composerPending && !verification.screenshot) {
    verification.screenshot = await captureScreenshot(account, userId, 'facebook_post_submit_pending_final');
  }

  return {
    finalState: verification?.ok ? 'submitted' : verification?.finalState,
    screenshot: verification?.screenshot,
    screenshotVerified: Boolean(verification?.screenshotVerified),
    steps,
    composerPending: verification?.composerPending ?? true,
    submitVerified: Boolean(verification?.ok),
    submitReason: verification?.reason || ''
  };
}

async function buildSubmitTapAttempts(target, knownSubmitPoint = null) {
  const nodes = await dumpVisibleNodes(target);
  const submitNode = findSemanticSubmitButton(nodes);
  const submitPoint = submitNode
    ? {
      x: Math.round((submitNode.left + submitNode.right) / 2),
      y: Math.round((submitNode.top + submitNode.bottom) / 2)
    }
    : null;
  const points = [];
  if (submitPoint) {
    points.push({ method: 'semantic_button', point: submitPoint });
  }
  if (knownSubmitPoint && !points.some((item) => pointsDistance(item.point, knownSubmitPoint) <= 8)) {
    points.push({ method: 'state_detection_fallback', point: knownSubmitPoint });
  }
  if (!points.length) {
    const size = await getDeviceScreenSize(target);
    const width = size?.width || 900;
    points.push(
      { method: 'fallback_top_right_primary', point: { x: Math.round(width - 52), y: 72 } },
      { method: 'fallback_top_right_secondary', point: { x: Math.round(width - 110), y: 72 } },
      { method: 'fallback_top_right_lower', point: { x: Math.round(width - 52), y: 145 } }
    );
  }

  return points;
}

function pointsDistance(left = {}, right = {}) {
  const dx = Number(left.x || 0) - Number(right.x || 0);
  const dy = Number(left.y || 0) - Number(right.y || 0);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function findSemanticSubmitButton(nodes) {
  const labels = submitLabels.map(normalizeSearchText);
  const candidates = nodes
    .filter((node) => {
      if (!node.enabled || !node.clickable) return false;
      if (!node.className.includes('Button')) return false;
      const value = normalizeSearchText(`${node.text} ${node.desc}`);
      return labels.some((label) => isFacebookSubmitLabelMatch(value, label));
    })
    .map((node) => ({
      ...node.bounds,
      label: node.text || node.desc,
      text: node.text,
      desc: node.desc,
      className: node.className
    }));

  return candidates.sort((a, b) => (b.bottom - a.bottom) || (b.right - a.right))[0] || null;
}

function hasFacebookAttachedMediaEvidence(nodes = [], mediaKind = 'image', state = {}) {
  const labels = mediaKind === 'video' ? attachedVideoLabels : attachedImageLabels;
  if (findNodeInNodes(nodes, labels)) return true;
  if (mediaKind === 'video') return Boolean(findNodeInNodes(nodes, attachedMediaLabels));

  const hasComposerContext = Boolean(
    findNodeInNodes(nodes, postTitleLabels)
    || ['ready_to_post', 'composer', 'stale_composer'].includes(state?.name)
  );
  if (!hasComposerContext) return false;

  const screenRight = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.right) || 0), 0) || 900;
  const screenBottom = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.bottom) || 0), 0) || 1600;
  const minimumPreviewArea = screenRight * screenBottom * 0.045;
  return nodes.some((node) => {
    const className = String(node.className || '');
    if (!/ImageView|TextureView|FrameLayout|ViewGroup/i.test(className)) return false;
    const width = Math.max(0, Number(node.right) - Number(node.left));
    const height = Math.max(0, Number(node.bottom) - Number(node.top));
    const area = width * height;
    return area >= minimumPreviewArea
      && width >= Math.round(screenRight * 0.45)
      && height >= Math.round(screenBottom * 0.12)
      && Number(node.top) >= 220
      && Number(node.bottom) <= Math.round(screenBottom * 0.9);
  });
}

function isFacebookSubmitLabelMatch(value, label) {
  if (!value || !label) return false;
  if (value === label) return true;
  if (['post', 'dang', 'share', 'publish'].includes(label)) return false;
  return value.includes(label);
}

async function verifyFacebookPostSubmit(
  account,
  userId,
  target,
  text,
  waitAfterSubmitMs = 0,
  mediaCount = 0,
  mediaKind = 'image',
  initialPostingProgress = false
) {
  let lastState = null;
  const mediaMinimumVerificationMs = mediaKind === 'video'
    ? 90_000
    : (mediaCount > 0 ? 32_000 : 8_000);
  const verificationWindowMs = Math.max(mediaMinimumVerificationMs, waitAfterSubmitMs || 0);
  const verificationStartedAt = Date.now();
  const verificationDeadline = verificationStartedAt + verificationWindowMs;
  const uploadDeadline = verificationStartedAt + Math.max(
    verificationWindowMs,
    mediaKind === 'video' ? 180_000 : (mediaCount > 0 ? 120_000 : 30_000)
  );
  let sawPostingProgress = Boolean(initialPostingProgress);
  let composerChecksAfterProgress = 0;
  if (waitAfterSubmitMs > 0) {
    await writeLog(userId, account._id, 'info', 'facebook_post_submit_grace_period', `Xác minh kết quả đăng trong tối đa ${Math.round(verificationWindowMs / 1000)} giây.`, {
      waitAfterSubmitMs,
      verificationWindowMs,
      mode: 'adaptive_maximum'
    });
  }

  const maxVerificationAttempts = mediaKind === 'video' ? 180 : (mediaCount > 0 ? 90 : 32);
  for (let attempt = 1; attempt <= maxVerificationAttempts; attempt += 1) {
    await delay(attempt === 1 ? 450 : (mediaKind === 'video' ? 1_000 : 650));
    const nodes = await dumpVisibleNodes(target);
    const confirmation = findNodeInNodes(nodes, postedConfirmationLabels);
    if (confirmation) {
      const evidence = await captureFacebookPublishedPostEvidence(account, userId, target, text);
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_verified', `Đã xác nhận Facebook nhận bài qua text "${confirmation.label}".`, {
        attempt,
        confirmation,
        screenshotVerified: evidence.verified
      });
      return {
        ok: true,
        reason: 'confirmation_label',
        screenshot: evidence.screenshot,
        screenshotVerified: evidence.verified,
        composerPending: false,
        finalState: 'submitted'
      };
    }

    const progress = findPostingProgressNode(nodes);
    if (progress) {
      composerChecksAfterProgress = 0;
      if (!sawPostingProgress) {
        await writeLog(userId, account._id, 'info', 'facebook_post_media_uploading', mediaKind === 'video'
          ? 'Facebook đang tải và xử lý video.'
          : (mediaCount > 0 ? `Facebook đang tải ${mediaCount} ảnh và đăng bài.` : 'Facebook đang xử lý bài đăng.'), {
          attempt,
          progress,
          mediaCount,
          mediaKind
        });
      }
      sawPostingProgress = true;
      if (Date.now() < uploadDeadline) continue;
      break;
    }

    lastState = await detectFacebookState(target, text, nodes);
    if (lastState.name === 'blocked') {
      const screenshot = await captureScreenshot(account, userId, 'facebook_post_submit_blocked');
      await writeLog(userId, account._id, 'error', 'facebook_post_submit_blocked', 'Facebook chuyển sang đăng nhập/checkpoint sau khi bấm Đăng.', {
        attempt,
        state: lastState
      });
      return { ok: false, reason: 'blocked_after_submit', screenshot, composerPending: true, finalState: 'blocked' };
    }

    if (!['ready_to_post', 'composer', 'text_editor', 'stale_composer'].includes(lastState.name)) {
      const expectedText = cleanClipboardText(text).trim();
      const hasExpectedText = expectedText && screenHasText(nodes, expectedText);
      const expectedTextInEditor = nodes.some((node) => (
        node.className.includes('EditText')
        && screenHasText([node], expectedText)
      ));
      const publishedDetail = detectFacebookPublishedPostDetail(nodes, text, lastState);
      if ((lastState.name === 'home' && hasExpectedText && !expectedTextInEditor) || publishedDetail.ok) {
        const screenshot = await captureScreenshot(account, userId, 'facebook_published_post_verified');
        const reason = publishedDetail.ok
          ? 'published_post_detail_visible'
          : (sawPostingProgress ? 'upload_completed_and_post_visible' : 'published_post_visible');
        await writeLog(userId, account._id, 'info', 'facebook_post_submit_verified', 'Đã tìm thấy đúng nội dung bài vừa đăng trên feed.', {
          attempt,
          elapsedMs: Date.now() - verificationStartedAt,
          mediaCount,
          mediaKind,
          sawPostingProgress,
          state: lastState,
          detailEvidence: publishedDetail,
          screenshotVerified: true,
          method: 'current_ui_nodes'
        });
        return {
          ok: true,
          reason,
          screenshot,
          screenshotVerified: true,
          composerPending: false,
          finalState: 'submitted'
        };
      }
      const evidence = await captureFacebookPublishedPostEvidence(account, userId, target, text);
      if (!evidence.verified) {
        if (evidence.uploadInProgress && Date.now() < uploadDeadline) {
          sawPostingProgress = true;
          await writeLog(userId, account._id, 'info', 'facebook_post_background_upload_waiting', 'Facebook đã đóng composer và đang hoàn tất tải video ở màn hình chính.', {
            attempt,
            elapsedMs: Date.now() - verificationStartedAt,
            mediaKind,
            evidenceReason: evidence.reason
          });
          continue;
        }
        if (Date.now() < verificationDeadline) {
          await writeLog(userId, account._id, 'info', 'facebook_post_submit_evidence_waiting', mediaCount > 0
            ? 'Facebook đã rời màn soạn bài; tiếp tục chờ feed cập nhật bài có media để đối chiếu.'
            : 'Facebook đã rời màn soạn bài; tiếp tục chờ feed cập nhật để đối chiếu.', {
            attempt,
            elapsedMs: Date.now() - verificationStartedAt,
            mediaCount,
            mediaKind,
            sawPostingProgress,
            state: lastState,
            evidenceReason: evidence.reason
          });
          continue;
        }
        await writeLog(userId, account._id, 'warn', 'facebook_post_submit_evidence_pending', sawPostingProgress
          ? 'Facebook đã xử lý thao tác đăng nhưng chưa thấy đúng bài mới trên feed.'
          : 'Facebook đã rời màn soạn bài nhưng chưa đủ bằng chứng bài đã đăng.', {
          attempt,
          elapsedMs: Date.now() - verificationStartedAt,
          mediaCount,
          mediaKind,
          sawPostingProgress,
          state: lastState
        });
        return {
          ok: false,
          reason: evidence.uploadInProgress ? 'video_upload_timeout' : 'published_post_evidence_pending',
          screenshot: null,
          screenshotVerified: false,
          composerPending: false,
          finalState: 'submit_unverified'
        };
      }

      const reason = sawPostingProgress ? 'upload_completed_and_post_visible' : 'published_post_visible';
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_verified', 'Đã tìm thấy đúng nội dung bài vừa đăng trên feed.', {
        attempt,
        elapsedMs: Date.now() - verificationStartedAt,
        mediaCount,
        mediaKind,
        sawPostingProgress,
        state: lastState,
        screenshotVerified: evidence.verified
      });
      return {
        ok: true,
        reason,
        screenshot: evidence.screenshot,
        screenshotVerified: evidence.verified,
        composerPending: false,
        finalState: 'submitted'
      };
    }

    if (sawPostingProgress && Date.now() < uploadDeadline) {
      if (['ready_to_post', 'composer', 'text_editor'].includes(lastState.name)) {
        composerChecksAfterProgress += 1;
      } else {
        composerChecksAfterProgress = 0;
      }

      if (
        mediaKind === 'video'
        && composerChecksAfterProgress >= 4
        && Date.now() - verificationStartedAt >= 15_000
      ) {
        const screenshot = await captureScreenshot(account, userId, 'facebook_video_upload_reverted');
        await writeLog(
          userId,
          account._id,
          'error',
          'facebook_post_video_upload_reverted',
          'Facebook đã bắt đầu tải video nhưng quay lại màn soạn bài. Video chưa được đăng.',
          {
            attempt,
            elapsedMs: Date.now() - verificationStartedAt,
            composerChecksAfterProgress,
            state: lastState
          }
        );
        return {
          ok: false,
          reason: 'video_upload_reverted_to_composer',
          screenshot,
          screenshotVerified: false,
          composerPending: true,
          finalState: lastState.name
        };
      }

      if (attempt === 1 || attempt % 5 === 0) {
        await writeLog(userId, account._id, 'info', 'facebook_post_upload_progress_pending', mediaKind === 'video'
          ? 'Tín hiệu tải video tạm ẩn; tiếp tục chờ Facebook hoàn tất thay vì kết luận thất bại.'
          : 'Tín hiệu tải ảnh tạm ẩn; tiếp tục chờ Facebook hoàn tất thay vì kết luận thất bại.', {
          attempt,
          elapsedMs: Date.now() - verificationStartedAt,
          state: lastState,
          mediaKind
        });
      }
      continue;
    }

    if (Date.now() < verificationDeadline) {
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_waiting', 'Facebook vẫn đang hoàn tất đăng bài.', {
        attempt,
        elapsedMs: Date.now() - verificationStartedAt,
        state: lastState
      });
      continue;
    }

    await writeLog(userId, account._id, 'warn', 'facebook_post_submit_still_in_composer', 'Facebook vẫn ở màn soạn bài và chưa nhận thao tác đăng.', {
      attempt,
      elapsedMs: Date.now() - verificationStartedAt,
      state: lastState
    });
    return { ok: false, reason: 'still_in_composer', screenshot: null, composerPending: true, finalState: lastState.name };
  }

  const returnedHome = lastState?.name === 'home';
  const evidence = returnedHome
    ? await captureFacebookPublishedPostEvidence(account, userId, target, text)
    : { screenshot: null, verified: false };
  const verified = returnedHome && evidence.verified;
  await writeLog(userId, account._id, verified ? 'info' : 'warn', verified ? 'facebook_post_submit_verified' : 'facebook_post_submit_unverified', verified
    ? 'Đã tìm thấy đúng nội dung bài vừa đăng trên feed.'
    : 'Đã bấm Đăng nhưng chưa tìm thấy đúng bài mới trên feed để xác nhận.', {
    state: lastState,
    screenshotVerified: evidence.verified
  });
  return {
    ok: verified,
    reason: verified ? 'published_post_visible' : 'no_published_post_evidence',
    screenshot: evidence.screenshot,
    screenshotVerified: evidence.verified,
    composerPending: false,
    finalState: verified ? 'submitted' : (lastState?.name || 'submit_unverified')
  };
}

async function captureFacebookPublishedPostEvidence(account, userId, target, text) {
  const expectedText = cleanClipboardText(text).trim();
  if (!expectedText) {
    return { screenshot: null, verified: false, reason: 'empty_post_text' };
  }

  await launchFacebookWarm(target, defaultPackages.facebook);
  await delay(1_100);
  invalidateUiDump(target);
  let uploadInProgress = false;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const nodes = await dumpVisibleNodes(target);
    if (findPostingProgressNode(nodes)) uploadInProgress = true;
    const state = await detectFacebookState(target, expectedText, nodes);
    const hasExpectedText = screenHasText(nodes, expectedText);
    const expectedTextInEditor = nodes.some((node) => (
      node.className.includes('EditText')
      && screenHasText([node], expectedText)
    ));
    const publishedDetail = detectFacebookPublishedPostDetail(nodes, expectedText, state);
    if ((state.name === 'home' && hasExpectedText && !expectedTextInEditor) || publishedDetail.ok) {
      const screenshot = await captureScreenshot(account, userId, 'facebook_published_post_verified');
      await writeLog(
        userId,
        account._id,
        'info',
        'facebook_published_post_evidence_verified',
        publishedDetail.ok
          ? 'Đã đối chiếu đúng nội dung bài vừa đăng trên màn chi tiết bài viết.'
          : 'Đã đối chiếu đúng nội dung bài vừa đăng trên feed trước khi chụp ảnh xác minh.',
        { attempt, state, detailEvidence: publishedDetail, textPreview: expectedText.slice(0, 80) }
      );
      return { screenshot, verified: true, reason: publishedDetail.ok ? 'published_post_detail_visible' : 'published_text_visible', attempt };
    }

    if (state.name === 'unknown' && !hasExpectedText) {
      await runCommand(env.mobileAutomation.adbPath, [
        '-s',
        target,
        'shell',
        'input',
        'keyevent',
        '4'
      ], { timeoutMs: 4_000 });
      await delay(700);
    } else if (attempt === 4) {
      await launchFacebookWarm(target, defaultPackages.facebook);
    } else if (attempt === 6) {
      const screenBottom = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.bottom) || 0), 1280);
      const screenRight = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.right) || 0), 720);
      await runCommand(env.mobileAutomation.adbPath, [
        '-s',
        target,
        'shell',
        'input',
        'swipe',
        String(Math.round(screenRight * 0.5)),
        String(Math.round(screenBottom * 0.25)),
        String(Math.round(screenRight * 0.5)),
        String(Math.round(screenBottom * 0.7)),
        '450'
      ], { timeoutMs: 8_000 });
    }

    invalidateUiDump(target);
    await delay(attempt < 3 ? 700 : 1_000);
  }

  await writeLog(
    userId,
    account._id,
    'warn',
    'facebook_published_post_evidence_pending',
    uploadInProgress
      ? 'Facebook vẫn đang tải video ở màn hình chính; tiếp tục chờ trước khi xác minh.'
      : 'Bài đã đăng nhưng feed chưa hiển thị đúng nội dung để chụp ảnh xác minh.',
    { textPreview: expectedText.slice(0, 80), uploadInProgress }
  );
  return {
    screenshot: null,
    verified: false,
    uploadInProgress,
    reason: uploadInProgress ? 'background_upload_in_progress' : 'published_text_not_visible'
  };
}

function findPostingProgressNode(nodes) {
  const phrases = postingProgressLabels
    .map(normalizeSearchText)
    .filter((label) => label.length >= 7);
  for (const node of nodes) {
    const values = Array.from(new Set(
      [node.text, node.desc]
        .map(normalizeSearchText)
        .filter(Boolean)
    ));
    const matched = phrases.find((phrase) => {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|\\s)${escapedPhrase}(?=$|[\\s.,:;!?])`);
      return values.some((value) => pattern.test(value));
    });
    if (!matched) continue;
    return {
      ...node.bounds,
      label: node.text || node.desc || matched,
      text: node.text,
      desc: node.desc,
      className: node.className
    };
  }
  return null;
}

async function tapFacebookNextButton(account, userId, target, action, fallbackPoint = null) {
  const nodes = await dumpVisibleNodes(target);
  const match = findNodeInNodes(nodes, facebookComposerNextLabels, { exact: true, preferBottomRight: true });
  const point = match
    ? {
      x: Math.round((match.left + match.right) / 2),
      y: Math.round((match.top + match.bottom) / 2)
    }
    : fallbackPoint;
  if (!point?.x || !point?.y) {
    const screenshot = await captureScreenshot(account, userId, `${action}_missing`);
    await writeLog(userId, account._id, 'error', `${action}_missing`, 'Không tìm thấy nút Tiếp trong Facebook composer.', {
      labels: facebookComposerNextLabels,
      screenshot
    });
    throw new Error('Không tìm thấy nút Tiếp trong Facebook composer.');
  }

  const result = await tapAndLog(userId, account._id, target, action, point);
  await writeLog(
    userId,
    account._id,
    match ? 'info' : 'warn',
    match ? `${action}_by_text` : `${action}_by_point`,
    match ? `Tap nút Tiếp theo UI text "${match.label}".` : 'Không tìm thấy UI text nút Tiếp, dùng tọa độ fallback đã detect từ state.',
    {
      label: match?.label || '',
      bounds: match || null,
      point,
      fallbackPoint
    }
  );
  return { ...result, matchedText: match?.label || '', point };
}

async function attachFacebookImages(account, userId, target, imageCount = 1, text = '', options = {}) {
  const steps = [];
  const count = Math.max(1, Math.min(Number(imageCount) || 1, 4));
  const providedState = options.currentState || null;
  let currentState = ['ready_to_post', 'composer', 'text_editor', 'stale_composer'].includes(providedState?.name)
    ? providedState
    : await waitForFacebookAttachableComposer(account, userId, target, text);
  if (currentState.name === 'text_editor') {
    const done = await tapTextOrPoint(
      account,
      userId,
      target,
      doneLabels,
      { x: 846, y: 72 },
      'facebook_post_close_text_editor_before_gallery',
      { exact: true }
    );
    steps.push(done);
    await delay(postStepDelay(1.5));
    currentState = await waitForFacebookAttachableComposer(account, userId, target, text);
  }
  if (!['ready_to_post', 'composer', 'stale_composer'].includes(currentState.name)) {
    throw new Error(`Facebook chưa ở composer để thêm ảnh (${currentState.name}).`);
  }

  const preGalleryAnr = await recoverSystemUiAnrIfVisible(account, userId, target, 'facebook_post_before_gallery_lookup', steps);
  if (!preGalleryAnr.ok) {
    const screenshot = await captureScreenshot(account, userId, 'facebook_post_before_gallery_system_anr');
    await writeLog(userId, account._id, 'error', 'facebook_post_before_gallery_system_anr', 'System UI che composer trước khi thêm ảnh và không hồi phục được.', {
      recovery: preGalleryAnr,
      screenshot
    });
    throw new Error('System UI của LDPlayer không phản hồi trước khi thêm ảnh.');
  }
  if (preGalleryAnr.recovered) {
    currentState = await waitForFacebookAttachableComposer(account, userId, target, text, 12_000);
    if (!['ready_to_post', 'composer', 'stale_composer'].includes(currentState.name)) {
      throw new Error(`Facebook chưa ổn định lại để thêm ảnh sau System UI ANR (${currentState.name}).`);
    }
  }

  const staleImage = options.preserveExisting
    ? null
    : await findVisibleTextBounds(target, removeImageLabels, { exact: true });
  if (staleImage) {
    const remove = await tapTextOrPoint(
      account,
      userId,
      target,
      removeImageLabels,
      {
        x: Math.round((staleImage.left + staleImage.right) / 2),
        y: Math.round((staleImage.top + staleImage.bottom) / 2)
      },
      'facebook_post_remove_stale_image',
      { exact: true }
    );
    steps.push(remove);
    await delay(postStepDelay(1.25));
  }

  const openGalleryLabels = options.preserveExisting
    ? [...addMorePhotoLabels, ...galleryLabels]
    : galleryLabels;
  const canUseFastComposerMediaFallback = ['ready_to_post', 'composer'].includes(currentState.name)
    && currentState.hasTargetText
    && currentState.nextPoint;
  const galleryMatch = canUseFastComposerMediaFallback
    ? null
    : await waitForAnyText(target, openGalleryLabels, 1_800, { exact: true });
  const canUseComposerMediaFallback = !galleryMatch
    && ['ready_to_post', 'composer'].includes(currentState.name)
    && currentState.hasTargetText
    && currentState.nextPoint;
  if (!galleryMatch && !canUseComposerMediaFallback) {
    const screenshot = await captureScreenshot(account, userId, 'facebook_post_add_media_missing');
    await writeLog(userId, account._id, 'error', 'facebook_post_add_media_missing', 'Không tìm thấy nút thêm file phương tiện trong Facebook composer.', {
      state: currentState,
      labels: openGalleryLabels,
      screenshot
    });
    throw new Error('Không tìm thấy nút thêm file phương tiện trong Facebook composer.');
  }
  const galleryPoint = galleryMatch
    ? {
      x: Math.round((galleryMatch.left + galleryMatch.right) / 2),
      y: Math.round((galleryMatch.top + galleryMatch.bottom) / 2)
    }
    : {
      x: 51,
      y: currentState.nextPoint.y
    };
  const fallbackGalleryPoints = !galleryMatch && canUseComposerMediaFallback
    ? [
      galleryPoint,
      { x: 105, y: galleryPoint.y },
      { x: 160, y: galleryPoint.y },
      { x: 51, y: Math.max(1200, galleryPoint.y - 78) },
      { x: 105, y: Math.max(1200, galleryPoint.y - 78) }
    ]
    : [galleryPoint];
  if (!galleryMatch && canUseComposerMediaFallback) {
    await writeLog(userId, account._id, 'warn', 'facebook_post_add_media_coordinate_fallback', 'Facebook không trả label nút media; dùng tọa độ dưới trái của composer đã xác minh caption.', {
      state: currentState,
      point: galleryPoint,
      fallbackPoints: fallbackGalleryPoints
    });
  }
  let imageMatch = null;
  let galleryNodes = null;
  let shouldTapGallery = true;
  for (let openAttempt = 1; openAttempt <= 5 && !imageMatch; openAttempt += 1) {
    const loopAnr = await recoverSystemUiAnrIfVisible(account, userId, target, `facebook_post_open_gallery_attempt_${openAttempt}`, steps);
    if (!loopAnr.ok) {
      const screenshot = await captureScreenshot(account, userId, 'facebook_post_gallery_system_anr');
      await writeLog(userId, account._id, 'error', 'facebook_post_gallery_system_anr', 'System UI che composer khi chuẩn bị mở thư viện ảnh và không hồi phục được.', {
        openAttempt,
        recovery: loopAnr,
        screenshot
      });
      throw new Error('System UI của LDPlayer không phản hồi khi mở thư viện ảnh.');
    }
    if (loopAnr.recovered) {
      shouldTapGallery = true;
      await delay(postStepDelay(1.5));
    }

    const openPoint = galleryMatch
      ? galleryPoint
      : (fallbackGalleryPoints[Math.min(openAttempt - 1, fallbackGalleryPoints.length - 1)] || galleryPoint);
    if (shouldTapGallery) {
      const gallery = await tapNodeOrPoint(
        account,
        userId,
        target,
        galleryMatch,
        openPoint,
        openAttempt === 1 ? 'facebook_post_open_gallery' : `facebook_post_open_gallery_retry_${openAttempt}`,
        { nodeSource: 'gallery_button' }
      );
      steps.push(gallery);
      await delay(openAttempt === 1 ? 420 : 850);
    }

    let nodesAfterGalleryTap = await dumpVisibleNodes(target);
    galleryNodes = nodesAfterGalleryTap;
    const systemAnr = detectSystemUiAnr(nodesAfterGalleryTap);
    if (systemAnr) {
      const recovered = await recoverSystemUiAnr(account, userId, target, {
        name: 'system_anr',
        reason: 'android_system_ui_not_responding',
        ...systemAnr
      });
      steps.push(recovered);
      if (!recovered.ok) {
        const screenshot = await captureScreenshot(account, userId, 'facebook_post_gallery_system_anr');
        await writeLog(userId, account._id, 'error', 'facebook_post_gallery_system_anr', 'System UI che màn chọn ảnh và không hồi phục được.', {
          systemAnr,
          recovered,
          screenshot
        });
        throw new Error('System UI của LDPlayer không phản hồi khi mở thư viện ảnh.');
      }
      await delay(postStepDelay(2.5));
      const recoveredComposer = await waitForFacebookAttachableComposer(account, userId, target, text, 10_000);
      shouldTapGallery = recoveredComposer.name !== 'gallery_picker';
      if (!['ready_to_post', 'composer', 'stale_composer', 'gallery_picker'].includes(recoveredComposer.name)) {
        await writeLog(userId, account._id, 'warn', 'facebook_post_gallery_anr_recovered_unstable_state', 'System UI đã hồi phục nhưng Facebook chưa quay lại composer/gallery ổn định.', {
          recoveredComposer
        });
      }
      continue;
    }

    if (isFacebookFeelingPicker(nodesAfterGalleryTap)) {
      const back = await keyEventAndLog(userId, account._id, target, 'facebook_post_close_feeling_picker_after_media_tap', '4');
      steps.push(back);
      shouldTapGallery = true;
      await delay(postStepDelay(1.25));
      continue;
    }

    const permission = await findVisibleTextBounds(target, galleryPermissionLabels);
    if (permission) {
      const allow = await tapTextOrPoint(account, userId, target, galleryPermissionLabels, { x: 450, y: 965 }, 'facebook_post_allow_gallery');
      steps.push(allow);
      await delay(1_500);
    }

    const immediateCells = getGalleryImageCells(nodesAfterGalleryTap);
    if (immediateCells.length) {
      imageMatch = immediateCells[0];
    }
    if (!imageMatch) {
      imageMatch = await waitForAnyText(target, selectedImageLabels, openAttempt === 1 ? 1_800 : 2_500);
      if (!imageMatch) {
        nodesAfterGalleryTap = await dumpVisibleNodes(target);
        galleryNodes = nodesAfterGalleryTap;
        const cells = getGalleryImageCells(nodesAfterGalleryTap);
        if (cells.length) {
          imageMatch = cells[0];
        }
      }
    }
    if (!imageMatch && openAttempt < 5) {
      const composerGallery = await findVisibleTextBounds(target, openGalleryLabels, { exact: true });
      const pickerAlreadyOpen = composerGallery && composerGallery.top < 300;
      shouldTapGallery = !pickerAlreadyOpen;
      if (composerGallery && !pickerAlreadyOpen) {
        galleryPoint.x = Math.round((composerGallery.left + composerGallery.right) / 2);
        galleryPoint.y = Math.round((composerGallery.top + composerGallery.bottom) / 2);
      }
    }
  }
  if (!imageMatch) {
    const unexpectedState = await detectFacebookState(target, text);
    const screenshot = await captureScreenshot(account, userId, 'facebook_post_gallery_not_open');
    await writeLog(userId, account._id, 'error', 'facebook_post_gallery_not_open', 'Facebook không chuyển sang màn chọn ảnh.', {
      state: unexpectedState,
      screenshot
    });
    throw new Error('Facebook không mở được thư viện ảnh.');
  }
  const selection = await selectGalleryImagesByAccessibility(account, userId, target, count, {
    initialNodes: galleryNodes,
    fallbackCell: imageMatch
  });
  steps.push(...selection.steps);
  const selectedCount = selection.selectedCount;
  if (selectedCount < count) {
    const screenshot = await captureScreenshot(account, userId, 'facebook_post_gallery_selection_incomplete');
    await writeLog(userId, account._id, 'error', 'facebook_post_gallery_selection_incomplete', 'Facebook chưa ghi nhận đủ ảnh đã chọn.', {
      requestedCount: count,
      selectedCount,
      screenshot
    });
    throw new Error(`Facebook mới ghi nhận ${selectedCount}/${count} ảnh. Đã dừng để tránh bấm lặp.`);
  }

  const galleryNextTimeoutMs = count === 1 ? 3_000 : 8_000;
  const nextMatch = await waitForAnyText(target, galleryNextLabels, galleryNextTimeoutMs, { exact: true, preferBottomRight: true });
  if (!nextMatch) {
    const screenshot = await captureScreenshot(account, userId, 'facebook_post_gallery_confirm_missing');
    await writeLog(userId, account._id, 'error', 'facebook_post_gallery_confirm_missing', 'Không tìm thấy nút xác nhận sau khi chọn ảnh.', {
      screenshot
    });
    throw new Error('Không tìm thấy nút xác nhận chọn ảnh.');
  }
  const next = await tapTextOrPoint(account, userId, target, galleryNextLabels, {
    x: Math.round((nextMatch.left + nextMatch.right) / 2),
    y: Math.round((nextMatch.top + nextMatch.bottom) / 2)
  }, 'facebook_post_gallery_next', { exact: true, preferBottomRight: true });
  steps.push(next);
  await delay(count === 1 ? 450 : 750);

  const attached = await waitForAnyText(target, attachedImageLabels, count === 1 ? 1_800 : 4_000);
  if (!attached) {
    const composerState = await detectFacebookState(target, text);
    if (['ready_to_post', 'stale_composer'].includes(composerState.name) || (composerState.name === 'composer' && composerState.hasAttachedImage)) {
      await writeLog(userId, account._id, 'info', 'facebook_post_image_attached', 'Facebook đã quay lại composer sau khi chọn ảnh.', {
        requestedCount: count,
        method: 'composer_state_fallback',
        state: composerState
      });
      return { steps, attachedCount: count };
    }

    const screenshot = await captureScreenshot(account, userId, 'facebook_post_image_attach_failed');
    await writeLog(userId, account._id, 'error', 'facebook_post_image_attach_failed', 'Không xác nhận được ảnh trong Facebook composer.', {
      screenshot
    });
    throw new Error('Không gắn được ảnh vào Facebook composer. Hãy kiểm tra quyền thư viện trên LDPlayer.');
  }

  await writeLog(userId, account._id, 'info', 'facebook_post_image_attached', 'Đã xác nhận ảnh xuất hiện trong Facebook composer.', {
    requestedCount: count,
    matchedLabel: attached.label,
    bounds: attached
  });
  return { steps, attachedCount: count };
}

async function waitForFacebookAttachableComposer(account, userId, target, text, timeoutMs = 8_000) {
  const startedAt = Date.now();
  let attempt = 0;
  let lastState = null;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    invalidateUiDump(target);
    lastState = await detectFacebookState(target, text);
    if (lastState.name === 'system_anr') {
      const recovered = await recoverSystemUiAnr(account, userId, target, lastState);
      if (!recovered.ok) return lastState;
      await writeLog(userId, account._id, 'warn', 'facebook_post_attach_wait_recovered_system_ui', 'System UI bị treo khi chờ composer thêm ảnh; đã chọn Wait và tiếp tục.', {
        attempt,
        elapsedMs: Date.now() - startedAt,
        recovered
      });
      await delay(postStepDelay(2));
      continue;
    }
    if (['ready_to_post', 'composer', 'text_editor', 'stale_composer'].includes(lastState.name)) {
      if (attempt > 1) {
        await writeLog(userId, account._id, 'info', 'facebook_post_attach_composer_ready_after_wait', 'Facebook composer đã ổn định lại trước khi thêm ảnh.', {
          attempt,
          elapsedMs: Date.now() - startedAt,
          state: lastState
        });
      }
      return lastState;
    }

    if (attempt === 1 || attempt % 4 === 0) {
      await writeLog(userId, account._id, 'info', 'facebook_post_attach_wait_composer', 'Đang chờ Facebook composer ổn định trước khi thêm ảnh.', {
        attempt,
        elapsedMs: Date.now() - startedAt,
        state: lastState
      });
    }
    await delay(attempt < 3 ? 500 : 900);
  }

  return lastState || { name: 'unknown', reason: 'attach_composer_wait_timeout', hasTargetText: false };
}

async function selectGalleryImagesByAccessibility(account, userId, target, count, options = {}) {
  const steps = [];
  let nodes = Array.isArray(options.initialNodes) && options.initialNodes.length
    ? options.initialNodes
    : await dumpVisibleNodes(target);
  let selectedCount = countSelectedGalleryImages(nodes);
  if (selectedCount >= count) return { steps, selectedCount };

  const fallbackCell = normalizeGalleryFallbackCell(options.fallbackCell);
  const baseCells = getGalleryImageCells(nodes);
  if (fallbackCell && !baseCells.some((cell) => boundsOverlap(cell, fallbackCell) >= 0.8)) {
    baseCells.push(fallbackCell);
  }
  const initialCells = baseCells
    .sort((a, b) => (a.top - b.top) || (a.left - b.left))
    .filter((cell) => !cell.selected)
    .slice(0, count - selectedCount);

  if (initialCells.length >= count - selectedCount) {
    for (let index = 0; index < initialCells.length; index += 1) {
      const candidate = initialCells[index];
      const beforeCount = selectedCount + index;
      const selectImage = await tapNodeOrPoint(
        account,
        userId,
        target,
        candidate,
        { x: candidate.x, y: candidate.y },
        `facebook_post_select_image_${beforeCount + 1}`,
        { nodeSource: 'gallery_image_cell' }
      );
      steps.push(selectImage);
      await delay(180);
    }

    if (count === 1) {
      await writeLog(userId, account._id, 'info', 'facebook_post_gallery_single_select_fast_path', 'Đã chọn 1 ảnh bằng fast path; bước xác nhận gallery và composer sẽ kiểm tra tiếp.', {
        requestedCount: count,
        selectedCount: Math.max(1, selectedCount),
        initialCellCount: initialCells.length
      });
      return { steps, selectedCount: Math.max(1, selectedCount), optimistic: true };
    }

    for (let poll = 0; poll < 8; poll += 1) {
      await delay(poll < 3 ? 350 : 550);
      nodes = await dumpVisibleNodes(target);
      selectedCount = countSelectedGalleryImages(nodes);
      if (selectedCount >= count) return { steps, selectedCount };
    }

    await writeLog(userId, account._id, 'warn', 'facebook_post_gallery_batch_select_pending', 'Facebook chưa ghi nhận đủ ảnh sau lượt chọn nhanh; chuyển sang xác nhận từng ảnh còn thiếu.', {
      requestedCount: count,
      selectedCount,
      initialCellCount: initialCells.length
    });
  }

  let attempts = 0;
  while (selectedCount < count && attempts < count * 2) {
    attempts += 1;
    const cells = getGalleryImageCells(nodes);
    const candidate = cells.find((cell) => !cell.selected);
    if (!candidate) break;

    const beforeCount = selectedCount;
    const selectImage = await tapNodeOrPoint(
      account,
      userId,
      target,
      candidate,
      { x: candidate.x, y: candidate.y },
      `facebook_post_select_image_${beforeCount + 1}`,
      { nodeSource: 'gallery_image_cell' }
    );
    steps.push(selectImage);

    let changed = false;
    for (let poll = 0; poll < 4; poll += 1) {
      await delay(250);
      nodes = await dumpVisibleNodes(target);
      selectedCount = countSelectedGalleryImages(nodes);
      if (selectedCount > beforeCount) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      await writeLog(userId, account._id, 'warn', 'facebook_post_gallery_cell_not_selected', 'Facebook chưa ghi nhận node ảnh vừa chọn; chuyển sang node tiếp theo.', {
        attempt: attempts,
        beforeCount,
        candidate
      });
      break;
    }
  }

  return { steps, selectedCount };
}

function getGalleryImageCells(nodes) {
  const labels = selectedImageLabels.map(normalizeSearchText);
  const galleryCells = [];
  for (const node of nodes) {
    const description = normalizeSearchText(`${node.text} ${node.desc}`);
    const width = Math.max(0, (node.bounds?.right || 0) - (node.bounds?.left || 0));
    const height = Math.max(0, (node.bounds?.bottom || 0) - (node.bounds?.top || 0));
    const area = width * height;
    const galleryLikeClass = /(?:Button|ViewGroup|ImageView|FrameLayout|View)$/i.test(node.className || '');
    if (
      !(node.clickable || galleryLikeClass)
      || area < 4_000
      || !labels.some((label) => description.includes(label))
    ) {
      continue;
    }
    const candidate = {
      x: Math.round((node.bounds.left + node.bounds.right) / 2),
      y: Math.round((node.bounds.top + node.bounds.bottom) / 2),
      ...node.bounds,
      selected: isGalleryCellSelected(node),
      label: node.text || node.desc,
      text: node.text,
      desc: node.desc,
      className: node.className,
      resourceId: node.resourceId
    };
    const duplicate = galleryCells.find((cell) => boundsOverlap(cell, candidate) >= 0.8);
    if (duplicate) {
      duplicate.selected = duplicate.selected || candidate.selected;
    } else {
      galleryCells.push(candidate);
    }
  }

  return galleryCells.sort((a, b) => (a.top - b.top) || (a.left - b.left));
}

function normalizeGalleryFallbackCell(match) {
  if (!match || !Number.isFinite(match.left) || !Number.isFinite(match.right) || !Number.isFinite(match.top) || !Number.isFinite(match.bottom)) {
    return null;
  }
  const width = Math.max(0, match.right - match.left);
  const height = Math.max(0, match.bottom - match.top);
  if (width * height < 4_000) return null;
  return {
    ...match,
    x: Math.round((match.left + match.right) / 2),
    y: Math.round((match.top + match.bottom) / 2),
    selected: Boolean(match.selected),
    label: match.label || match.text || match.desc || 'gallery image fallback'
  };
}

function isGalleryCellSelected(node) {
  const label = normalizeSearchText(`${node.text} ${node.desc}`);
  return Boolean(
    node.selected
    || node.checked
    || /\b(da chon|selected|selection)\b/.test(label)
    || /\b(selected|da chon)\s*\d+\b/.test(label)
  );
}

function boundsOverlap(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(
    Math.max(1, (a.right - a.left) * (a.bottom - a.top)),
    Math.max(1, (b.right - b.left) * (b.bottom - b.top))
  );
  return intersection / smallerArea;
}

function countSelectedGalleryImages(nodes) {
  return getGalleryImageCells(nodes).filter((cell) => cell.selected).length;
}

async function detectFacebookState(target, text, existingNodes = null) {
  const nodes = existingNodes || await dumpVisibleNodes(target);
  if (!nodes.length) return { name: 'unknown', reason: 'no_uiautomator_nodes', hasTargetText: false };

  const hasTargetText = screenHasText(nodes, text);
  const textRequired = Boolean(cleanClipboardText(text).trim());
  const systemAnr = detectSystemUiAnr(nodes);
  if (systemAnr) {
    return {
      name: 'system_anr',
      reason: 'android_system_ui_not_responding',
      hasTargetText,
      ...systemAnr
    };
  }
  if (findNodeInNodes(nodes, shareFeedLabels, { exact: true }) && findNodeInNodes(nodes, shareOnceLabels, { exact: true })) {
    return { name: 'share_chooser', reason: 'android_share_target_picker', hasTargetText };
  }
  if (findNodeInNodes(nodes, discardPostLabels, { exact: true })) {
    return { name: 'discard_dialog', reason: 'discard_post_visible', hasTargetText };
  }
  if (findNodeInNodes(nodes, loginBlockLabels)) return { name: 'blocked', reason: 'login_or_checkpoint', hasTargetText };
  if (isFacebookFeelingPicker(nodes)) {
    return {
      name: 'feeling_picker',
      reason: 'feeling_activity_picker_visible',
      hasTargetText
    };
  }
  const metaAiMatches = facebookMetaAiLabels
    .map((label) => findNodeInNodes(nodes, [label], { exact: false }))
    .filter(Boolean);
  if (metaAiMatches.length >= 2) {
    return {
      name: 'meta_ai',
      reason: 'meta_ai_onboarding_or_chat_visible',
      hasTargetText,
      metaAiEvidence: metaAiMatches.slice(0, 5)
    };
  }

  if (isFacebookGalleryPicker(nodes)) {
    return {
      name: 'gallery_picker',
      reason: 'gallery_cells_visible',
      hasTargetText,
      hasAttachedImage: false
    };
  }

  const doneNode = findNodeInNodes(nodes, doneLabels, { exact: true });
  const hasDone = Boolean(doneNode && doneNode.top < 180);
  const hasTextEditor = Boolean(findNodeInNodes(nodes, textEditorLabels));
  if (hasDone || hasTextEditor) return { name: 'text_editor', reason: hasDone ? 'done_visible' : 'text_editor_title', hasTargetText };

  const postTitleNode = findNodeInNodes(nodes, postTitleLabels);
  const hasPostTitle = Boolean(postTitleNode && postTitleNode.top < 180);
  const screenBottom = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.bottom) || 0), 0);
  const screenRight = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.right) || 0), 0);
  const composerActionThreshold = Math.max(500, Math.round(screenBottom * 0.78));
  const composerActionRightThreshold = Math.round(screenRight * 0.65);
  const submitNode = findSemanticSubmitButton(nodes)
    || findNodeInNodes(nodes, submitLabels, { exact: true, preferBottomRight: true });
  const nextNode = findNodeInNodes(nodes, facebookComposerNextLabels, { exact: true, preferBottomRight: true });
  // Feed can expose unrelated "Post/Đăng" buttons near the top. A real
  // composer submit button is either accompanied by the composer title or is
  // positioned in the lower-right action area of the portrait composer.
  const hasSubmit = Boolean(submitNode && (
    hasPostTitle
    || (
      submitNode.bottom >= composerActionThreshold
      && submitNode.right >= composerActionRightThreshold
    )
  ));
  const hasComposerNext = Boolean(nextNode
    && nextNode.bottom >= composerActionThreshold
    && nextNode.right >= composerActionRightThreshold);
  const submitPoint = submitNode
    ? {
      x: Math.round((submitNode.left + submitNode.right) / 2),
      y: Math.round((submitNode.top + submitNode.bottom) / 2)
    }
    : null;
  const nextPoint = nextNode
    ? {
      x: Math.round((nextNode.left + nextNode.right) / 2),
      y: Math.round((nextNode.top + nextNode.bottom) / 2)
    }
    : null;
  const hasAttachedImage = hasFacebookAttachedMediaEvidence(nodes, 'image');
  const observedText = nodes.find((node) => node.className.includes('EditText') && normalizeSearchText(node.text))?.text || '';
  const hasComposerText = Boolean(observedText);
  const captionVerified = hasTargetText ? verifyCompleteCaption(nodes, text).ok : false;
  const composerInputNode = nodes.find((node) => (
    node.className.includes('EditText')
    && node.bounds
    && node.bottom > 180
  )) || findNodeInNodes(nodes, composerLabels);
  const hasComposerInput = Boolean(
    hasPostTitle
    && composerInputNode
  );
  const inputPoint = nodeToPoint(composerInputNode) || { x: 450, y: 300 };
  const publishedDetail = detectFacebookPublishedPostDetail(nodes, text, { hasTargetText });
  if (publishedDetail.ok) {
    return {
      name: 'published_post',
      reason: publishedDetail.reason,
      hasTargetText,
      captionVerified: true,
      hasAttachedImage,
      detailEvidence: publishedDetail
    };
  }
  if (isFacebookOldPostDetail(nodes)) {
    return {
      name: 'old_post_detail',
      reason: 'post_detail_without_expected_text',
      hasTargetText,
      captionVerified: false,
      hasAttachedImage
    };
  }
  if (hasSubmit && (hasAttachedImage || (!textRequired && hasComposerText) || (textRequired && captionVerified))) {
    return {
      name: 'ready_to_post',
      reason: 'submit_visible_without_title',
      hasTargetText,
      captionVerified,
      hasAttachedImage,
      observedText,
      submitPoint,
      nextPoint: hasComposerNext ? nextPoint : null
    };
  }
  if (hasComposerInput && !captionVerified && !hasComposerText) {
    return {
      name: 'text_editor',
      reason: 'post_title_empty_text_input',
      hasTargetText,
      hasAttachedImage,
      observedText,
      inputPoint,
      submitPoint,
      nextPoint: hasComposerNext ? nextPoint : null
    };
  }
  if (hasPostTitle && !captionVerified && (hasAttachedImage || hasComposerText)) {
    return {
      name: 'stale_composer',
      reason: hasAttachedImage ? 'existing_image_draft' : 'existing_text_draft',
      hasTargetText,
      hasAttachedImage,
      observedText
    };
  }
  if ((hasSubmit || hasPostTitle) && (!textRequired || captionVerified)) {
    return {
      name: 'ready_to_post',
      reason: hasSubmit ? 'submit_visible' : 'post_title_with_text',
      hasTargetText,
      captionVerified,
      hasAttachedImage,
      inputPoint: hasComposerInput ? inputPoint : null,
      submitPoint,
      nextPoint: hasComposerNext ? nextPoint : null
    };
  }
  if (hasPostTitle) {
    return {
      name: 'composer',
      reason: 'post_title_visible',
      hasTargetText,
      captionVerified,
      hasAttachedImage,
      submitPoint,
      nextPoint: hasComposerNext ? nextPoint : null
    };
  }

  // Facebook may keep the accessibility label "Close menu" in the composer
  // tree even when no blocking menu is visible. Only treat it as a menu after
  // composer/submit detection has failed.
  const facebookMenuMatches = facebookMenuLabels
    .map((label) => findNodeInNodes(nodes, [label], { exact: true }))
    .filter(Boolean);
  if (findNodeInNodes(nodes, closeMenuLabels) || facebookMenuMatches.length >= 2) {
    return {
      name: 'menu',
      reason: facebookMenuMatches.length >= 2 ? 'facebook_menu_labels_visible' : 'menu_overlay_visible_without_composer',
      hasTargetText,
      menuEvidence: facebookMenuMatches.slice(0, 5)
    };
  }

  if (findNodeInNodes(nodes, composerLabels)) return { name: 'home', reason: 'composer_entry_visible', hasTargetText, hasAttachedImage };
  if (findNodeInNodes(nodes, facebookHomeLabels)) return { name: 'home', reason: 'home_navigation_visible', hasTargetText, hasAttachedImage };

  return { name: 'unknown', reason: 'no_known_labels', hasTargetText, hasAttachedImage };
}

function detectFacebookPublishedPostDetail(nodes = [], text = '', state = {}) {
  const expectedText = cleanClipboardText(text).trim();
  if (!expectedText || !screenHasText(nodes, expectedText)) {
    return { ok: false, reason: 'expected_text_not_visible' };
  }

  const expectedTextInEditor = nodes.some((node) => (
    node.className.includes('EditText')
    && screenHasText([node], expectedText)
  ));
  if (expectedTextInEditor) return { ok: false, reason: 'expected_text_still_in_editor' };

  const hasPostComposerTitle = Boolean(findNodeInNodes(nodes, postTitleLabels));
  if (hasPostComposerTitle || ['ready_to_post', 'composer', 'text_editor', 'stale_composer'].includes(state?.name)) {
    return { ok: false, reason: 'composer_still_visible' };
  }

  const actionMatches = facebookPostActionLabels
    .map((label) => findNodeInNodes(nodes, [label], { exact: true }))
    .filter(Boolean);
  const hasPostActions = actionMatches.length >= 2;
  const hasPostDetailHeader = Boolean(findNodeInNodes(nodes, postDetailLabels));
  const hasProfileHeader = nodes.some((node) => {
    const label = normalizeSearchText(`${node.text} ${node.desc}`);
    return /\b(vua xong|just now|now|phut|minute|min)\b/.test(label);
  });

  if (hasPostActions || hasPostDetailHeader || hasProfileHeader) {
    return {
      ok: true,
      reason: hasPostDetailHeader ? 'post_detail_header_with_expected_text' : (hasPostActions ? 'post_actions_with_expected_text' : 'profile_time_with_expected_text'),
      actionCount: actionMatches.length,
      hasPostDetailHeader,
      hasProfileHeader
    };
  }

  return { ok: false, reason: 'published_post_markers_missing' };
}

function isFacebookOldPostDetail(nodes = []) {
  const hasCommentInput = Boolean(findNodeInNodes(nodes, facebookCommentInputLabels));
  const hasCloseOrSearchHeader = Boolean(
    findNodeInNodes(nodes, ['Tìm kiếm', 'Tim kiem', 'Search'])
    || nodes.some((node) => {
      const label = normalizeSearchText(`${node.text} ${node.desc}`);
      return label === 'dong' || label === 'close';
    })
  );
  const hasComposerTitle = Boolean(findNodeInNodes(nodes, postTitleLabels));
  const hasComposerEntry = Boolean(findNodeInNodes(nodes, composerLabels));
  return hasCommentInput && hasCloseOrSearchHeader && !hasComposerTitle && !hasComposerEntry;
}

function isFacebookGalleryPicker(nodes = []) {
  const hasGalleryHeader = Boolean(
    findNodeInNodes(nodes, ['Chọn album', ...galleryLabels])
    || findNodeInNodes(nodes, postTitleLabels)
  );
  return hasGalleryHeader && getGalleryImageCells(nodes).length > 0;
}

function isFacebookFeelingPicker(nodes = []) {
  const hasHeader = Boolean(findNodeInNodes(nodes, facebookFeelingPickerLabels));
  const tabCount = facebookFeelingPickerTabLabels
    .filter((label) => Boolean(findNodeInNodes(nodes, [label], { exact: true })))
    .length;
  return hasHeader || tabCount >= 2;
}

async function tapAndLog(userId, accountId, target, action, point = {}) {
  const args = ['-s', target, 'shell', 'input', 'tap', String(point.x), String(point.y)];
  let result = await runCommand(env.mobileAutomation.adbPath, args, { timeoutMs: 10_000 });
  const firstError = result.error || result.stderr || '';
  if (!result.ok && isTransientAdbFailure(firstError)) {
    await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
    if (target.includes(':')) {
      await runCommand(env.mobileAutomation.adbPath, ['disconnect', target], { timeoutMs: 10_000 });
      await runCommand(env.mobileAutomation.adbPath, ['connect', target], { timeoutMs: 10_000 });
    }
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await delay(attempt === 1 ? 700 : 1500);
      const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 10_000 });
      if (!state.ok || String(state.stdout || '').trim() !== 'device') continue;
      const retry = await runCommand(env.mobileAutomation.adbPath, args, { timeoutMs: 10_000 });
      result = { ...retry, retried: true, retryAttempt: attempt, firstError };
      if (retry.ok || !isTransientAdbFailure(retry.error || retry.stderr || '')) break;
    }
  }
  invalidateUiDump(target);
  await writeLog(userId, accountId, result.ok ? 'info' : 'error', action, result.ok ? `Tap ${point.x},${point.y}.` : `Tap lỗi ${point.x},${point.y}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || `${action} failed.`);
  await delay(actionDelay(action));
  return result;
}

async function keyEventAndLog(userId, accountId, target, action, keyCode) {
  const result = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'input',
    'keyevent',
    String(keyCode)
  ], { timeoutMs: 10_000 });
  invalidateUiDump(target);
  await writeLog(userId, accountId, result.ok ? 'info' : 'error', action, result.ok ? `Đã gửi phím ${keyCode}.` : `Gửi phím lỗi ${keyCode}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || `${action} failed.`);
  await delay(actionDelay(action));
  return result;
}

function isTransientAdbFailure(message = '') {
  return /device offline|device ['"]?.+['"]? not found|no devices?\/emulators? found|closed|transport error|protocol fault|could not read ok from adb server|failed to start daemon|cannot connect to daemon|command failed/i.test(String(message));
}

async function tapTextOrPoint(account, userId, target, labels, fallbackPoint, action, options = {}) {
  const { nodes, ...matchOptions } = options;
  const match = Array.isArray(nodes)
    ? findNodeInNodes(nodes, labels, matchOptions)
    : await findVisibleTextBounds(target, labels, matchOptions);
  if (match) {
    const point = {
      x: Math.round((match.left + match.right) / 2),
      y: Math.round((match.top + match.bottom) / 2)
    };
    const result = await tapAndLog(userId, account._id, target, action, point);
    await writeLog(userId, account._id, 'info', `${action}_by_text`, `Tap theo text "${match.label}".`, {
      label: match.label,
      bounds: match,
      point
    });
    return { ...result, matchedText: match.label, point };
  }

  const result = await tapAndLog(userId, account._id, target, action, fallbackPoint);
  await writeLog(userId, account._id, 'warn', `${action}_by_point`, 'Không tìm thấy text trong UI, đã dùng tọa độ fallback.', {
    labels,
    fallbackPoint
  });
  return { ...result, point: fallbackPoint };
}

async function tapNodeOrPoint(account, userId, target, node, fallbackPoint, action, options = {}) {
  const point = nodeToPoint(node) || fallbackPoint;
  if (!point?.x || !point?.y) {
    const screenshot = await captureScreenshot(account, userId, `${action}_missing_point`);
    await writeLog(userId, account._id, 'error', `${action}_missing_point`, 'Không có UI node hoặc tọa độ fallback hợp lệ để tap.', {
      node,
      fallbackPoint,
      screenshot
    });
    throw new Error(`Không có điểm tap hợp lệ cho ${action}.`);
  }

  const result = await tapAndLog(userId, account._id, target, action, point);
  const usedNode = Boolean(nodeToPoint(node));
  await writeLog(
    userId,
    account._id,
    usedNode ? 'info' : 'warn',
    usedNode ? `${action}_by_ui_node` : `${action}_by_point`,
    usedNode
      ? `Tap theo UI node${options.nodeSource ? ` (${options.nodeSource})` : ''}.`
      : 'Không có UI node phù hợp, đã dùng tọa độ fallback.',
    {
      source: usedNode ? (options.nodeSource || 'ui_node') : 'fallback_point',
      point,
      bounds: node ? pickNodeBounds(node) : null,
      label: node?.label || node?.text || node?.desc || '',
      className: node?.className || '',
      resourceId: node?.resourceId || '',
      fallbackPoint
    }
  );
  return {
    ...result,
    point,
    source: usedNode ? (options.nodeSource || 'ui_node') : 'fallback_point',
    matchedText: node?.label || node?.text || node?.desc || ''
  };
}

function nodeToPoint(node) {
  if (!node) return null;
  if (Number.isFinite(node.x) && Number.isFinite(node.y)) return { x: Math.round(node.x), y: Math.round(node.y) };
  if (
    Number.isFinite(node.left)
    && Number.isFinite(node.right)
    && Number.isFinite(node.top)
    && Number.isFinite(node.bottom)
  ) {
    return {
      x: Math.round((node.left + node.right) / 2),
      y: Math.round((node.top + node.bottom) / 2)
    };
  }
  if (node.bounds) return nodeToPoint(node.bounds);
  return null;
}

function pickNodeBounds(node) {
  if (!node) return null;
  if (
    Number.isFinite(node.left)
    && Number.isFinite(node.right)
    && Number.isFinite(node.top)
    && Number.isFinite(node.bottom)
  ) {
    return {
      left: node.left,
      top: node.top,
      right: node.right,
      bottom: node.bottom
    };
  }
  if (node.bounds) return pickNodeBounds(node.bounds);
  return null;
}

async function closeFacebookMenuIfOpen(account, userId, target) {
  const match = await findVisibleTextBounds(target, closeMenuLabels);
  if (!match) {
    const auxiliaryMenu = await findVisibleTextBounds(target, auxiliaryMenuLabels);
    if (!auxiliaryMenu) {
      const nodes = await dumpVisibleNodes(target);
      const menuMatches = facebookMenuLabels
        .map((label) => findNodeInNodes(nodes, [label], { exact: true }))
        .filter(Boolean);
      if (menuMatches.length < 2) return false;
      const back = await keyEventAndLog(userId, account._id, target, 'facebook_close_menu_by_back', '4');
      await writeLog(
        userId,
        account._id,
        back.ok ? 'info' : 'warn',
        'facebook_close_menu_by_back_result',
        back.ok ? 'Đã đóng menu Facebook bằng phím Back.' : 'Không đóng được menu Facebook bằng phím Back.',
        {
          ...back,
          menuEvidence: menuMatches.slice(0, 5)
        }
      );
      return back.ok;
    }
    const dismissPoint = { x: Math.max(30, auxiliaryMenu.left - 80), y: Math.min(520, auxiliaryMenu.bottom + 80) };
    const dismiss = await tapAndLog(userId, account._id, target, 'facebook_close_auxiliary_menu', dismissPoint);
    await writeLog(userId, account._id, dismiss.ok ? 'info' : 'warn', 'facebook_close_auxiliary_menu_by_point', dismiss.ok ? 'Đã đóng menu phụ của Facebook.' : 'Không đóng được menu phụ của Facebook.', {
      ...dismiss,
      point: dismissPoint,
      matchedLabel: auxiliaryMenu.label
    });
    return dismiss.ok;
  }

  const point = {
    x: Math.round((match.left + match.right) / 2),
    y: Math.round((match.top + match.bottom) / 2)
  };
  await tapAndLog(userId, account._id, target, 'facebook_close_menu', point);
  await writeLog(userId, account._id, 'info', 'facebook_close_menu_by_text', `Đã đóng menu Facebook bằng text "${match.label}".`, {
    label: match.label,
    bounds: match,
    point
  });
  return true;
}

async function findVisibleTextBounds(target, labels, options = {}) {
  const nodes = await dumpVisibleNodes(target);
  return findNodeInNodes(nodes, labels, options);
}

async function dumpVisibleNodes(target) {
  if (env.mobileAutomation.commandMock) return dumpVisibleNodesUncached(target);

  const cached = uiDumpCache.get(target);
  if (cached && Date.now() - cached.createdAt <= uiDumpCacheTtlMs) return cached.nodes;
  const inFlight = uiDumpInFlight.get(target);
  if (inFlight) return inFlight;

  const task = dumpVisibleNodesUncached(target)
    .then((nodes) => {
      uiDumpCache.set(target, { createdAt: Date.now(), nodes });
      return nodes;
    })
    .finally(() => {
      uiDumpInFlight.delete(target);
    });
  uiDumpInFlight.set(target, task);
  return task;
}

async function waitForVisibleNodes(target, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 3);
  const delayMs = Math.max(100, Number(options.delayMs) || 700);
  let nodes = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      invalidateUiDump(target);
      await delay(delayMs);
    }
    nodes = await dumpVisibleNodes(target);
    if (nodes.length) return nodes;
  }
  return nodes;
}

async function dumpVisibleNodesUncached(target) {
  if (directUiDumpSupport.get(target) !== false) {
    const direct = await runCommand(
      env.mobileAutomation.adbPath,
      ['-s', target, 'exec-out', 'uiautomator', 'dump', '--compressed', '/dev/tty'],
      { timeoutMs: 3_000, maxBuffer: 2 * 1024 * 1024 }
    );
    const directNodes = direct.ok ? parseVisibleNodes(`${direct.stdout}\n${direct.stderr}`) : [];
    if (directNodes.length) {
      directUiDumpSupport.set(target, true);
      return directNodes;
    }
    directUiDumpSupport.set(target, false);
  }

  const dumpArgs = ['-s', target, 'shell', 'uiautomator', 'dump', '--compressed', '/sdcard/window.xml'];
  let dump = await runCommand(env.mobileAutomation.adbPath, dumpArgs, {
    timeoutMs: 6_000
  });
  if (!dump.ok && target.includes(':')) {
    await runCommand(env.mobileAutomation.adbPath, ['connect', target]);
    await delay(600);
    dump = await runCommand(env.mobileAutomation.adbPath, dumpArgs, { timeoutMs: 6_000 });
  }
  if (!dump.ok) return [];

  const xmlArgs = ['-s', target, 'shell', 'cat', '/sdcard/window.xml'];
  let xml = await runCommand(env.mobileAutomation.adbPath, xmlArgs, {
    timeoutMs: 5_000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (!xml.ok && target.includes(':')) {
    await runCommand(env.mobileAutomation.adbPath, ['connect', target]);
    await delay(600);
    xml = await runCommand(env.mobileAutomation.adbPath, xmlArgs, {
      timeoutMs: 5_000,
      maxBuffer: 2 * 1024 * 1024
    });
  }
  if (!xml.ok || !xml.stdout) return [];

  return parseVisibleNodes(xml.stdout);
}

function invalidateUiDump(target) {
  uiDumpCache.delete(target);
}

function detectSystemUiAnr(nodes) {
  const dialog = findNodeInNodes(nodes, systemAnrLabels);
  if (!dialog) return null;
  const wait = findNodeInNodes(nodes, systemAnrWaitLabels, { exact: true });
  const close = findNodeInNodes(nodes, systemAnrCloseLabels, { exact: true });
  const dialogText = `${dialog.text || ''} ${dialog.desc || ''} ${dialog.label || ''}`;
  const systemUiDialog = /system ui|giao dien he thong|giao diện hệ thống/i.test(normalizeSearchText(dialogText));
  const dialogFallbackWaitPoint = dialog
    ? {
      x: Math.round(dialog.left + ((dialog.right - dialog.left) * 0.28)),
      y: Math.round(dialog.top + ((dialog.bottom - dialog.top) * 0.74))
    }
    : null;
  const dialogFallbackClosePoint = dialog
    ? {
      x: Math.round(dialog.left + ((dialog.right - dialog.left) * 0.28)),
      y: Math.round(dialog.top + ((dialog.bottom - dialog.top) * 0.48))
    }
    : null;
  return {
    dialog,
    systemUiDialog,
    closePoint: close
      ? {
        x: Math.round((close.left + close.right) / 2),
        y: Math.round((close.top + close.bottom) / 2)
      }
      : dialogFallbackClosePoint,
    closePointSource: close ? 'close_label' : (dialogFallbackClosePoint ? 'dialog_geometry' : ''),
    waitPoint: wait
      ? {
        x: Math.round((wait.left + wait.right) / 2),
        y: Math.round((wait.top + wait.bottom) / 2)
      }
      : dialogFallbackWaitPoint,
    waitPointSource: wait ? 'wait_label' : (dialogFallbackWaitPoint ? 'dialog_geometry' : '')
  };
}

async function recoverSystemUiAnrIfVisible(account, userId, target, phase = 'system_ui_anr_probe', steps = null) {
  invalidateUiDump(target);
  const nodes = await dumpVisibleNodes(target);
  const systemAnr = detectSystemUiAnr(nodes);
  if (!systemAnr) return { ok: true, recovered: false, nodesCount: nodes.length };

  const recovered = await recoverSystemUiAnr(account, userId, target, {
    name: 'system_anr',
    reason: 'android_system_ui_not_responding',
    phase,
    ...systemAnr
  });
  if (Array.isArray(steps)) steps.push(recovered);
  await writeLog(
    userId,
    account._id,
    recovered.ok ? 'warn' : 'error',
    recovered.ok ? `${phase}_recovered` : `${phase}_failed`,
    recovered.ok
      ? 'System UI ANR đang che Facebook; đã chọn Wait và sẽ thử lại bước hiện tại.'
      : 'System UI ANR đang che Facebook nhưng chưa phục hồi được.',
    { phase, systemAnr, recovered }
  );
  invalidateUiDump(target);
  return {
    ok: Boolean(recovered.ok),
    recovered: Boolean(recovered.ok),
    systemAnr,
    recovery: recovered,
    nodesCount: nodes.length,
    error: recovered.error || ''
  };
}

async function recoverSystemUiAnr(account, userId, target, state = {}) {
  let directRecovery = null;
  const shouldCloseApp = state.systemUiDialog === false && state.closePoint?.x && state.closePoint?.y;
  const recoveryPoint = shouldCloseApp ? state.closePoint : state.waitPoint;
  if (recoveryPoint?.x && recoveryPoint?.y) {
    directRecovery = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'input',
      'tap',
      String(recoveryPoint.x),
      String(recoveryPoint.y)
    ], { timeoutMs: 4_000 });
  }
  const keyboardRecovery = directRecovery?.ok
    ? { ok: true, method: shouldCloseApp ? 'direct_close_app_tap' : 'direct_wait_tap', directRecovery }
    : await selectSystemUiWaitByKeyboard(target);
  invalidateUiDump(target);
  await writeLog(
    userId,
    account._id,
    keyboardRecovery.ok ? 'warn' : 'error',
    'system_ui_anr_recovery',
    keyboardRecovery.ok
      ? (shouldCloseApp ? 'Ứng dụng Android khác đang không phản hồi; tool đã chọn Close app để dọn hộp thoại che Facebook.' : 'System UI không phản hồi; tool đã chọn Wait và tạm dừng để hệ thống hồi phục.')
      : 'Không xử lý được hộp thoại ứng dụng/System UI không phản hồi.',
    { keyboardRecovery, directRecovery, dialog: state.dialog, waitPoint: state.waitPoint, closePoint: state.closePoint, shouldCloseApp }
  );
  if (!keyboardRecovery.ok) {
    return {
      ok: false,
      keyboardRecovery,
      error: keyboardRecovery.confirm?.error || keyboardRecovery.selectWait?.error || 'Không chọn được Wait trên hộp thoại ANR.'
    };
  }

  // Do not call UIAutomator while System UI is recovering. dumpsys window is
  // considerably lighter and prevents the recovery check from causing another ANR.
  const health = await waitForSystemUiHealthy(account, userId, target, {
    phase: 'anr_recovery',
    initialDelayMs: 2500,
    stableChecks: 3,
    maxAttempts: 8
  });
  invalidateUiDump(target);
  return {
    ...health,
    keyboardRecovery
  };
}

async function selectSystemUiWaitByKeyboard(target) {
  // Android's ANR dialog orders "Close app" above "Wait".
  // DPAD_DOWN + ENTER is independent from emulator resolution and works even
  // while UIAutomator cannot dump the frozen System UI hierarchy.
  const selectWait = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'input',
    'keyevent',
    '20'
  ], { timeoutMs: 4_000 });
  const confirm = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'input',
    'keyevent',
    '66'
  ], { timeoutMs: 4_000 });
  return {
    ok: selectWait.ok && confirm.ok,
    selectWait,
    confirm
  };
}

function parseVisibleNodes(xml = '') {
  return (String(xml).match(/<node\b[^>]*>/g) || [])
    .map((node) => ({
      raw: node,
      text: readXmlAttr(node, 'text'),
      desc: readXmlAttr(node, 'content-desc'),
      resourceId: readXmlAttr(node, 'resource-id'),
      className: readXmlAttr(node, 'class'),
      clickable: readXmlAttr(node, 'clickable') === 'true',
      enabled: readXmlAttr(node, 'enabled') !== 'false',
      checked: readXmlAttr(node, 'checked') === 'true',
      selected: readXmlAttr(node, 'selected') === 'true',
      bounds: readBounds(node)
    }))
    .filter((node) => node.bounds);
}

function findNodeInNodes(nodes, labels, options = {}) {
  for (const label of labels) {
    const normalizedLabel = normalizeSearchText(label);
    const matches = [];
    for (const node of nodes) {
      const normalizedText = normalizeSearchText(node.text);
      const normalizedDesc = normalizeSearchText(node.desc);
      const normalizedResourceId = normalizeSearchText(node.resourceId);
      const haystack = normalizeSearchText(`${node.text} ${node.desc} ${node.resourceId}`);
      if (!haystack) continue;
      const matched = options.exact
        ? normalizedText === normalizedLabel || normalizedDesc === normalizedLabel || normalizedResourceId === normalizedLabel || haystack === normalizedLabel
        : haystack.includes(normalizedLabel);
      if (!matched) continue;

      const match = { ...node.bounds, label, text: node.text, desc: node.desc, resourceId: node.resourceId, className: node.className };
      match.enabled = node.enabled;
      match.clickable = node.clickable;
      if (!options.preferBottomRight) return match;
      matches.push(match);
    }
    if (matches.length) {
      return matches.sort((a, b) => (b.bottom - a.bottom) || (b.right - a.right) || (a.left - b.left))[0];
    }
  }

  return null;
}

function screenHasText(nodes, text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return false;
  const compactNeedle = normalized.replace(/\s+/g, '');
  const lineSnippets = normalized
    .split(/\s*#|\n|\r/)
    .map((item) => item.trim())
    .filter(Boolean);
  const snippets = [
    normalized,
    normalized.slice(0, 40).trim(),
    compactNeedle.slice(0, 40),
    ...lineSnippets
  ].filter((item) => item.length >= Math.min(3, normalized.length));
  const haystack = nodes
    .map((node) => normalizeSearchText(`${node.text} ${node.desc}`))
    .join(' ');
  const compactHaystack = haystack.replace(/\s+/g, '');
  return snippets.some((snippet) => haystack.includes(snippet) || compactHaystack.includes(snippet.replace(/\s+/g, '')));
}

function isComposerPlaceholderText(value = '') {
  const normalized = normalizeSearchText(value);
  return Boolean(normalized && composerLabels.some((label) => normalizeSearchText(label) === normalized));
}

function verifyCompleteCaption(nodes, text) {
  const expected = cleanClipboardText(text).trim();
  if (!expected) return { ok: true, missingText: [], missingHashtags: [], missingEmoji: [], rawTextMatches: true };

  const rawHaystack = nodes
    .map((node) => `${node.text || ''} ${node.desc || ''}`)
    .join(' ')
    .normalize('NFC');
  const normalizedHaystack = normalizeSearchText(rawHaystack);
  const compactHaystack = normalizedHaystack.replace(/\s+/g, '');

  const hashtags = Array.from(new Set(expected.match(/#[\p{L}\p{N}_]+/gu) || []));
  const emoji = Array.from(new Set(expected.match(/\p{Extended_Pictographic}\uFE0F?/gu) || []));
  const plainText = expected
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, ' ')
    .replace(/\uFE0F/g, ' ');
  const textParts = normalizeSearchText(plainText)
    .split(/\s*\n+\s*| {2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const actualHashtags = Array.from(new Set(
    (rawHaystack.match(/#[\p{L}\p{N}_]+/gu) || [])
      .map((hashtag) => normalizeSearchText(hashtag).replace(/\s+/g, ''))
      .filter(Boolean)
  ));
  const missingHashtags = hashtags.filter((hashtag) => {
    const normalized = normalizeSearchText(hashtag).replace(/\s+/g, '');
    return normalized && !actualHashtags.includes(normalized);
  });
  const conflictingHashtags = hashtags.flatMap((hashtag) => {
    const normalized = normalizeSearchText(hashtag).replace(/\s+/g, '');
    return actualHashtags.filter((actual) => actual !== normalized && actual.startsWith(normalized));
  });
  const haystackWithoutVariationSelectors = rawHaystack.replace(/\uFE0F/g, '');
  const missingEmoji = emoji.filter((item) => !haystackWithoutVariationSelectors.includes(item.replace(/\uFE0F/g, '')));
  const missingText = textParts.filter((part) => {
    const compactPart = part.replace(/\s+/g, '');
    return !normalizedHaystack.includes(part) && !compactHaystack.includes(compactPart);
  });
  const rawTextMatches = captionRawTextMatches(rawHaystack, expected);
  const hasEncodingDamage = captionHasEncodingDamage(nodes, expected);
  const editorTextCheck = captionEditorTextMatches(nodes, expected);
  const effectiveMissingText = rawTextMatches ? [] : missingText;

  return {
    ok: effectiveMissingText.length === 0
      && missingHashtags.length === 0
      && missingEmoji.length === 0
      && conflictingHashtags.length === 0
      && rawTextMatches
      && !hasEncodingDamage
      && editorTextCheck.ok,
    missingText: effectiveMissingText,
    rawMissingText: missingText,
    missingHashtags,
    missingEmoji,
    conflictingHashtags,
    actualHashtags,
    expectedHashtagCount: hashtags.length,
    expectedEmojiCount: emoji.length,
    rawTextMatches,
    hasEncodingDamage,
    editorTextCheck
  };
}

function captionEditorTextMatches(nodes = [], expected = '') {
  const normalizedExpected = normalizeSearchText(cleanClipboardText(expected));
  if (!normalizedExpected) return { ok: true, reason: 'empty_expected' };
  const editorTexts = nodes
    .filter((node) => String(node.className || '').includes('EditText'))
    .map((node) => normalizeSearchText(node.text || node.desc || ''))
    .filter(Boolean)
    .filter((value) => !isComposerPlaceholderText(value));
  const matchingEditor = editorTexts.find((value) => value.includes(normalizedExpected));
  if (!matchingEditor) return { ok: true, reason: 'expected_not_in_editor', editorTexts };
  return {
    ok: matchingEditor === normalizedExpected,
    reason: matchingEditor === normalizedExpected ? 'exact_editor_text' : 'editor_has_extra_text',
    editorTexts
  };
}

function captionHasEncodingDamage(nodes = [], expected = '') {
  if (!hasUnicodeText(expected)) return false;
  const expectedNormalized = normalizeSearchText(expected);
  if (!expectedNormalized) return false;

  return nodes.some((node) => {
    const value = `${node.text || ''} ${node.desc || ''}`.trim();
    if (!value || !/[�]/.test(value)) return false;
    const normalized = normalizeSearchText(value);
    return normalized.includes(expectedNormalized.slice(0, Math.min(18, expectedNormalized.length)))
      || normalized.includes('#canarytest')
      || normalized.includes('emoji')
      || normalized.includes('canary review');
  });
}

function captionRawTextMatches(rawHaystack = '', expected = '') {
  const meaningfulParts = cleanClipboardText(expected)
    .normalize('NFC')
    .split(/\s*\n+\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/\s+/g, ' '));
  if (!meaningfulParts.length) return true;

  const normalizedHaystack = String(rawHaystack || '')
    .normalize('NFC')
    .replace(/\uFE0F/g, '')
    .replace(/\s+/g, ' ');

  return meaningfulParts.every((part) => {
    const withoutVariationSelectors = part.replace(/\uFE0F/g, '');
    return normalizedHaystack.includes(withoutVariationSelectors);
  });
}

async function waitForAnyText(target, labels, timeoutMs = 5000, options = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const match = await findVisibleTextBounds(target, labels, options);
    if (match) return match;
    await delay(600);
  }
  return null;
}

function readXmlAttr(node, attr) {
  const match = node.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return decodeXmlEntities(match?.[1] || '');
}

function decodeXmlEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readBounds(node) {
  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) return null;
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4])
  };
}

function normalizeSearchText(value = '') {
  return normalizeAdbInputText(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

async function inputAndLog(userId, accountId, target, action, text, sensitive = false, options = {}) {
  const result = await inputDeviceText(target, text, { sensitive, ...options });
  await writeLog(userId, accountId, result.ok ? 'info' : 'error', action, result.ok ? (sensitive ? 'Đã nhập mật khẩu.' : 'Đã nhập tài khoản.') : 'Nhập liệu lỗi.', {
    ...result,
    args: sensitive ? ['-s', target, 'shell', result.method || 'input_text', '***'] : result.args
  });
  if (!result.ok) throw new Error(result.error || result.stderr || `${action} failed.`);
  await delay(actionDelay(action));
  return result;
}

async function inputDeviceText(target, text, options = {}) {
  const value = cleanClipboardText(text);
  const shouldUseUnicodePath = hasUnicodeText(value) || value.includes('\n');
  const inputMode = options.sensitive ? 'stable' : (options.inputMode === 'natural' ? 'natural' : 'stable');

  if (inputMode === 'natural') {
    const natural = await inputWithAdbKeyboard(target, value, { mode: 'natural' });
    if (natural.ok) return natural;
  }

  if (shouldUseUnicodePath) {
    const unicodeResult = await inputUnicodeText(target, value, options);
    if (unicodeResult.ok) return unicodeResult;
  }

  const pasteResult = await inputWithClipboardPaste(target, value);
  if (pasteResult.ok) return { ...pasteResult, method: 'clipboard_paste_ascii_first' };

  const fallback = await runAdbInputTextWithRetry(target, cleanText(value));
  return {
    ...fallback,
    method: shouldUseUnicodePath ? 'input_text_ascii_fallback' : 'input_text',
    unicodeFallback: shouldUseUnicodePath
  };
}

async function runAdbInputTextWithRetry(target, text) {
  const args = ['-s', target, 'shell', 'input', 'text', text];
  let result = await runCommand(env.mobileAutomation.adbPath, args);
  const firstError = result.error || result.stderr || '';
  if (!result.ok && isTransientAdbFailure(firstError)) {
    await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await delay(attempt === 1 ? 700 : 1500);
      const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 10_000 });
      if (!state.ok || String(state.stdout || '').trim() !== 'device') continue;
      const retry = await runCommand(env.mobileAutomation.adbPath, args);
      result = { ...retry, retried: true, retryAttempt: attempt, firstError };
      if (retry.ok || !isTransientAdbFailure(retry.error || retry.stderr || '')) break;
    }
  }
  return result;
}

async function clearFocusedTextWithDeleteKey(target, count = 80) {
  await runAdbKeyEventWithRetry(target, '123');
  let lastResult = { ok: true };
  for (let index = 0; index < count; index += 1) {
    lastResult = await runAdbKeyEventWithRetry(target, '67');
    if (!lastResult.ok) break;
    if (index % 20 === 19) await delay(80);
  }
  invalidateUiDump(target);
  return {
    ...lastResult,
    ok: Boolean(lastResult.ok),
    method: 'keyevent_delete_clear',
    deleteCount: count
  };
}

async function runAdbKeyEventWithRetry(target, keyCode) {
  const args = ['-s', target, 'shell', 'input', 'keyevent', String(keyCode)];
  let result = await runCommand(env.mobileAutomation.adbPath, args, { timeoutMs: 5_000 });
  const firstError = result.error || result.stderr || '';
  if (!result.ok && isTransientAdbFailure(firstError)) {
    await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await delay(attempt === 1 ? 700 : 1500);
      const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 10_000 });
      if (!state.ok || String(state.stdout || '').trim() !== 'device') continue;
      const retry = await runCommand(env.mobileAutomation.adbPath, args, { timeoutMs: 5_000 });
      result = { ...retry, retried: true, retryAttempt: attempt, firstError };
      if (retry.ok || !isTransientAdbFailure(retry.error || retry.stderr || '')) break;
    }
  }
  return result;
}

async function inputUnicodeText(target, text, options = {}) {
  const clipboard = await inputWithClipboardPaste(target, text);
  if (clipboard.ok) return clipboard;

  const adbKeyboard = await inputWithAdbKeyboard(target, text);
  if (adbKeyboard.ok) return adbKeyboard;

  const clipper = await inputWithClipperBroadcast(target, text);
  if (clipper.ok) return clipper;

  return {
    ok: false,
    command: env.mobileAutomation.adbPath,
    args: ['-s', target, 'shell', 'unicode_input'],
    method: 'unicode_input_failed',
    stdout: '',
    stderr: [adbKeyboard.error || adbKeyboard.stderr, clipboard.error || clipboard.stderr, clipper.error || clipper.stderr].filter(Boolean).join(' | '),
    error: options.sensitive ? 'Unicode input failed.' : 'Không nhập được text Unicode qua ADB. Cài ADB Keyboard hoặc bật clipboard paste trong giả lập để giữ dấu tiếng Việt.'
  };
}

async function replaceFocusedText(target, text, options = {}) {
  const inputTimeoutMs = getTextInputTimeoutMs(text);
  const inputMode = options.inputMode === 'natural' ? 'natural' : 'stable';
  const list = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'list', '-a'], { timeoutMs: 10_000 });
  if (!list.ok || !list.stdout.includes('com.android.adbkeyboard/.AdbIME')) {
    return replaceFocusedTextWithoutAdbKeyboard(target, text, {
      reason: 'adb_keyboard_missing',
      previous: list
    });
  }

  const current = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'settings', 'get', 'secure', 'default_input_method'], { timeoutMs: 10_000 });
  const previousIme = current.ok && current.stdout && current.stdout !== 'com.android.adbkeyboard/.AdbIME'
    ? current.stdout.trim()
    : 'com.android.inputmethod.pinyin/.InputService';
  const setIme = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME'], { timeoutMs: 10_000 });
  if (!setIme.ok) {
    return replaceFocusedTextWithoutAdbKeyboard(target, text, {
      reason: 'adb_keyboard_set_ime_failed',
      previous: setIme
    });
  }

  let clear = { ok: false };
  let hardClear = { ok: true, skipped: true };
  let input = { ok: false };
  try {
    clear = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_CLEAR_TEXT'], { timeoutMs: 3_000 });
    const clearSent = clear.ok || /Broadcasting:\s+Intent/i.test(`${clear.stdout || ''}\n${clear.stderr || ''}`);
    hardClear = await clearFocusedTextWithDeleteKey(target, Math.min(600, Math.max(180, cleanClipboardText(text).length + 220)));
    const payload = Buffer.from(cleanClipboardText(text), 'utf8').toString('base64');
    if (clearSent && hardClear.ok && inputMode === 'natural') {
      input = await sendAdbKeyboardTextChunks(target, cleanClipboardText(text), { timeoutMs: inputTimeoutMs });
    } else {
      input = clearSent && hardClear.ok
        ? await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', payload], { timeoutMs: inputTimeoutMs })
        : (hardClear.ok ? clear : hardClear);
    }
  } finally {
    await restoreInputMethod(target, previousIme);
  }

  return {
    ...input,
    method: input.method === 'adb_keyboard_natural' ? 'adb_keyboard_replace_natural' : 'adb_keyboard_replace',
    clearOk: clear.ok,
    clearSent: clear.ok || /Broadcasting:\s+Intent/i.test(`${clear.stdout || ''}\n${clear.stderr || ''}`),
    clearError: clear.ok ? '' : (clear.error || clear.stderr || ''),
    hardClearOk: hardClear.ok,
    hardClearMethod: hardClear.method || '',
    hardClearDeleteCount: hardClear.deleteCount || 0
  };
}

async function replaceFocusedTextWithoutAdbKeyboard(target, text, options = {}) {
  const value = cleanClipboardText(text);
  const clearCount = Math.min(5000, Math.max(120, value.length + 80));
  const clear = await clearFocusedTextWithDeleteKey(target, clearCount);
  if (!clear.ok) {
    return {
      ...clear,
      ok: false,
      method: 'replace_without_adb_keyboard_clear_failed',
      reason: options.reason || '',
      previous: options.previous || null
    };
  }

  const input = await inputDeviceText(target, value, { inputMode: 'stable' });
  return {
    ...input,
    ok: Boolean(input.ok),
    method: input.ok ? `replace_without_adb_keyboard_${input.method || 'input'}` : 'replace_without_adb_keyboard_input_failed',
    reason: options.reason || '',
    previous: options.previous || null,
    clearOk: clear.ok,
    clearMethod: clear.method,
    clearCount
  };
}

async function inputWithAdbKeyboard(target, text, options = {}) {
  const inputTimeoutMs = getTextInputTimeoutMs(text);
  const list = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'list', '-a'], { timeoutMs: 10_000 });
  if (!list.ok || !list.stdout.includes('com.android.adbkeyboard/.AdbIME')) {
    return { ok: false, method: 'adb_keyboard', error: 'ADB Keyboard is not installed.' };
  }

  const current = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'settings', 'get', 'secure', 'default_input_method'], { timeoutMs: 10_000 });
  const previousIme = current.ok && current.stdout && current.stdout !== 'com.android.adbkeyboard/.AdbIME'
    ? current.stdout.trim()
    : 'com.android.inputmethod.pinyin/.InputService';
  const setIme = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME'], { timeoutMs: 10_000 });
  if (!setIme.ok) return { ...setIme, method: 'adb_keyboard_set_ime' };

  let broadcast;
  try {
    if (options.mode === 'natural') {
      broadcast = await sendAdbKeyboardTextChunks(target, text, { timeoutMs: inputTimeoutMs });
    } else {
      const payload = Buffer.from(text, 'utf8').toString('base64');
      broadcast = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', payload], { timeoutMs: inputTimeoutMs });
    }
  } finally {
    await restoreInputMethod(target, previousIme);
  }

  return { ...broadcast, method: broadcast.method || 'adb_keyboard' };
}

async function sendAdbKeyboardTextChunks(target, text, options = {}) {
  const chunks = splitTextForNaturalInput(cleanClipboardText(text));
  const timeoutMs = Math.max(10_000, Number(options.timeoutMs) || getTextInputTimeoutMs(text));
  const results = [];
  const startedAt = Date.now();

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const payload = Buffer.from(chunk, 'utf8').toString('base64');
    const result = await runCommand(
      env.mobileAutomation.adbPath,
      ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', payload],
      { timeoutMs: Math.min(timeoutMs, 12_000) }
    );
    results.push({
      ok: result.ok,
      durationMs: result.durationMs,
      chunkLength: chunk.length,
      error: result.error || result.stderr || ''
    });
    if (!result.ok) {
      return {
        ...result,
        ok: false,
        method: 'adb_keyboard_natural',
        chunkIndex: index,
        chunkCount: chunks.length,
        chunks: results
      };
    }
    const delayMs = getNaturalInputDelayMs(chunk, index, chunks.length);
    if (delayMs > 0) await delay(delayMs);
  }

  return {
    ok: true,
    command: env.mobileAutomation.adbPath,
    args: ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', '***'],
    stdout: '',
    stderr: '',
    method: 'adb_keyboard_natural',
    chunkCount: chunks.length,
    charCount: cleanClipboardText(text).length,
    chunks: results,
    durationMs: Date.now() - startedAt
  };
}

function splitTextForNaturalInput(text = '') {
  const value = cleanClipboardText(text);
  if (!value) return [''];
  const maxChunkLength = value.length > 1200 ? 90 : 48;
  const chunks = [];
  let current = '';

  for (const token of value.split(/(\s+)/)) {
    if (!token) continue;
    const next = `${current}${token}`;
    if (current && next.length > maxChunkLength) {
      chunks.push(current);
      current = token;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChunkLength * 1.5) return [chunk];
    const parts = [];
    for (let index = 0; index < chunk.length; index += maxChunkLength) {
      parts.push(chunk.slice(index, index + maxChunkLength));
    }
    return parts;
  });
}

function getNaturalInputDelayMs(chunk = '', index = 0, total = 1) {
  if (index >= total - 1) return 0;
  const base = chunk.includes('\n') ? 520 : 240;
  const lengthDelay = Math.min(420, chunk.length * 7);
  return base + lengthDelay;
}

async function restoreInputMethod(target, ime, options = {}) {
  if (!ime || ime === 'com.android.adbkeyboard/.AdbIME') return null;
  const restored = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', ime], { timeoutMs: 10_000 });
  if (options.dismissKeyboard) {
    await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '4'], { timeoutMs: 3_000 });
  }
  return restored;
}

async function inputWithClipboardPaste(target, text) {
  const inputTimeoutMs = getTextInputTimeoutMs(text);
  const setClipboard = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'cmd', 'clipboard', 'set', 'SocialPilot AI', text], { timeoutMs: inputTimeoutMs });
  const clipboardOutput = `${setClipboard.stdout || ''}\n${setClipboard.stderr || ''}`;
  if (!setClipboard.ok || /No shell command implementation|Unknown command|Can't find service|not found/i.test(clipboardOutput)) {
    return {
      ...setClipboard,
      ok: false,
      method: 'clipboard_set',
      error: setClipboard.error || setClipboard.stderr || setClipboard.stdout || 'Clipboard set is not supported.'
    };
  }

  const pasteKey = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '279'], { timeoutMs: inputTimeoutMs });
  if (pasteKey.ok) return { ...pasteKey, method: 'clipboard_paste' };

  const ctrlV = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keycombination', '113', '50'], { timeoutMs: inputTimeoutMs });
  return { ...ctrlV, method: 'clipboard_ctrl_v' };
}

async function inputWithClipperBroadcast(target, text) {
  const inputTimeoutMs = getTextInputTimeoutMs(text);
  const setClipper = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'clipper.set', '-e', 'text', text], { timeoutMs: inputTimeoutMs });
  if (!setClipper.ok || /Broadcast completed: result=0/i.test(setClipper.stdout)) {
    return { ...setClipper, ok: false, method: 'clipper_set', error: setClipper.error || setClipper.stderr || 'Clipper broadcast was not handled.' };
  }

  const pasteKey = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '279'], { timeoutMs: inputTimeoutMs });
  return { ...pasteKey, method: 'clipper_paste' };
}

function getTextInputTimeoutMs(text = '') {
  const length = cleanClipboardText(text).length;
  return Math.min(45_000, Math.max(10_000, 8_000 + (length * 8)));
}
