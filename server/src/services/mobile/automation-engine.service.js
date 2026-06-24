import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { getLocalUploadPath } from '../../utils/media-file.js';
import { runBinaryCommand, runCommand, runDetachedCommand } from './mobile-command.service.js';
import { decryptSecret } from './mobile-secret.service.js';
import { writeMobileLog as writeLog } from './mobile-log.service.js';

const localImageHashCache = new Map();
const instagramPermissionCache = new Map();
const directUiDumpSupport = new Map();
const uiDumpCache = new Map();
const uiDumpInFlight = new Map();
const openAppInFlight = new Map();
const accountRuntimeTargets = new Map();
const androidUiReadyCache = new Map();
const facebookMediaRoot = '/sdcard/Pictures/SocialPilot';
const instagramPermissionCacheTtlMs = 10 * 60 * 1000;
const uiDumpCacheTtlMs = 350;
const androidUiReadyCacheTtlMs = 12_000;

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
  composerTap: { x: 390, y: 145 }
};

const composerLabels = [
  "What's on your mind?",
  'Bạn đang nghĩ gì?',
  'Ban dang nghi gi?',
  'Create post',
  'Tạo bài viết'
];

const submitLabels = ['Đăng', 'Dang', 'Post', 'POST', 'Share', 'Publish'];
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
const selectedImageLabels = ['Ảnh chụp vào ngày', 'Photo taken on'];
const attachedImageLabels = ['Gỡ ảnh', 'Chỉnh sửa ảnh', 'mở rộng ảnh', 'Remove photo', 'Edit photo', 'expand photo'];
const attachedVideoLabels = ['Video', 'Sửa video', 'Gỡ video', 'Edit video', 'Remove video'];
const attachedMediaLabels = [...attachedImageLabels, ...attachedVideoLabels];
const removeImageLabels = ['Gỡ ảnh', 'Remove photo'];
const closeComposerLabels = ['Đóng', 'Close'];
const discardPostLabels = ['Bỏ bài viết', 'Discard post'];
const shareFeedLabels = ['Feed'];
const shareOnceLabels = ['JUST ONCE'];
const postTitleLabels = ['Bài viết mới', 'Bai viet moi', 'Create post'];
const textEditorLabels = ['Thêm văn bản', 'Them van ban', 'Add text'];
const loginBlockLabels = ['Log in', 'Đăng nhập', 'Dang nhap', 'Choose a way to confirm your account', 'Confirm your account', 'Session Expired'];
const rememberedAccountContinueLabels = ['Tiếp tục', 'Tiep tuc', 'Continue'];
const facebookHomeLabels = ['Trang chủ', 'Trang chu', 'Home'];
const systemAnrLabels = [
  "System UI isn't responding",
  'System UI is not responding',
  'Giao diện hệ thống không phản hồi',
  'System UI không phản hồi'
];
const systemAnrWaitLabels = ['Wait', 'Chờ', 'Đợi'];
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
const instagramAddMoreMediaLabels = [
  'Add More Photos and Videos',
  'Add more photos and videos',
  'Thêm ảnh và video'
];
const instagramFeedShareActivity = 'com.instagram.share.handleractivity.ShareHandlerActivity';

const defaultAdbHost = '127.0.0.1:5555';

function delay(ms) {
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

export async function openLdPlayer(account, userId) {
  const service = await ensureLdPlayerVirtualizationService(account, userId);
  let instance = await getLdPlayerInstanceInfo(account.instanceName);
  const launchArgs = Number.isInteger(instance?.index)
    ? ['launch', '--index', String(instance.index)]
    : ['launch', '--name', account.instanceName];
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
    : await runCommand(env.mobileAutomation.ldconsolePath, launchArgs);
  await writeLog(
    userId,
    account._id,
    result.ok ? 'info' : 'error',
    'remote_launch_ldplayer',
    result.alreadyRunning ? `${account.instanceName} đang chạy, tiếp tục kiểm tra ADB.` : (result.ok ? 'Đã mở LDPlayer.' : 'Mở LDPlayer lỗi.'),
    { ...result, service, instance }
  );
  if (!result.ok) return { launch: result, connect: null, startServer: null };

  const startServer = await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
  await writeLog(userId, account._id, startServer.ok ? 'info' : 'warn', 'remote_adb_start_server', startServer.ok ? 'ADB server đã sẵn sàng.' : 'Không khởi động được ADB server.', startServer);

  const wasRunningBeforeLaunch = Boolean(instance?.running);
  const engineWaitMs = wasRunningBeforeLaunch && !instance.engineReady
    ? 3_000
    : Math.max(env.mobileAutomation.launchWaitMs, 45_000);
  let engine = await waitForLdPlayerEngine(account, engineWaitMs);
  if (!engine.ok) {
    await writeLog(
      userId,
      account._id,
      'warn',
      'ldplayer_engine_not_ready',
      `${account.instanceName} đã nhận lệnh mở nhưng engine/ADB chưa phản hồi; đang thử lệnh launch lần cuối.`,
      engine
    );
    instance = await getLdPlayerInstanceInfo(account.instanceName);
    const recoveryArgs = instance?.running && Number.isInteger(instance.index)
      ? ['reboot', '--index', String(instance.index)]
      : launchArgs;
    result = await runCommand(env.mobileAutomation.ldconsolePath, recoveryArgs);
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
    const error = new Error(
      `${account.instanceName} đã mở cửa sổ nhưng Android/ADB chưa khởi động. Hãy đóng instance này trong LDPlayer Manager, mở lại một lần rồi thử tiếp.`
    );
    error.code = 'LDPLAYER_ENGINE_NOT_READY';
    error.details = {
      instance: engine.instance,
      devices: engine.devices,
      service
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

  const started = runDetachedCommand(executable);
  await writeLog(
    userId,
    account._id,
    started.ok ? 'info' : 'warn',
    'ldplayer_virtualization_service_start',
    started.ok ? 'Đã khởi động lại dịch vụ ảo hóa LDPlayer.' : 'Không khởi động được dịch vụ ảo hóa LDPlayer.',
    started
  );
  if (started.ok) await delay(1_500);
  return started;
}

async function getLdPlayerInstanceInfo(instanceName = '') {
  if (!instanceName) return '';
  const instances = await getLdPlayerInstances();
  return instances.find((instance) => instance.instanceName === instanceName) || null;
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

async function waitForLdPlayerEngine(account, timeoutMs = 12_000) {
  const startedAt = Date.now();
  let lastInstance = null;
  let lastDevices = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastInstance = await getLdPlayerInstanceInfo(account.instanceName);
    lastDevices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 4_000 });
    const connectedTargets = parseConnectedAdbTargets(lastDevices);
    const configuredTarget = getDeviceTarget(account);
    const expectedTarget = lastInstance?.target || configuredTarget;
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
    await delay(750);
  }

  return {
    ok: false,
    reason: 'engine_start_timeout',
    elapsedMs: Date.now() - startedAt,
    instance: lastInstance,
    devices: lastDevices
  };
}

function parseConnectedAdbTargets(result) {
  if (!result?.ok) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial);
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
    const systemUiAnr = /Application Not Responding:\s*com\.android\.systemui/i.test(windowOutput)
      || /mCurrentFocus=.*com\.android\.systemui.*not responding/i.test(windowOutput);

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
    const systemUiAnr = /Application Not Responding:\s*com\.android\.systemui/i.test(output)
      || /mCurrentFocus=.*com\.android\.systemui.*not responding/i.test(output);
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

async function resetInstagramDisplaySize(account, userId, target) {
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
  return { ok: reset.ok, before, after, reset };
}

async function performOpenAccountApp(account, userId, appPackage) {
  const startedAt = Date.now();
  let target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
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
      const launched = await openLdPlayer(account, userId);
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
    const launched = await openLdPlayer(account, userId);
    target = launched.target || await getLdPlayerDeviceTarget(account.instanceName) || target;
    ready = await ensureDeviceReady(account, userId, target, 18);
    target = ready.resolvedTarget || target;
  }
  if (!ready.ok || String(ready.stdout || '').trim() !== 'device') {
    throw new Error(ready.error || ready.stderr || `ADB ${target} chưa sẵn sàng.`);
  }

  const androidUi = await ensureAndroidUiReady(account, userId, target);
  if (!androidUi.ok) {
    throw new Error(androidUi.error || `Android/System UI trên ${target} chưa sẵn sàng.`);
  }
  if (androidUi.waitedForBoot) {
    // Let launcher and package manager finish their first render before opening Facebook.
    await delay(900);
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
      if (!systemUiHealth.ok) throw new Error(systemUiHealth.error);
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
          ? await ensureFacebookHomeOnOpen(account, userId, target, packageName, {
            fast: true,
            recentlyBooted: androidUi.waitedForBoot
          })
          : null
      };
      await writeLog(userId, account._id, 'info', 'remote_open_app_fast_path', `App ${packageName} đã mở sẵn.`, fastResult);
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
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_open_app', result.ok ? `Đã mở app ${packageName}.` : `Mở app lỗi ${packageName}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Open app failed.');
  let readiness = await waitForAppForegroundReady(account, userId, target, packageName, 7_000, {
    stableChecks: 1,
    requireVisibleUi: false
  });
  if (!readiness.ok) {
    result = packageName === defaultPackages.facebook
      ? await launchFacebookFresh(target, packageName)
      : await launchAppFresh(target, packageName);
    if (!result.ok) throw new Error(result.error || result.stderr || 'Open app failed.');
    readiness = await waitForAppForegroundReady(account, userId, target, packageName, 14_000);
  }
  if (!readiness.ok) {
    throw new Error(readiness.error || `${packageName} chưa ổn định trên LDPlayer.`);
  }
  const systemUiHealth = await waitForSystemUiHealthy(account, userId, target, {
    phase: 'after_app_launch',
    initialDelayMs: androidUi.recoveryCount ? 3500 : 900
  });
  if (!systemUiHealth.ok) throw new Error(systemUiHealth.error);
  let home = null;
  if (packageName === defaultPackages.facebook) {
    home = await ensureFacebookHomeOnOpen(account, userId, target, packageName, {
      fast: true,
      recentlyBooted: androidUi.waitedForBoot
    });
  }
  return { ...result, target, readiness, systemUiHealth, home, androidUi, elapsedMs: Date.now() - startedAt };
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

async function launchFacebookWarm(target, packageName) {
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
  if (feed.ok && !/error:|unable to resolve/i.test(output)) {
    return { ...feed, launchMethod: 'facebook_warm_feed_uri' };
  }
  return launchAppWarm(target, packageName);
}

async function launchAppFresh(target, packageName) {
  await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 });
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
  const component = String(resolve.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes('/') && line.startsWith(`${packageName}/`));
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
  const feedOutput = `${feed.stdout || ''}\n${feed.stderr || ''}`;
  if (feed.ok && !/error:|unable to resolve|activity not started/i.test(feedOutput)) {
    return { ...feed, launchMethod: 'facebook_feed_uri' };
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
  const component = String(resolve.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes('/') && line.startsWith(`${packageName}/`));
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
    ], { timeoutMs: 20_000 });
    if (launch.ok) {
      return {
        ...launch,
        launchMethod: 'launcher_activity',
        launcherComponent: component,
        feedError: feed.error || feed.stderr || feed.stdout || ''
      };
    }
  }
  const fallback = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  return {
    ...fallback,
    launchMethod: 'monkey_fallback',
    feedError: feed.error || feed.stderr || feed.stdout || ''
  };
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
    { state, active, recoverySteps }
  );
  if (state.name === 'blocked') {
    throwFacebookBlockedError(state);
  }
  const finalActive = await getForegroundAndroidPackage(target);
  if (finalActive.packageName !== packageName) {
    const error = new Error('Facebook chưa mở thành công trên LDPlayer.');
    error.code = 'FACEBOOK_APP_NOT_FOREGROUND';
    error.details = { finalActive, target, packageName, state };
    throw error;
  }
  if (!verified) {
    const error = new Error('Facebook đã mở nhưng chưa về đúng trang chủ. Hãy thử bấm Về trang chủ lần nữa.');
    error.code = 'FACEBOOK_HOME_NOT_READY';
    error.details = { finalActive, target, packageName, state, recoverySteps };
    throw error;
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

async function ensureLdPlayerInstanceStopped(account, userId, target, expectedProcesses = {}) {
  await delay(1_200);
  let stableStoppedChecks = 0;
  let lastAliveProcessIds = [];
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const device = target
      ? await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 3_000 })
      : { ok: false };
    const instance = await getLdPlayerInstanceInfo(account.instanceName);
    lastAliveProcessIds = await getAliveProcessIds([
      expectedProcesses.processId,
      expectedProcesses.boxProcessId
    ]);
    if (!instance?.running && lastAliveProcessIds.length === 0) {
      stableStoppedChecks += 1;
      if (stableStoppedChecks >= 3) {
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
  return {
    appPackage: override.appPackage || metadata.appPackage || defaultPackages[account.platform] || defaultPackages.facebook,
    composerTap: override.composerTap || metadata.postSteps?.composerTap || defaultPostSteps.composerTap,
    autoSubmit: Boolean(override.autoSubmit),
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
  return {
    target,
    deviceReady: true,
    appReady: appInForeground || appProcessAlive,
    appInForeground,
    appProcessAlive,
    processId,
    foregroundPackage: foreground.packageName,
    foregroundActivity: foreground.activityName
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
      await openLdPlayer(account, userId);
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
    await openLdPlayer(account, userId);
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

  let preparedImages = [];
  let preparedVideos = [];
  try {
    let openHome = null;
    if (videos.length) {
      preparedVideos = await prepareFacebookVideos(account, userId, target, videos);
      perf.mark('video_prepared', { videoCount: preparedVideos.length });
      await assertDeviceConnected(target, 'trước khi mở Facebook composer');
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
      const pipelineStartedAt = Date.now();
      [preparedImages, openHome] = await Promise.all([
        prepareFacebookImages(account, userId, target, images, { cleanup: true }),
        openFacebookComposer(account, userId, target, config, text, [], 'image')
      ]);
      await writeLog(
        userId,
        account._id,
        'info',
        'facebook_post_parallel_preparation',
        'Đã chuẩn bị ảnh song song; Facebook sẽ chọn toàn bộ ảnh trong một lượt theo đúng thứ tự.',
        {
          imageCount: preparedImages.length,
          durationMs: Date.now() - pipelineStartedAt,
          attachMode: 'single_gallery_batch'
        }
      );
      perf.mark('images_prepared_and_composer_opened', { imageCount: preparedImages.length, method: openHome.method || '' });
    } else if (images.length === 1) {
      preparedImages = await prepareFacebookImages(account, userId, target, images, { cleanup: false });
      perf.mark('image_prepared', { imageCount: preparedImages.length });
      await assertDeviceConnected(target, 'trước khi mở Facebook composer');
      // Image share intents can stall ADB/UIAutomator on LDPlayer-3.
      // Open the text composer first and attach the prepared image through
      // Facebook's gallery in the state machine.
      openHome = await openFacebookComposer(account, userId, target, config, text, [], 'image');
      perf.mark('composer_opened', { method: openHome.method || '' });
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
        mediaKind: preparedVideos.length ? 'video' : 'image'
      }
    );
    steps.push(...stateMachine.steps);
    perf.mark('state_machine_finished', {
      finalState: stateMachine.finalState,
      submitVerified: stateMachine.submitVerified ?? false
    });

    const submitVerified = stateMachine.submitVerified ?? false;
    const finishedLevel = config.autoSubmit && !submitVerified ? 'warn' : 'info';
    await writeLog(userId, account._id, finishedLevel, 'facebook_post_finished', config.autoSubmit && !submitVerified ? 'Đã bấm Đăng nhưng chưa xác nhận Facebook đã nhận bài.' : (config.autoSubmit ? 'Đã chạy luồng tự đăng Facebook.' : 'Đã mở composer Facebook, chờ kiểm tra/tự bấm đăng.'), {
      autoSubmit: config.autoSubmit,
      finalState: stateMachine.finalState,
      submitVerified,
      submitReason: stateMachine.submitReason || '',
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
      submitReason: stateMachine.submitReason || '',
      screenshot: stateMachine.screenshot,
      screenshotVerified: Boolean(stateMachine.screenshotVerified),
      stepCount: steps.length
    };
  } finally {
    if ((images.length > 0 || videos.length > 0) && config.autoSubmit) {
      cleanupFacebookMediaLibrary(account, userId, target, 'after_publish').catch((error) => {
        writeLog(userId, account._id, 'warn', 'facebook_post_media_cleanup_deferred_failed', error.message, { target }).catch(() => null);
      });
    }
  }
}

export async function publishInstagramPostViaMobile(account, userId, payload = {}) {
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

  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!images.length) throw new Error('Instagram cần ít nhất 1 ảnh để đăng.');
  if (!config.appPackage) throw new Error('Thiếu Android package name của Instagram.');

  await writeLog(userId, account._id, 'info', 'instagram_post_started', `Bắt đầu mở composer Instagram cho ${account.displayName}.`, {
    target,
    appPackage: config.appPackage,
    autoSubmit: config.autoSubmit,
    postType,
    imageCount: images.length
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
    await openLdPlayer(account, userId);
    const launchedTarget = await getLdPlayerDeviceTarget(account.instanceName);
    target = await resolveStableDeviceTarget(launchedTarget || getDeviceTarget(account) || target);
    device = await ensureDeviceReady(account, userId, target, 28);
    target = device.resolvedTarget || target;
  }
  steps.push(device);
  if (!device.ok || String(device.stdout || '').trim() !== 'device') throw new Error(device.error || device.stderr || 'Device is not ready.');
  perf.mark('adb_ready', { target });

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
  const submitVerified = stateMachine.submitVerified ?? false;
  const finishedLevel = config.autoSubmit && !submitVerified ? 'warn' : 'info';
  await writeLog(userId, account._id, finishedLevel, 'instagram_post_finished', config.autoSubmit && !submitVerified ? 'Đã bấm Share Instagram nhưng chưa xác nhận app nhận bài.' : (config.autoSubmit ? 'Đã chạy luồng tự đăng Instagram.' : 'Đã mở composer Instagram, chờ kiểm tra/tự bấm share.'), {
    autoSubmit: config.autoSubmit,
    finalState: stateMachine.finalState,
    submitVerified,
    submitReason: stateMachine.submitReason || '',
    postType,
    imageCount: preparedImages.length,
    perf: perf.snapshot()
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
    stepCount: steps.length,
    perf: perf.snapshot()
  };
}

async function openInstagramComposer(account, userId, target, config, text, images) {
  const media = Array.isArray(images) ? images : [];
  if (media.length > 1) {
    return openInstagramCarouselComposer(account, userId, target, config, text, media);
  }

  const stop = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', config.appPackage]);
  await writeLog(userId, account._id, stop.ok ? 'info' : 'warn', 'instagram_post_reset_app_task', stop.ok ? 'Đã đóng task Instagram cũ trước khi mở composer mới.' : 'Không đóng được task Instagram cũ.', stop);
  await delay(postStepDelay());

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
  const intentAttempts = [
    {
      args: [...baseIntentArgs, '-n', `${config.appPackage}/${instagramFeedShareActivity}`],
      method: 'feed_share_activity_media_only'
    },
    {
      args: [...baseIntentArgs, '-p', config.appPackage],
      method: 'package_share_media_only'
    }
  ];
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
    shareIntent = await runCommand(env.mobileAutomation.adbPath, intentArgs, { timeoutMs: 20_000 });
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

    bootstrap = await waitForInstagramComposerBootstrap(account, userId, target, config, text, method);
    if (bootstrap.ok) break;
    // Activity đã nhận intent thì không mở lại bằng phương thức khác. Việc
    // relaunch khi UI chỉ đang chậm có thể tạo nhiều composer cho cùng một bài.
    if (bootstrap.foreground?.packageName === config.appPackage) break;
  }

  const opened = Boolean(shareIntent?.ok && bootstrap?.ok);
  await writeLog(userId, account._id, opened ? 'info' : 'error', 'instagram_post_open_share_composer', opened ? 'Đã mở Instagram Feed/Profile composer bằng Android share intent.' : 'Không mở được Instagram Feed/Profile share intent.', {
    ...shareIntent,
    args: maskShareIntentArgs(intentArgs),
    method,
    imageCount: imageUris.length,
    bootstrap
  });
  if (!opened) throw new Error(shareIntent?.error || shareIntent?.stderr || bootstrap?.error || 'Không mở được Instagram Feed/Profile composer.');
  return { ...shareIntent, method, bootstrap };
}

async function openInstagramCarouselComposer(account, userId, target, config, text, images) {
  const firstImageComposer = await openInstagramComposer(account, userId, target, config, text, [images[0]]);
  let nodes = await dumpVisibleNodes(target);
  let addMoreNode = findInstagramAddMoreMediaButton(nodes);
  if (!addMoreNode) {
    const ready = await waitForInstagramAddMoreButton(target, 25_000);
    nodes = ready?.nodes || nodes;
    addMoreNode = ready?.node || null;
  }
  if (!addMoreNode) throw new Error('Instagram đã mở ảnh đầu tiên nhưng không tìm thấy nút thêm ảnh vào Album.');

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
      await writeLog(userId, account._id, 'warn', 'instagram_post_add_more_retry', 'Nút Add More chưa mở gallery, đang thử lại.', {
        attempt,
        point: addMorePoint
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

async function waitForInstagramAddMoreGallery(target, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(450);
    const nodes = await dumpVisibleNodes(target);
    const hasPhotos = nodes.some((node) => /gallery_grid_item_thumbnail/i.test(node.raw || ''));
    const hasNext = findNodeInNodes(nodes, instagramNextLabels, { exact: true });
    if (hasPhotos && hasNext) return { nodes };
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
  ], { timeoutMs: 20_000 });
  let ready = await waitForInstagramAlbumEntry(target, packageName, 15_000);
  if (ready) return { ok: true, launch, ...ready };

  await writeLog(userId, account._id, 'warn', 'instagram_post_album_home_restart', 'Instagram chưa render Home/Create, đang khởi động lại app để thoát màn trắng.', {
    launch
  });
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

async function waitForInstagramAlbumEntry(target, packageName, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await delay(700);
    const [nodes, foreground] = await Promise.all([
      dumpVisibleNodes(target),
      getForegroundAndroidPackage(target)
    ]);
    if (foreground.packageName !== packageName) continue;
    const hasGallery = (findNodeInNodes(nodes, instagramNewPostLabels, { exact: true })
      || nodes.some((node) => /new_post_title/i.test(node.raw || '')))
      && (findNodeInNodes(nodes, instagramSelectMultipleLabels)
        || nodes.some((node) => /multi_select_slide_button/i.test(node.raw || '')));
    if (hasGallery) return { state: 'gallery', nodes, foreground, elapsedMs: Date.now() - startedAt };
    if (findNodeInNodes(nodes, instagramCreateLabels, { exact: true })) {
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
    const createNode = findNodeInNodes(nodes, instagramCreateLabels, { exact: true });
    if (createNode) {
      const point = {
        x: Math.round((createNode.left + createNode.right) / 2),
        y: Math.round((createNode.top + createNode.bottom) / 2)
      };
      await tapAndLog(userId, account._id, target, 'instagram_post_open_album_gallery', point);
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
  let selectedCount = 1;
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
  let lastState = null;
  let lastForeground = null;
  while (Date.now() - startedAt < timeoutMs) {
    await delay(550);
    const [nodes, foreground] = await Promise.all([
      dumpVisibleNodes(target),
      getForegroundAndroidPackage(target)
    ]);
    let state = detectInstagramState(nodes, text);
    lastState = state;
    lastForeground = foreground;

    if (state.name === 'share_resolver') {
      const resolved = await selectInstagramFeedAlways(account, userId, target, nodes);
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
      await delay(postStepDelay(1.5));
      continue;
    }

    if (['unknown', 'home'].includes(state.name) && foreground.packageName === config.appPackage && /MediaCaptureActivity/i.test(foreground.activityName || '')) {
      state = { ...state, name: 'next', reason: `activity:${foreground.activityName}`, active: foreground };
      lastState = state;
    }

    if (['next', 'caption', 'info_dialog'].includes(state.name)) {
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
  let screenshot = null;
  let finalState = 'unknown';
  let recoveredEmptyUiOnce = false;
  let captionEntered = false;
  let captionAttempts = 0;
  let lastLoggedState = '';
  const requiresCaption = Boolean(text.trim());

  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const nodes = await dumpVisibleNodes(target);
    let state = detectInstagramState(nodes, text);
    if (['unknown', 'home'].includes(state.name)) {
      const active = await getForegroundAndroidPackage(target);
      if (active.packageName === config.appPackage && /MediaCaptureActivity/i.test(active.activityName || '')) {
        state = { ...state, name: 'next', reason: `activity:${active.activityName}`, active };
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

    if (requiresCaption && !captionEntered && ['submitting', 'submitted', 'home'].includes(state.name)) {
      screenshot = await captureScreenshot(account, userId, 'instagram_post_caption_missing_before_submit');
      await writeLog(userId, account._id, 'warn', 'instagram_post_caption_missing_before_submit', 'Instagram đã rời màn soạn trước khi automation xác minh được caption; dừng để tránh đăng thiếu emoji/hashtag.', {
        state,
        captionAttempts,
        textLength: text.length
      });
      return { finalState: state.name, screenshot, steps, composerPending: false, submitVerified: false, submitReason: 'caption_missing_before_submit' };
    }

    if (state.name === 'next') {
      const nextMatch = findNodeInNodes(nodes, instagramNextLabels, { exact: true, preferBottomRight: true });
      if (!nextMatch && requiresCaption) {
        await writeLog(userId, account._id, 'warn', 'instagram_post_next_text_missing', 'Instagram đang ở màn tạo nội dung nhưng không thấy nút Next; không bấm tọa độ để tránh đăng thiếu caption.', {
          state,
          textLength: text.length
        });
        await delay(postStepDelay(1.25));
        continue;
      }
      const next = await tapTextOrPoint(account, userId, target, instagramNextLabels, getInstagramBottomRightFallbackPoint(nodes), 'instagram_post_tap_next', { exact: true, preferBottomRight: true, nodes });
      steps.push(next);
      await waitForInstagramState(target, text, ['caption', 'info_dialog', 'blocked'], 6_000);
      continue;
    }

    if (state.name === 'caption') {
      if (text.trim() && !captionEntered && !state.hasTargetText && captionAttempts < 3) {
        captionAttempts += 1;
        const caption = await enterInstagramCaption(account, userId, target, text, nodes);
        steps.push(...caption.steps);
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

  let verification = await verifyInstagramPostSubmit(account, userId, target, Math.max(6_000, Math.min(config.waitAfterSubmitMs || 0, 8_000)));
  if (!verification.ok && verification.reason === 'still_on_share_screen') {
    const retryShare = await tapInstagramShareButton(account, userId, target, 'instagram_post_tap_share_retry');
    steps.push(retryShare);
    verification = await verifyInstagramPostSubmit(account, userId, target, config.waitAfterSubmitMs);
  }
  return { finalState: verification.ok ? 'submitted' : verification.finalState, screenshot: verification.screenshot, steps, composerPending: verification.composerPending, submitVerified: verification.ok, submitReason: verification.reason };
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

  const shareNode = findInstagramShareButton(nodes);
  if (shareNode) {
    const point = {
      x: Math.round((shareNode.left + shareNode.right) / 2),
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

async function selectInstagramFeedAlways(account, userId, target, nodes = []) {
  const steps = [];
  let currentNodes = nodes;
  let alwaysNode = findNodeInNodes(currentNodes, instagramResolverAlwaysLabels, { exact: true, preferBottomRight: true });

  if (!alwaysNode) {
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
    }
  }

  if (!alwaysNode) {
    await writeLog(userId, account._id, 'error', 'instagram_post_share_resolver_always_missing', 'Hộp chọn ứng dụng xuất hiện nhưng không tìm thấy nút ALWAYS.', {
      labels: currentNodes.map((node) => node.text || node.desc).filter(Boolean)
    });
    return {
      ok: false,
      error: 'Không tìm thấy nút ALWAYS trong hộp chọn Instagram.',
      steps
    };
  }

  const point = {
    x: Math.round((alwaysNode.left + alwaysNode.right) / 2),
    y: Math.round((alwaysNode.top + alwaysNode.bottom) / 2)
  };
  const always = await tapAndLog(userId, account._id, target, 'instagram_post_choose_feed_always', point);
  steps.push(always);
  await writeLog(userId, account._id, 'info', 'instagram_post_share_resolver_saved', 'Đã chọn Instagram Feed và ALWAYS để Android không hỏi lại.', {
    bounds: alwaysNode,
    point
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
      if (consecutiveCaptionStates >= 4 && elapsedMs >= 3_000) {
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
      const elapsedMs = Date.now() - startedAt;
      if (lastLoggedState !== state.name || elapsedMs - lastStateLoggedAt >= 5_000) {
        await writeLog(userId, account._id, 'info', 'instagram_post_submit_waiting', 'Instagram đang xử lý sau khi bấm Share.', {
          elapsedMs,
          state
        });
        lastLoggedState = state.name;
        lastStateLoggedAt = elapsedMs;
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

  await runCommand(env.mobileAutomation.adbPath, ['kill-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  });
  await delay(700);
  await runCommand(env.mobileAutomation.adbPath, ['start-server'], {
    timeoutMs: 10_000,
    retryTransient: false
  });

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await delay(attempt < 3 ? 600 : 1_000);
    state = await runCommand(
      env.mobileAutomation.adbPath,
      ['-s', target, 'get-state'],
      { timeoutMs: 5_000, retryTransient: false }
    );
    if (!state.ok || String(state.stdout || '').trim() !== 'device') continue;

    const shell = await runCommand(
      env.mobileAutomation.adbPath,
      ['-s', target, 'shell', 'echo', 'socialpilot-ready'],
      { timeoutMs: 5_000, retryTransient: false }
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

  // Facebook hides the gallery action after receiving an image through a share
  // intent. Use that fast path only for one image; multi-image posts must start
  // from a text composer and select all media from Facebook's gallery.
  const primaryMedia = media.length === 1 ? media[0] : null;
  const intentType = primaryMedia?.mimeType || 'text/plain';
  const intentArgs = buildFacebookShareIntentArgs(target, config, text, primaryMedia);

  let shareIntent = await runCommand(env.mobileAutomation.adbPath, intentArgs, { timeoutMs: 12_000 });
  let coldRetry = null;
  if (!isSuccessfulFacebookShareIntent(shareIntent)) {
    coldRetry = await resetFacebookTaskForComposer(account, userId, target, config.appPackage, shareIntent);
    shareIntent = await runCommand(env.mobileAutomation.adbPath, intentArgs, { timeoutMs: 15_000 });
  }

  if (isSuccessfulFacebookShareIntent(shareIntent)) {
    await writeLog(userId, account._id, 'info', 'facebook_post_open_share_composer', 'Đã mở Facebook composer bằng Android share intent để giữ Unicode.', {
      ...shareIntent,
      args: maskShareIntentArgs(intentArgs),
      launchMode: coldRetry ? 'cold_retry' : 'warm',
      coldRetry
    });
    return { ...shareIntent, method: primaryMedia ? `${mediaKind}_share_intent` : 'text_share_intent' };
  }

  if (mediaKind === 'video' && primaryMedia?.remotePath) {
    const genericShare = await openFacebookGenericShareComposer(account, userId, target, config, intentArgs, 'video');
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
  const intentType = primaryMedia?.mimeType || 'text/plain';
  const intentArgs = [
    '-s',
    target,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.SEND',
    '-t',
    intentType,
    '--es',
    'android.intent.extra.TEXT',
    quoteAdbShellArg(text)
  ];
  if (primaryMedia?.remotePath) {
    intentArgs.push(
      '--grant-read-uri-permission',
      '--eu',
      'android.intent.extra.STREAM',
      primaryMedia.contentUri || `file://${primaryMedia.remotePath}`
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
  return genericShare.ok
    ? { ...genericShare, method: `${mediaKind}_share_intent`, generic: true }
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
        .filter((row) => row.includes(`${facebookMediaRoot}/`))
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
    facebookMediaRoot
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
  const storageReady = await ensureAndroidStorageReady(account, userId, target);
  steps.push(storageReady);
  if (!storageReady.ok) throw new Error(storageReady.error);

  if (cleanupBeforePublish) {
    const cleanup = await cleanupFacebookMediaLibrary(account, userId, target, 'before_publish');
    steps.push(...cleanup.steps);
  }
  const sessionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const remoteDir = `${facebookMediaRoot}/${sessionId}`;

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
  const mediaSession = await prepareFacebookMediaSession(account, userId, target, options);
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

  // Chép file là bước nặng nên chạy song song. MediaStore vẫn đăng ký tuần tự
  // từ ảnh cuối đến ảnh đầu để Facebook Gallery giữ đúng thứ tự Preview.
  const preparedImages = [];
  for (const pushedImage of [...pushedImages].reverse()) {
    preparedImages.push(await registerFacebookImageMedia(
      account,
      userId,
      target,
      pushedImage
    ));
  }
  preparedImages.reverse();
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

async function runFacebookPostStateMachine(account, userId, target, config, text, images = [], options = {}) {
  const steps = [];
  const mediaKind = options.mediaKind === 'video' ? 'video' : 'image';
  let recoveredEmptyUiOnce = false;
  let textEntered = false;
  let attachedImageCount = options.imageSharedByIntent && images.length ? 1 : 0;
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

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const state = await resolveFacebookOpenState(target, await detectFacebookState(target, text));
    if (state.hasTargetText) textEntered = true;
    finalState = state.name;
    await writeLog(userId, account._id, 'info', 'facebook_post_state', `Facebook state: ${state.name}.`, {
      attempt,
      reason: state.reason,
      hasAttachedImage: Boolean(state.hasAttachedImage),
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
      if (recoveredEmptyUiOnce) {
        screenshot = await captureScreenshot(account, userId, 'facebook_ui_nodes_unavailable');
        throw new Error('Facebook hoặc System UI không phản hồi trên LDPlayer. Đã dừng sớm để tránh workflow chạy treo.');
      }
      recoveredEmptyUiOnce = true;
      const healthy = await waitForSystemUiHealthy(account, userId, target, {
        phase: 'facebook_empty_ui_recovery',
        stableChecks: 2,
        maxAttempts: 4,
        initialDelayMs: 600
      });
      steps.push(healthy);
      invalidateUiDump(target);
      if (!healthy.ok) {
        screenshot = await captureScreenshot(account, userId, 'facebook_ui_recovery_failed');
        throw new Error(healthy.error || 'System UI của LDPlayer chưa ổn định.');
      }
      continue;
    }

    if (state.name === 'blocked') {
      screenshot = await captureScreenshot(account, userId, 'facebook_post_blocked');
      throw new Error('Facebook đang ở màn đăng nhập/checkpoint/session expired. Cần xử lý thủ công trước khi tự đăng.');
    }

    if (state.name === 'share_chooser') {
      const feed = await tapTextOrPoint(account, userId, target, shareFeedLabels, { x: 225, y: 1368 }, 'facebook_post_choose_feed', { exact: true });
      steps.push(feed);
      await delay(postStepDelay());
      const once = await tapTextOrPoint(account, userId, target, shareOnceLabels, { x: 600, y: 1550 }, 'facebook_post_choose_feed_once', { exact: true });
      steps.push(once);
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

    if (state.name === 'stale_composer') {
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
      const replace = await replaceFocusedText(target, text);
      await writeLog(userId, account._id, replace.ok ? 'info' : 'error', 'facebook_post_replace_stale_text', replace.ok ? 'Đã thay nội dung draft cũ bằng nội dung mới.' : 'Không thay được nội dung draft cũ.', replace);
      if (!replace.ok) throw new Error(replace.error || replace.stderr || 'Không thay được nội dung draft cũ.');
      steps.push(replace);
      textEntered = true;
      await delay(postStepDelay(1.25));
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
        const attachment = await attachFacebookImages(
          account,
          userId,
          target,
          imageCount - attachedImageCount,
          text,
          {
            preserveExisting: attachedImageCount > 0,
            galleryStartOffset: attachedImageCount
          }
        );
        steps.push(...attachment.steps);
        attachedImageCount += attachment.attachedCount || 1;
        await delay(postStepDelay(1.25));
        continue;
      }

      if (!config.autoSubmit) {
        screenshot = await captureScreenshot(account, userId, 'facebook_post_ready_to_post');
        return { finalState, screenshot, steps, composerPending: false };
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
      if (!textEntered) {
        const input = await inputAndLog(userId, account._id, target, 'facebook_post_input_text', text);
        steps.push(input);
        textEntered = true;
        await delay(postStepDelay(1.25));
        const enteredState = await detectFacebookState(target, text);
        await writeLog(userId, account._id, enteredState.hasTargetText ? 'info' : 'warn', 'facebook_post_verify_text', enteredState.hasTargetText ? 'Đã xác nhận text xuất hiện trong editor.' : 'Chưa xác nhận được text trong editor sau khi nhập.', {
          state: enteredState.name,
          reason: enteredState.reason,
          hasTargetText: enteredState.hasTargetText
        });
      }

      if (!config.autoSubmit && !imageCount) {
        screenshot = await captureScreenshot(account, userId, 'facebook_post_text_editor');
        return { finalState, screenshot, steps, composerPending: false };
      }

      const done = await tapTextOrPoint(account, userId, target, doneLabels, { x: 846, y: 72 }, 'facebook_post_done_text', { exact: true });
      steps.push(done);
      await delay(postStepDelay(1.5));
      continue;
    }

    if (state.name === 'composer') {
      if (state.hasTargetText) {
        if (attachedImageCount < imageCount) {
          const attachment = await attachFacebookImages(
            account,
            userId,
            target,
            imageCount - attachedImageCount,
            text,
            {
              preserveExisting: attachedImageCount > 0,
              galleryStartOffset: attachedImageCount
            }
          );
          steps.push(...attachment.steps);
          attachedImageCount += attachment.attachedCount || 1;
          await delay(postStepDelay(1.25));
          continue;
        }

        if (!config.autoSubmit) {
          screenshot = await captureScreenshot(account, userId, 'facebook_post_composer_ready');
          return { finalState, screenshot, steps, composerPending: false };
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

      const bodyTap = await tapTextOrPoint(account, userId, target, composerLabels, { x: 450, y: 360 }, 'facebook_post_open_text_editor');
      steps.push(bodyTap);
      await delay(postStepDelay(1.25));
      continue;
    }

    if (state.name === 'home') {
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
    const hasAttachedMedia = Boolean(findNodeInNodes(nodes, attachmentLabels));
    if (
      ['ready_to_post', 'composer'].includes(lastState.name)
      && hasTargetText
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
  const submitAttempts = knownSubmitPoint
    ? [
      { method: 'state_detection', point: knownSubmitPoint }
    ]
    : await buildSubmitTapAttempts(target);
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

    await delay(index === 0 ? 450 : 700);
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

async function buildSubmitTapAttempts(target) {
  const nodes = await dumpVisibleNodes(target);
  const submitNode = findSemanticSubmitButton(nodes);
  if (!submitNode) {
    throw new Error('Không nhận diện được nút Đăng/Post trên màn hình Facebook.');
  }

  const submitPoint = submitNode
    ? {
      x: Math.round((submitNode.left + submitNode.right) / 2),
      y: Math.round((submitNode.top + submitNode.bottom) / 2)
    }
    : null;
  const points = [
    { method: 'semantic_button', point: submitPoint }
  ].filter((item) => item?.point?.x && item?.point?.y);

  return points;
}

function findSemanticSubmitButton(nodes) {
  const labels = submitLabels.map(normalizeSearchText);
  const candidates = nodes
    .filter((node) => {
      if (!node.enabled || !node.clickable) return false;
      if (!node.className.includes('Button')) return false;
      const value = normalizeSearchText(`${node.text} ${node.desc}`);
      return labels.some((label) => value === label || value.includes(label));
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
  const verificationWindowMs = Math.max(8_000, waitAfterSubmitMs || 0);
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

  const maxVerificationAttempts = mediaKind === 'video' ? 180 : (mediaCount > 0 ? 120 : 40);
  for (let attempt = 1; attempt <= maxVerificationAttempts; attempt += 1) {
    await delay(attempt === 1 ? 900 : 1_000);
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
        await writeLog(userId, account._id, 'info', 'facebook_post_upload_progress_pending', 'Tín hiệu tải video tạm ẩn; tiếp tục chờ Facebook hoàn tất thay vì kết luận thất bại.', {
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
    if (state.name === 'home' && hasExpectedText && !expectedTextInEditor) {
      const screenshot = await captureScreenshot(account, userId, 'facebook_published_post_verified');
      await writeLog(
        userId,
        account._id,
        'info',
        'facebook_published_post_evidence_verified',
        'Đã đối chiếu đúng nội dung bài vừa đăng trên feed trước khi chụp ảnh xác minh.',
        { attempt, state, textPreview: expectedText.slice(0, 80) }
      );
      return { screenshot, verified: true, reason: 'published_text_visible', attempt };
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

async function attachFacebookImages(account, userId, target, imageCount = 1, text = '', options = {}) {
  const steps = [];
  const count = Math.max(1, Math.min(Number(imageCount) || 1, 4));
  let currentState = await detectFacebookState(target, text);
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
    currentState = await detectFacebookState(target, text);
  }
  if (!['ready_to_post', 'composer', 'stale_composer'].includes(currentState.name)) {
    throw new Error(`Facebook chưa ở composer để thêm ảnh (${currentState.name}).`);
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
  const galleryMatch = await waitForAnyText(target, openGalleryLabels, 5_000, { exact: true });
  if (!galleryMatch) {
    const screenshot = await captureScreenshot(account, userId, 'facebook_post_add_media_missing');
    await writeLog(userId, account._id, 'error', 'facebook_post_add_media_missing', 'Không tìm thấy nút thêm file phương tiện trong Facebook composer.', {
      state: currentState,
      labels: openGalleryLabels,
      screenshot
    });
    throw new Error('Không tìm thấy nút thêm file phương tiện trong Facebook composer.');
  }
  const galleryPoint = {
    x: Math.round((galleryMatch.left + galleryMatch.right) / 2),
    y: Math.round((galleryMatch.top + galleryMatch.bottom) / 2)
  };
  let imageMatch = null;
  let shouldTapGallery = true;
  for (let openAttempt = 1; openAttempt <= 3 && !imageMatch; openAttempt += 1) {
    if (shouldTapGallery) {
      const gallery = await tapAndLog(
        userId,
        account._id,
        target,
        openAttempt === 1 ? 'facebook_post_open_gallery' : `facebook_post_open_gallery_retry_${openAttempt}`,
        galleryPoint
      );
      steps.push(gallery);
      await delay(openAttempt === 1 ? 1_200 : 1_800);
    }

    const permission = await findVisibleTextBounds(target, galleryPermissionLabels);
    if (permission) {
      const allow = await tapTextOrPoint(account, userId, target, galleryPermissionLabels, { x: 450, y: 965 }, 'facebook_post_allow_gallery');
      steps.push(allow);
      await delay(1_500);
    }

    imageMatch = await waitForAnyText(target, selectedImageLabels, openAttempt === 1 ? 10_000 : 7_000);
    if (!imageMatch && openAttempt < 3) {
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
  const selection = await selectGalleryImagesByAccessibility(account, userId, target, count);
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

  const nextMatch = await waitForAnyText(target, galleryNextLabels, 8_000, { exact: true, preferBottomRight: true });
  if (!nextMatch) {
    const screenshot = await captureScreenshot(account, userId, 'facebook_post_gallery_confirm_missing');
    await writeLog(userId, account._id, 'error', 'facebook_post_gallery_confirm_missing', 'Không tìm thấy nút xác nhận sau khi chọn ảnh.', {
      screenshot
    });
    throw new Error('Không tìm thấy nút xác nhận chọn ảnh.');
  }
  const next = await tapAndLog(userId, account._id, target, 'facebook_post_gallery_next', {
    x: Math.round((nextMatch.left + nextMatch.right) / 2),
    y: Math.round((nextMatch.top + nextMatch.bottom) / 2)
  });
  steps.push(next);
  await delay(postStepDelay(1.5));

  const attached = await waitForAnyText(target, attachedImageLabels, 10_000);
  if (!attached) {
    const composerState = await detectFacebookState(target, text);
    if (['ready_to_post', 'stale_composer'].includes(composerState.name)) {
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

async function selectGalleryImagesByAccessibility(account, userId, target, count) {
  const steps = [];
  let nodes = await dumpVisibleNodes(target);
  let selectedCount = countSelectedGalleryImages(nodes);
  let attempts = 0;

  while (selectedCount < count && attempts < count * 3) {
    attempts += 1;
    const cells = getGalleryImageCells(nodes);
    const candidate = cells.find((cell) => !cell.selected);
    if (!candidate) break;

    const beforeCount = selectedCount;
    const selectImage = await tapAndLog(
      userId,
      account._id,
      target,
      `facebook_post_select_image_${beforeCount + 1}`,
      { x: candidate.x, y: candidate.y }
    );
    steps.push(selectImage);

    let changed = false;
    for (let poll = 0; poll < 6; poll += 1) {
      await delay(300);
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
    if (
      !node.clickable
      || !['android.widget.Button', 'android.view.ViewGroup'].includes(node.className)
      || !labels.some((label) => description.includes(label))
    ) {
      continue;
    }
    const candidate = {
      x: Math.round((node.bounds.left + node.bounds.right) / 2),
      y: Math.round((node.bounds.top + node.bounds.bottom) / 2),
      ...node.bounds,
      selected: isGalleryCellSelected(node),
      label: node.text || node.desc
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

  const doneNode = findNodeInNodes(nodes, doneLabels, { exact: true });
  const hasDone = Boolean(doneNode && doneNode.top < 180);
  const hasTextEditor = Boolean(findNodeInNodes(nodes, textEditorLabels));
  if (hasDone || hasTextEditor) return { name: 'text_editor', reason: hasDone ? 'done_visible' : 'text_editor_title', hasTargetText };

  const postTitleNode = findNodeInNodes(nodes, postTitleLabels);
  const hasPostTitle = Boolean(postTitleNode && postTitleNode.top < 180);
  const submitNode = findSemanticSubmitButton(nodes)
    || findNodeInNodes(nodes, submitLabels, { exact: true, preferBottomRight: true });
  const screenBottom = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.bottom) || 0), 0);
  const screenRight = nodes.reduce((maximum, node) => Math.max(maximum, Number(node.right) || 0), 0);
  const composerActionThreshold = Math.max(500, Math.round(screenBottom * 0.78));
  const composerActionRightThreshold = Math.round(screenRight * 0.65);
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
  const submitPoint = submitNode
    ? {
      x: Math.round((submitNode.left + submitNode.right) / 2),
      y: Math.round((submitNode.top + submitNode.bottom) / 2)
    }
    : null;
  const hasAttachedImage = Boolean(findNodeInNodes(nodes, attachedMediaLabels));
  const observedText = nodes.find((node) => node.className.includes('EditText') && normalizeSearchText(node.text))?.text || '';
  const hasComposerText = Boolean(observedText);
  if (hasSubmit && (hasTargetText || hasComposerText || hasAttachedImage)) {
    return {
      name: 'ready_to_post',
      reason: 'submit_visible_without_title',
      hasTargetText,
      hasAttachedImage,
      observedText,
      submitPoint
    };
  }
  if (hasPostTitle && !hasTargetText && (hasAttachedImage || hasComposerText)) {
    return {
      name: 'stale_composer',
      reason: hasAttachedImage ? 'existing_image_draft' : 'existing_text_draft',
      hasTargetText,
      hasAttachedImage,
      observedText
    };
  }
  if ((hasSubmit || hasPostTitle) && hasTargetText) {
    return {
      name: 'ready_to_post',
      reason: hasSubmit ? 'submit_visible' : 'post_title_with_text',
      hasTargetText,
      hasAttachedImage,
      submitPoint
    };
  }
  if (hasPostTitle) {
    return { name: 'composer', reason: 'post_title_visible', hasTargetText, hasAttachedImage, submitPoint };
  }

  // Facebook may keep the accessibility label "Close menu" in the composer
  // tree even when no blocking menu is visible. Only treat it as a menu after
  // composer/submit detection has failed.
  if (findNodeInNodes(nodes, closeMenuLabels)) {
    return { name: 'menu', reason: 'menu_overlay_visible_without_composer', hasTargetText };
  }

  if (findNodeInNodes(nodes, composerLabels)) return { name: 'home', reason: 'composer_entry_visible', hasTargetText, hasAttachedImage };
  if (findNodeInNodes(nodes, facebookHomeLabels)) return { name: 'home', reason: 'home_navigation_visible', hasTargetText, hasAttachedImage };

  return { name: 'unknown', reason: 'no_known_labels', hasTargetText, hasAttachedImage };
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
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await delay(attempt === 1 ? 700 : 1200);
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

function isTransientAdbFailure(message = '') {
  return /device offline|device ['"]?.+['"]? not found|no devices?\/emulators? found|closed|transport error|protocol fault/i.test(String(message));
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

async function closeFacebookMenuIfOpen(account, userId, target) {
  const match = await findVisibleTextBounds(target, closeMenuLabels);
  if (!match) {
    const auxiliaryMenu = await findVisibleTextBounds(target, auxiliaryMenuLabels);
    if (!auxiliaryMenu) return false;
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
  return {
    dialog,
    waitPoint: wait
      ? {
        x: Math.round((wait.left + wait.right) / 2),
        y: Math.round((wait.top + wait.bottom) / 2)
      }
      : null
  };
}

async function recoverSystemUiAnr(account, userId, target, state = {}) {
  let directRecovery = null;
  if (state.waitPoint?.x && state.waitPoint?.y) {
    directRecovery = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'input',
      'tap',
      String(state.waitPoint.x),
      String(state.waitPoint.y)
    ], { timeoutMs: 4_000 });
  }
  const keyboardRecovery = directRecovery?.ok
    ? { ok: true, method: 'direct_wait_tap', directRecovery }
    : await selectSystemUiWaitByKeyboard(target);
  invalidateUiDump(target);
  await writeLog(
    userId,
    account._id,
    keyboardRecovery.ok ? 'warn' : 'error',
    'system_ui_anr_recovery',
    keyboardRecovery.ok ? 'System UI không phản hồi; tool đã chọn Wait và tạm dừng để hệ thống hồi phục.' : 'Không xử lý được hộp thoại System UI không phản hồi.',
    { keyboardRecovery, directRecovery, dialog: state.dialog, waitPoint: state.waitPoint }
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
      const haystack = normalizeSearchText(`${node.text} ${node.desc}`);
      if (!haystack) continue;
      const matched = options.exact
        ? normalizedText === normalizedLabel || normalizedDesc === normalizedLabel || haystack === normalizedLabel
        : haystack.includes(normalizedLabel);
      if (!matched) continue;

      const match = { ...node.bounds, label, text: node.text, desc: node.desc };
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

function verifyCompleteCaption(nodes, text) {
  const expected = cleanClipboardText(text).trim();
  if (!expected) return { ok: true, missingText: [], missingHashtags: [], missingEmoji: [] };

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

  return {
    ok: missingText.length === 0
      && missingHashtags.length === 0
      && missingEmoji.length === 0
      && conflictingHashtags.length === 0,
    missingText,
    missingHashtags,
    missingEmoji,
    conflictingHashtags,
    actualHashtags,
    expectedHashtagCount: hashtags.length,
    expectedEmojiCount: emoji.length
  };
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

async function inputAndLog(userId, accountId, target, action, text, sensitive = false) {
  const result = await inputDeviceText(target, text, { sensitive });
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

  if (shouldUseUnicodePath) {
    const unicodeResult = await inputUnicodeText(target, value, options);
    if (unicodeResult.ok) return unicodeResult;
  }

  const pasteResult = await inputWithClipboardPaste(target, value);
  if (pasteResult.ok) return { ...pasteResult, method: 'clipboard_paste_ascii_first' };

  const fallback = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'text', cleanText(value)]);
  return {
    ...fallback,
    method: shouldUseUnicodePath ? 'input_text_ascii_fallback' : 'input_text',
    unicodeFallback: shouldUseUnicodePath
  };
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

async function replaceFocusedText(target, text) {
  const list = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'list', '-a'], { timeoutMs: 10_000 });
  if (!list.ok || !list.stdout.includes('com.android.adbkeyboard/.AdbIME')) {
    return { ok: false, method: 'adb_keyboard_replace', error: 'ADB Keyboard is not installed.' };
  }

  const current = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'settings', 'get', 'secure', 'default_input_method'], { timeoutMs: 10_000 });
  const previousIme = current.ok && current.stdout && current.stdout !== 'com.android.adbkeyboard/.AdbIME'
    ? current.stdout.trim()
    : 'com.android.inputmethod.pinyin/.InputService';
  const setIme = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME'], { timeoutMs: 10_000 });
  if (!setIme.ok) return { ...setIme, method: 'adb_keyboard_replace_set_ime' };

  let clear = { ok: false };
  let input = { ok: false };
  try {
    clear = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_CLEAR_TEXT'], { timeoutMs: 3_000 });
    const clearSent = clear.ok || /Broadcasting:\s+Intent/i.test(`${clear.stdout || ''}\n${clear.stderr || ''}`);
    const payload = Buffer.from(cleanClipboardText(text), 'utf8').toString('base64');
    input = clearSent
      ? await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', payload], { timeoutMs: 10_000 })
      : clear;
  } finally {
    await restoreInputMethod(target, previousIme);
  }

  return {
    ...input,
    method: 'adb_keyboard_replace',
    clearOk: clear.ok,
    clearSent: clear.ok || /Broadcasting:\s+Intent/i.test(`${clear.stdout || ''}\n${clear.stderr || ''}`),
    clearError: clear.ok ? '' : (clear.error || clear.stderr || '')
  };
}

async function inputWithAdbKeyboard(target, text) {
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
    const payload = Buffer.from(text, 'utf8').toString('base64');
    broadcast = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', payload], { timeoutMs: 10_000 });
  } finally {
    await restoreInputMethod(target, previousIme);
  }

  return { ...broadcast, method: 'adb_keyboard' };
}

async function restoreInputMethod(target, ime) {
  if (!ime || ime === 'com.android.adbkeyboard/.AdbIME') return null;
  const restored = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', ime], { timeoutMs: 10_000 });
  await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '4'], { timeoutMs: 3_000 });
  return restored;
}

async function inputWithClipboardPaste(target, text) {
  const setClipboard = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'cmd', 'clipboard', 'set', 'SocialPilot AI', text], { timeoutMs: 10_000 });
  const clipboardOutput = `${setClipboard.stdout || ''}\n${setClipboard.stderr || ''}`;
  if (!setClipboard.ok || /No shell command implementation|Unknown command|Can't find service|not found/i.test(clipboardOutput)) {
    return {
      ...setClipboard,
      ok: false,
      method: 'clipboard_set',
      error: setClipboard.error || setClipboard.stderr || setClipboard.stdout || 'Clipboard set is not supported.'
    };
  }

  const pasteKey = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '279'], { timeoutMs: 10_000 });
  if (pasteKey.ok) return { ...pasteKey, method: 'clipboard_paste' };

  const ctrlV = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keycombination', '113', '50'], { timeoutMs: 10_000 });
  return { ...ctrlV, method: 'clipboard_ctrl_v' };
}

async function inputWithClipperBroadcast(target, text) {
  const setClipper = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'clipper.set', '-e', 'text', text], { timeoutMs: 10_000 });
  if (!setClipper.ok || /Broadcast completed: result=0/i.test(setClipper.stdout)) {
    return { ...setClipper, ok: false, method: 'clipper_set', error: setClipper.error || setClipper.stderr || 'Clipper broadcast was not handled.' };
  }

  const pasteKey = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'keyevent', '279'], { timeoutMs: 10_000 });
  return { ...pasteKey, method: 'clipper_paste' };
}
