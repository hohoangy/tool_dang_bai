import { execFile } from 'child_process';
import { promisify } from 'util';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { MobileAccount } from '../../models/mobile-account.model.js';
import { MobileAccountLog } from '../../models/mobile-account-log.model.js';
import { getLocalUploadPath } from '../../utils/media-file.js';

const execFileAsync = promisify(execFile);
const localImageHashCache = new Map();
const facebookMediaRoot = '/sdcard/Pictures/SocialPilot';

const defaultPackages = {
  facebook: 'com.facebook.katana',
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
const removeImageLabels = ['Gỡ ảnh', 'Remove photo'];
const closeComposerLabels = ['Đóng', 'Close'];
const discardPostLabels = ['Bỏ bài viết', 'Discard post'];
const shareFeedLabels = ['Feed'];
const shareOnceLabels = ['JUST ONCE'];
const postTitleLabels = ['Bài viết mới', 'Bai viet moi', 'Create post'];
const textEditorLabels = ['Thêm văn bản', 'Them van ban', 'Add text'];
const loginBlockLabels = ['Log in', 'Đăng nhập', 'Dang nhap', 'Choose a way to confirm your account', 'Confirm your account', 'Session Expired'];
const facebookHomeLabels = ['Trang chủ', 'Trang chu', 'Home'];

const defaultAdbHost = '127.0.0.1:5555';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postStepDelay(multiplier = 1) {
  return Math.round(Math.max(140, Math.min(env.mobileAutomation.stepDelayMs, 260)) * multiplier);
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

async function runCommand(command, args, metadata = {}) {
  const startedAt = Date.now();
  const executable = resolveExecutable(command);
  if (!executable) return missingExecutableResult(command, args, startedAt);

  try {
    const result = await execFileAsync(executable, args, {
      windowsHide: true,
      timeout: metadata.timeoutMs || 60_000,
      maxBuffer: 1024 * 1024
    });
    return {
      ok: true,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || ''
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      error: error.message
    };
  }
}

async function runBinaryCommand(command, args, metadata = {}) {
  const startedAt = Date.now();
  const executable = resolveExecutable(command);
  if (!executable) return missingExecutableResult(command, args, startedAt, Buffer.alloc(0));

  try {
    const result = await execFileAsync(executable, args, {
      windowsHide: true,
      timeout: metadata.timeoutMs || 60_000,
      maxBuffer: metadata.maxBuffer || 8 * 1024 * 1024,
      encoding: 'buffer'
    });
    return {
      ok: true,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: result.stdout,
      stderr: result.stderr?.toString('utf8').trim() || ''
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: error.stdout,
      stderr: error.stderr?.toString('utf8').trim() || '',
      error: error.message
    };
  }
}

function resolveExecutable(command) {
  if (!command) return null;
  if (command.includes('\\') || command.includes('/')) return existsSync(command) ? command : null;

  const lower = command.toLowerCase();
  const candidates = [];
  const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA, process.env.ProgramData].filter(Boolean);

  if (lower === 'adb' || lower === 'adb.exe') {
    candidates.push(
      ...programFiles.flatMap((base) => [
        path.join(base, 'Android', 'android-sdk', 'platform-tools', 'adb.exe'),
        path.join(base, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
        path.join(base, 'LDPlayer', 'LDPlayer9', 'adb.exe'),
        path.join(base, 'LDPlayer9', 'adb.exe'),
        path.join(base, 'leidian', 'LDPlayer9', 'adb.exe'),
        path.join(base, 'dnplayerext2', 'adb.exe')
      ]),
      'C:\\LDPlayer\\LDPlayer9\\adb.exe',
      'D:\\LDPlayer\\LDPlayer9\\adb.exe',
      'E:\\LDPlayer\\LDPlayer9\\adb.exe',
      'C:\\leidian\\LDPlayer9\\adb.exe',
      'D:\\leidian\\LDPlayer9\\adb.exe',
      'E:\\leidian\\LDPlayer9\\adb.exe'
    );
  } else if (lower === 'ldconsole' || lower === 'ldconsole.exe') {
    candidates.push(
      ...programFiles.flatMap((base) => [
        path.join(base, 'LDPlayer', 'LDPlayer9', 'ldconsole.exe'),
        path.join(base, 'LDPlayer9', 'ldconsole.exe'),
        path.join(base, 'leidian', 'LDPlayer9', 'ldconsole.exe')
      ]),
      'C:\\LDPlayer\\LDPlayer9\\ldconsole.exe',
      'D:\\LDPlayer\\LDPlayer9\\ldconsole.exe',
      'E:\\LDPlayer\\LDPlayer9\\ldconsole.exe',
      'C:\\leidian\\LDPlayer9\\ldconsole.exe',
      'D:\\leidian\\LDPlayer9\\ldconsole.exe',
      'E:\\leidian\\LDPlayer9\\ldconsole.exe'
    );
  } else {
    candidates.push(command);
  }

  return candidates.find((candidate) => existsSync(candidate)) || (lower === 'adb' || lower === 'adb.exe' || lower === 'ldconsole' || lower === 'ldconsole.exe' ? null : command);
}

function missingExecutableResult(command, args, startedAt, stdout = '') {
  const executable = command.toLowerCase().includes('adb') ? 'adb.exe' : command;
  return {
    ok: false,
    command,
    args,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr: '',
    error: `Không tìm thấy ${executable}. Hãy cài LDPlayer hoặc cập nhật ADB_PATH/LDCONSOLE_PATH trong file .env.`
  };
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
  let result = await runCommand(env.mobileAutomation.ldconsolePath, ['launch', '--name', account.instanceName]);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_launch_ldplayer', result.ok ? 'Đã mở LDPlayer.' : 'Mở LDPlayer lỗi.', result);
  if (result.ok) {
    await delay(env.mobileAutomation.launchWaitMs);
  }
  const startServer = await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
  await writeLog(userId, account._id, startServer.ok ? 'info' : 'warn', 'remote_adb_start_server', startServer.ok ? 'ADB server đã sẵn sàng.' : 'Không khởi động được ADB server.', startServer);
  if (account.adbHost) {
    const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', account.adbHost]);
    await writeLog(userId, account._id, connect.ok ? 'info' : 'error', 'remote_adb_connect', connect.ok ? `Đã nối ADB ${account.adbHost}.` : `Nối ADB lỗi ${account.adbHost}.`, connect);
    return { launch: result, connect };
  }
  return { launch: result, connect: null, startServer };
}

async function getLdPlayerDeviceTarget(instanceName = '') {
  if (!instanceName) return '';
  const list = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 10_000 });
  if (!list.ok || !list.stdout) return '';
  const row = list.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(','))
    .find((parts) => parts[1]?.trim() === instanceName);
  const index = Number(row?.[0]);
  if (!Number.isInteger(index) || index < 0) return '';
  return `emulator-${5554 + (index * 2)}`;
}

async function ensureDeviceReady(account, userId, target, attempts = 8) {
  let lastState = null;
  await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 10_000 });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], { timeoutMs: 10_000 });
    lastState = state;
    if (state.ok && String(state.stdout || '').trim() === 'device') {
      if (attempt > 1) {
        await writeLog(userId, account._id, 'info', 'adb_ready_after_retry', `ADB ${target} đã sẵn sàng sau ${attempt} lần kiểm tra.`, state);
      }
      return state;
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
  const nodes = await dumpVisibleNodes(target);
  const width = nodes.reduce((max, node) => Math.max(max, node.bounds?.right || 0), 0);
  const height = nodes.reduce((max, node) => Math.max(max, node.bounds?.bottom || 0), 0);
  if (width > 0 && height > 0) {
    return { width, height, source: 'ui_hierarchy' };
  }

  const result = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'wm',
    'size'
  ], { timeoutMs: 10_000 });
  const match = String(result.stdout || '').match(/(?:Override|Physical) size:\s*(\d+)x(\d+)/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    source: 'wm_size'
  };
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
  const rotate = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'settings',
    'put',
    'system',
    'user_rotation',
    '1'
  ], { timeoutMs: 10_000 });
  await delay(1200);
  const after = await getDeviceScreenSize(target);
  await writeLog(userId, account._id, rotate.ok ? 'info' : 'warn', 'facebook_post_portrait_orientation', rotate.ok ? 'Đã chuẩn hóa LDPlayer về màn hình dọc.' : 'Không khóa được hướng màn hình dọc.', {
    before,
    after,
    lock,
    rotate
  });
  return { ok: lock.ok && rotate.ok, changed: true, before, after };
}

export async function openAccountApp(account, userId, appPackage) {
  let target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!packageName) throw new Error('Thiếu Android package name.');

  let ready = await ensureDeviceReady(account, userId, target, 2);
  if (!ready.ok || ready.stdout !== 'device') {
    await writeLog(userId, account._id, 'warn', 'remote_open_app_launch_retry', `ADB ${target} chưa sẵn sàng, thử khởi động lại LDPlayer trước khi mở app.`);
    await openLdPlayer(account, userId);
    target = await getLdPlayerDeviceTarget(account.instanceName) || target;
    ready = await ensureDeviceReady(account, userId, target, 40);
  }
  if (!ready.ok || String(ready.stdout || '').trim() !== 'device') {
    throw new Error(ready.error || ready.stderr || `ADB ${target} chưa sẵn sàng.`);
  }

  let result = packageName === defaultPackages.facebook
    ? await launchFacebookFresh(target, packageName)
    : await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  if (!result.ok && /offline|not found|no devices/i.test(`${result.error || ''} ${result.stderr || ''}`)) {
    const retryReady = await ensureDeviceReady(account, userId, target, 4);
    if (retryReady.ok && retryReady.stdout === 'device') {
      result = packageName === defaultPackages.facebook
        ? await launchFacebookFresh(target, packageName)
        : await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
    }
  }
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_open_app', result.ok ? `Đã mở app ${packageName}.` : `Mở app lỗi ${packageName}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Open app failed.');
  let home = null;
  if (packageName === defaultPackages.facebook) {
    home = await ensureFacebookHomeOnOpen(account, userId, target, packageName);
  }
  return { ...result, home };
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

async function ensureFacebookHomeOnOpen(account, userId, target, packageName) {
  await delay(1200);
  let state = await detectFacebookState(target, '');
  if (state.name === 'blocked') {
    throw new Error('Facebook đang yêu cầu đăng nhập hoặc xác minh tài khoản.');
  }
  if (state.name === 'home') {
    await writeLog(userId, account._id, 'info', 'remote_open_facebook_home', 'Facebook đã sẵn sàng tại trang chủ.', { state });
    return { ok: true, verified: true, state };
  }

  if (state.name === 'discard_dialog') {
    await tapTextOrPoint(account, userId, target, discardPostLabels, { x: 450, y: 1460 }, 'remote_open_app_discard_draft', { exact: true });
    await delay(500);
  }

  const screen = await getDeviceScreenSize(target);
  const homePoint = {
    x: Math.round((screen?.width || 900) / 12),
    y: Math.round((screen?.height || 1600) * 0.085)
  };
  const active = await getForegroundAndroidPackage(target);
  if (active.packageName === packageName) {
    await tapAndLog(userId, account._id, target, 'remote_open_facebook_home_tab', homePoint);
    await delay(900);
    state = await detectFacebookState(target, '');
  }

  const verified = state.name === 'home';
  await writeLog(
    userId,
    account._id,
    verified ? 'info' : 'warn',
    'remote_open_facebook_home',
    verified ? 'Facebook đã sẵn sàng tại trang chủ.' : 'Facebook đã mở; chưa đọc được nhãn trang chủ.',
    { state, active, homePoint }
  );
  if (state.name === 'blocked') {
    throw new Error('Facebook đang yêu cầu đăng nhập hoặc xác minh tài khoản.');
  }
  if (active.packageName !== packageName) {
    throw new Error('Facebook chưa mở thành công trên LDPlayer.');
  }
  return { ok: true, verified, state };
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
  const target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  const result = {
    app: null,
    ldplayer: null
  };

  if (target && packageName) {
    const app = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 });
    result.app = app;
    await writeLog(userId, account._id, app.ok ? 'info' : 'warn', 'remote_close_app', app.ok ? `Đã đóng app ${packageName}.` : `Không đóng được app ${packageName}.`, app);
  }

  if (account.instanceName) {
    const ldplayer = await runCommand(env.mobileAutomation.ldconsolePath, ['quit', '--name', account.instanceName], { timeoutMs: 10_000 });
    result.ldplayer = ldplayer;
    await writeLog(userId, account._id, ldplayer.ok ? 'info' : 'warn', 'remote_close_ldplayer', ldplayer.ok ? `Đã tắt ${account.instanceName}.` : `Không tắt được ${account.instanceName}.`, ldplayer);
  }

  return result;
}

export async function remoteTap(account, userId, x, y) {
  const target = getDeviceTarget(account);
  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_tap', result.ok ? `Tap ${Math.round(x)},${Math.round(y)}.` : 'Tap lỗi.', result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Tap failed.');
  return result;
}

export async function remoteSwipe(account, userId, fromX, fromY, toX, toY, duration = 350) {
  const target = getDeviceTarget(account);
  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'swipe', String(Math.round(fromX)), String(Math.round(fromY)), String(Math.round(toX)), String(Math.round(toY)), String(duration)]);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_swipe', result.ok ? 'Đã swipe màn hình.' : 'Swipe lỗi.', result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Swipe failed.');
  return result;
}

export async function remoteText(account, userId, text) {
  const target = getDeviceTarget(account);
  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  const result = await inputDeviceText(target, text);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_text', result.ok ? 'Đã nhập text vào LDPlayer.' : 'Nhập text lỗi.', {
    ...result,
    args: ['-s', target, 'shell', result.method || 'input_text', '***']
  });
  if (!result.ok) throw new Error(result.error || result.stderr || 'Input text failed.');
  return result;
}

export async function remoteKey(account, userId, key) {
  const target = getDeviceTarget(account);
  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
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

async function writeLog(userId, accountId, level, action, message, metadata = {}) {
  return MobileAccountLog.create({ userId, accountId, level, action, message, metadata });
}

function getDeviceTarget(account) {
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
    waitAfterSubmitMs: Math.max(0, Math.min(Number(override.waitAfterSubmitMs) || 0, 60_000))
  };
}

export function encryptSecret(value = '') {
  if (!value) return '';
  if (String(value).startsWith('enc:v1:')) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

export function decryptSecret(value = '') {
  if (!value) return '';
  if (!String(value).startsWith('enc:v1:')) return value;
  const payload = Buffer.from(String(value).slice('enc:v1:'.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function getSecretKey() {
  return createHash('sha256').update(env.mobileAutomation.secret).digest();
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
  const target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  if (!target) {
    return {
      target: '',
      deviceReady: false,
      appReady: false,
      foregroundPackage: ''
    };
  }

  const device = await runCommand(
    env.mobileAutomation.adbPath,
    ['-s', target, 'get-state'],
    { timeoutMs: 5_000 }
  );
  const deviceReady = device.ok && String(device.stdout || '').trim() === 'device';
  if (!deviceReady) {
    return {
      target,
      deviceReady: false,
      appReady: false,
      foregroundPackage: ''
    };
  }

  const foreground = await getForegroundAndroidPackage(target);
  return {
    target,
    deviceReady: true,
    appReady: Boolean(packageName) && foreground.packageName === packageName,
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
  let target = getDeviceTarget(account);
  const config = buildPostConfig(account, {
    appPackage: payload.appPackage || defaultPackages.facebook,
    composerTap: payload.composerTap,
    autoSubmit: payload.autoSubmit,
    waitAfterSubmitMs: payload.waitAfterSubmitMs
  });
  const text = cleanIntentText(payload.text);
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 4) : [];

  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!text.trim()) throw new Error('Thiếu nội dung bài đăng.');
  if (!config.appPackage) throw new Error('Thiếu Android package name của Facebook.');

  await writeLog(userId, account._id, 'info', 'facebook_post_started', `Bắt đầu mở composer Facebook cho ${account.displayName}.`, {
    target,
    appPackage: config.appPackage,
    autoSubmit: config.autoSubmit,
    imageCount: images.length
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
  if (!device.ok || String(device.stdout || '').trim() !== 'device') {
    await writeLog(userId, account._id, 'warn', 'facebook_post_launch_retry', `ADB ${target} chưa sẵn sàng, tự mở LDPlayer trước khi đăng.`);
    await openLdPlayer(account, userId);
    const launchedTarget = await getLdPlayerDeviceTarget(account.instanceName);
    target = await resolveStableDeviceTarget(launchedTarget || getDeviceTarget(account) || target);
    device = await ensureDeviceReady(account, userId, target, 28);
    if (!device.ok || String(device.stdout || '').trim() !== 'device') {
      await writeLog(userId, account._id, 'warn', 'facebook_post_launch_second_retry', `${account.instanceName} chưa sẵn sàng, thử khởi động lại lần cuối.`);
      await delay(2500);
      await openLdPlayer(account, userId);
      const retriedTarget = await getLdPlayerDeviceTarget(account.instanceName);
      target = await resolveStableDeviceTarget(retriedTarget || target);
      device = await ensureDeviceReady(account, userId, target, 24);
    }
  }
  steps.push(device);
  if (!device.ok || String(device.stdout || '').trim() !== 'device') throw new Error(device.error || device.stderr || 'Device is not ready.');

  const orientation = await ensurePortraitOrientation(account, userId, target);
  steps.push(orientation);

  let preparedImages = [];
  try {
    let openHome = null;
    if (images.length > 1) {
      const pipelineStartedAt = Date.now();
      [preparedImages, openHome] = await Promise.all([
        prepareFacebookImages(account, userId, target, images),
        openFacebookComposer(account, userId, target, config, text, [])
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
    } else if (images.length === 1) {
      preparedImages = await prepareFacebookImages(account, userId, target, images);
      openHome = await openFacebookComposer(account, userId, target, config, text, preparedImages);
    } else {
      openHome = await openFacebookComposer(account, userId, target, config, text, []);
    }
    for (const preparedImage of preparedImages) steps.push(...preparedImage.steps);
    steps.push(openHome);
    await delay(postStepDelay());

    const stateMachine = await runFacebookPostStateMachine(
      account,
      userId,
      target,
      config,
      text,
      preparedImages,
      { imageSharedByIntent: openHome.method === 'image_share_intent' }
    );
    steps.push(...stateMachine.steps);

    const submitVerified = stateMachine.submitVerified ?? false;
    const finishedLevel = config.autoSubmit && !submitVerified ? 'warn' : 'info';
    await writeLog(userId, account._id, finishedLevel, 'facebook_post_finished', config.autoSubmit && !submitVerified ? 'Đã bấm Đăng nhưng chưa xác nhận Facebook đã nhận bài.' : (config.autoSubmit ? 'Đã chạy luồng tự đăng Facebook.' : 'Đã mở composer Facebook, chờ kiểm tra/tự bấm đăng.'), {
      autoSubmit: config.autoSubmit,
      finalState: stateMachine.finalState,
      submitVerified,
      submitReason: stateMachine.submitReason || '',
      imageCount: preparedImages.length
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
      stepCount: steps.length
    };
  } finally {
    if (images.length > 0 && config.autoSubmit) {
      await cleanupFacebookMediaLibrary(account, userId, target, 'after_publish').catch(() => null);
    }
  }
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

async function openFacebookComposer(account, userId, target, config, text, images = []) {
  const stop = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'am',
    'force-stop',
    config.appPackage
  ]);
  await writeLog(userId, account._id, stop.ok ? 'info' : 'warn', 'facebook_post_reset_app_task', stop.ok ? 'Đã đóng task Facebook cũ trước khi mở composer mới.' : 'Không đóng được task Facebook cũ.', stop);
  await delay(postStepDelay());

  // Facebook hides the gallery action after receiving an image through a share
  // intent. Use that fast path only for one image; multi-image posts must start
  // from a clean text composer and select all media from Facebook's gallery.
  const primaryImage = images.length === 1 ? images[0] : null;
  const intentType = primaryImage?.mimeType || 'text/plain';
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
  if (primaryImage?.remotePath) {
    intentArgs.push(
      '--grant-read-uri-permission',
      '--eu',
      'android.intent.extra.STREAM',
      primaryImage.contentUri || `file://${primaryImage.remotePath}`
    );
  }
  intentArgs.push(
    '-n',
    `${config.appPackage}/com.facebook.composer.shareintent.ImplicitShareIntentHandlerDefaultAlias`
  );

  const shareIntent = await runCommand(env.mobileAutomation.adbPath, intentArgs);

  if (shareIntent.ok) {
    if (shareIntent.stderr && /error:/i.test(shareIntent.stderr)) {
      return openFacebookHome(account, userId, target, config, shareIntent);
    }

    await writeLog(userId, account._id, 'info', 'facebook_post_open_share_composer', 'Đã mở Facebook composer bằng Android share intent để giữ Unicode.', {
      ...shareIntent,
      args: maskShareIntentArgs(intentArgs)
    });
    return { ...shareIntent, method: primaryImage ? 'image_share_intent' : 'text_share_intent' };
  }

  return openFacebookHome(account, userId, target, config, shareIntent);
}

async function cleanupFacebookMediaLibrary(account, userId, target, reason) {
  const steps = [];
  const query = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'content',
    'query',
    '--uri',
    'content://media/external/images/media',
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

  const mediaDeletes = await Promise.all(mediaIds.map((mediaId) => runCommand(
    env.mobileAutomation.adbPath,
    [
      '-s',
      target,
      'shell',
      'content',
      'delete',
      '--uri',
      'content://media/external/images/media',
      '--where',
      `_id=${mediaId}`
    ],
    { timeoutMs: 10_000 }
  )));
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

  const mediaStoreOk = !query.ok || mediaDeletes.every((result) => result.ok);
  const ok = removeFiles.ok;
  await writeLog(
    userId,
    account._id,
    'info',
    'facebook_post_media_cleanup',
    ok
      ? 'Đã dọn ảnh tạm của phiên đăng khỏi LDPlayer.'
      : 'Không xóa được thư mục ảnh tạm; tool sẽ thử lại trước phiên đăng tiếp theo.',
    {
      reason,
      deletedMediaRows: mediaIds.length,
      mediaStoreOk,
      removeFiles: {
        ok: removeFiles.ok,
        stderr: removeFiles.stderr,
        error: removeFiles.error
      }
    }
  );

  return { ok, steps, deletedMediaRows: mediaIds.length };
}

async function prepareFacebookMediaSession(account, userId, target) {
  const steps = [];
  const storageReady = await ensureAndroidStorageReady(account, userId, target);
  steps.push(storageReady);
  if (!storageReady.ok) throw new Error(storageReady.error);

  const cleanup = await cleanupFacebookMediaLibrary(account, userId, target, 'before_publish');
  steps.push(...cleanup.steps);
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

  const grantRead = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'pm',
    'grant',
    'com.facebook.katana',
    'android.permission.READ_EXTERNAL_STORAGE'
  ]);
  const grantWrite = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'pm',
    'grant',
    'com.facebook.katana',
    'android.permission.WRITE_EXTERNAL_STORAGE'
  ]);
  steps.push(grantRead, grantWrite);

  return { remoteDir, steps };
}

async function prepareFacebookImages(account, userId, target, images) {
  const mediaSession = await prepareFacebookMediaSession(account, userId, target);
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
    mediaQuery = await runCommand(env.mobileAutomation.adbPath, [
      '-s',
      target,
      'shell',
      'content',
      'query',
      '--uri',
      'content://media/external/images/media',
      '--projection',
      '_id:_data'
    ]);
    steps.push(mediaQuery);
    const mediaRow = mediaQuery.ok
      ? String(mediaQuery.stdout || '').split(/\r?\n/).find((row) => row.includes(remotePath))
      : '';
    const mediaId = mediaRow?.match(/_id=(\d+)/)?.[1] || null;
    contentUri = mediaId ? `content://media/external/images/media/${mediaId}` : '';
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

async function findAndroidMediaByPath(target, remotePath) {
  const query = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'content',
    'query',
    '--uri',
    'content://media/external/images/media',
    '--projection',
    '_id:_data'
  ]);
  const mediaRow = query.ok
    ? String(query.stdout || '').split(/\r?\n/).find((row) => row.includes(remotePath))
    : '';
  const mediaId = mediaRow?.match(/_id=(\d+)/)?.[1] || null;
  return {
    query,
    contentUri: mediaId ? `content://media/external/images/media/${mediaId}` : ''
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
      'Ảnh đã được chuyển trực tiếp vào Facebook composer.',
      {
        requestedCount: imageCount,
        method: 'android_share_intent',
        contentUri: images[0]?.contentUri || ''
      }
    );
  }

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const state = await detectFacebookState(target, text);
    if (state.hasTargetText) textEntered = true;
    finalState = state.name;
    await writeLog(userId, account._id, 'info', 'facebook_post_state', `Facebook state: ${state.name}.`, {
      attempt,
      reason: state.reason,
      hasAttachedImage: Boolean(state.hasAttachedImage),
      observedText: state.observedText || ''
    });

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

      const submitted = await submitFacebookPost(account, userId, target, config, text, steps, 'facebook_post_submit_tap', imageCount);
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
        const submitted = await submitFacebookPost(account, userId, target, config, text, steps, 'facebook_post_submit_from_composer', imageCount);
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

async function submitFacebookPost(account, userId, target, config, text, steps, action, imageCount = 0) {
  await delay(postStepDelay());
  const submitAttempts = await buildSubmitTapAttempts(target);
  let submitAccepted = false;

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

    await delay(900);
    const nodes = await dumpVisibleNodes(target);
    const progress = findNodeInNodes(nodes, postingProgressLabels);
    const confirmation = findNodeInNodes(nodes, postedConfirmationLabels);
    const submitStillVisible = findNodeInNodes(nodes, submitLabels, { exact: true, preferBottomRight: true });
    if (progress || confirmation || !submitStillVisible) {
      submitAccepted = true;
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_accepted', 'Facebook đã nhận thao tác bấm nút đăng.', {
        attempt: index + 1,
        method: attempt.method,
        point: attempt.point,
        progress,
        confirmation
      });
      break;
    }

    await writeLog(userId, account._id, 'warn', 'facebook_post_submit_retry', 'Nút đăng vẫn còn hiển thị, thử bấm lại.', {
      attempt: index + 1,
      point: attempt.point,
      method: attempt.method,
      matchedSubmit: submitStillVisible
    });
    await delay(postStepDelay());
  }

  const verification = await verifyFacebookPostSubmit(account, userId, target, text, config.waitAfterSubmitMs, imageCount);
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
    { method: 'semantic_button', point: submitPoint },
    { method: 'semantic_button_retry', point: submitPoint }
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

async function verifyFacebookPostSubmit(account, userId, target, text, waitAfterSubmitMs = 0, imageCount = 0) {
  let lastState = null;
  const verificationWindowMs = Math.max(8_000, waitAfterSubmitMs || 0);
  const verificationStartedAt = Date.now();
  const verificationDeadline = verificationStartedAt + verificationWindowMs;
  const uploadDeadline = verificationStartedAt + Math.max(verificationWindowMs, imageCount > 0 ? 120_000 : 30_000);
  let sawPostingProgress = false;
  if (waitAfterSubmitMs > 0) {
    await writeLog(userId, account._id, 'info', 'facebook_post_submit_grace_period', `Xác minh kết quả đăng trong tối đa ${Math.round(verificationWindowMs / 1000)} giây.`, {
      waitAfterSubmitMs,
      verificationWindowMs,
      mode: 'adaptive_maximum'
    });
  }

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    await delay(attempt === 1 ? 900 : 1_000);
    const nodes = await dumpVisibleNodes(target);
    const confirmation = findNodeInNodes(nodes, postedConfirmationLabels);
    if (confirmation) {
      const screenshot = await captureScreenshot(account, userId, 'facebook_post_submit_verified');
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_verified', `Đã xác nhận Facebook nhận bài qua text "${confirmation.label}".`, {
        attempt,
        confirmation
      });
      return { ok: true, reason: 'confirmation_label', screenshot, composerPending: false, finalState: 'submitted' };
    }

    const progress = findNodeInNodes(nodes, postingProgressLabels);
    if (progress) {
      if (!sawPostingProgress) {
        await writeLog(userId, account._id, 'info', 'facebook_post_media_uploading', imageCount > 0 ? `Facebook đang tải ${imageCount} ảnh và đăng bài.` : 'Facebook đang xử lý bài đăng.', {
          attempt,
          progress,
          imageCount
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
      const screenshot = await captureScreenshot(account, userId, 'facebook_post_submit_verified');
      const reason = sawPostingProgress ? 'upload_completed_after_progress' : 'composer_closed_after_submit';
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_verified', sawPostingProgress ? 'Facebook đã tải ảnh xong và hoàn tất đăng bài.' : 'Facebook đã rời màn soạn bài sau khi bấm Đăng.', {
        attempt,
        elapsedMs: Date.now() - verificationStartedAt,
        imageCount,
        sawPostingProgress,
        state: lastState
      });
      return { ok: true, reason, screenshot, composerPending: false, finalState: 'submitted' };
    }

    if (Date.now() < verificationDeadline) {
      await writeLog(userId, account._id, 'info', 'facebook_post_submit_waiting', 'Facebook vẫn đang hoàn tất đăng bài.', {
        attempt,
        elapsedMs: Date.now() - verificationStartedAt,
        state: lastState
      });
      continue;
    }

    await writeLog(userId, account._id, 'warn', 'facebook_post_submit_still_in_composer', 'Hết thời gian xác minh nhưng Facebook vẫn ở màn soạn bài.', {
      attempt,
      elapsedMs: Date.now() - verificationStartedAt,
      state: lastState
    });
    return { ok: false, reason: 'still_in_composer', screenshot: null, composerPending: true, finalState: lastState.name };
  }

  const screenshot = await captureScreenshot(account, userId, 'facebook_post_submit_unverified');
  const returnedHome = lastState?.name === 'home';
  await writeLog(userId, account._id, returnedHome ? 'info' : 'warn', returnedHome ? 'facebook_post_submit_verified' : 'facebook_post_submit_unverified', returnedHome ? 'Đã xác nhận Facebook rời composer sau khi bấm Đăng.' : 'Đã bấm Đăng nhưng không thấy tín hiệu xác nhận bài đã được Facebook nhận.', {
    state: lastState
  });
  return {
    ok: returnedHome,
    reason: returnedHome ? 'returned_home_without_confirmation' : 'no_confirmation_after_submit',
    screenshot,
    composerPending: false,
    finalState: returnedHome ? 'submitted' : (lastState?.name || 'submit_unverified')
  };
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
  if (findNodeInNodes(nodes, shareFeedLabels, { exact: true }) && findNodeInNodes(nodes, shareOnceLabels, { exact: true })) {
    return { name: 'share_chooser', reason: 'android_share_target_picker', hasTargetText };
  }
  if (findNodeInNodes(nodes, discardPostLabels, { exact: true })) {
    return { name: 'discard_dialog', reason: 'discard_post_visible', hasTargetText };
  }
  if (findNodeInNodes(nodes, loginBlockLabels)) return { name: 'blocked', reason: 'login_or_checkpoint', hasTargetText };
  if (findNodeInNodes(nodes, closeMenuLabels)) return { name: 'menu', reason: 'menu_overlay_visible', hasTargetText };

  const doneNode = findNodeInNodes(nodes, doneLabels, { exact: true });
  const hasDone = Boolean(doneNode && doneNode.top < 180);
  const hasTextEditor = Boolean(findNodeInNodes(nodes, textEditorLabels));
  if (hasDone || hasTextEditor) return { name: 'text_editor', reason: hasDone ? 'done_visible' : 'text_editor_title', hasTargetText };

  const hasPostTitle = Boolean(findNodeInNodes(nodes, postTitleLabels));
  const hasSubmit = Boolean(findNodeInNodes(nodes, submitLabels, { exact: true }));
  const hasAttachedImage = Boolean(findNodeInNodes(nodes, attachedImageLabels));
  const observedText = nodes.find((node) => node.className.includes('EditText') && normalizeSearchText(node.text))?.text || '';
  const hasComposerText = Boolean(observedText);
  if (hasSubmit && (hasTargetText || hasComposerText || hasAttachedImage)) {
    return { name: 'ready_to_post', reason: 'submit_visible_without_title', hasTargetText, hasAttachedImage, observedText };
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
    return { name: 'ready_to_post', reason: hasSubmit ? 'submit_visible' : 'post_title_with_text', hasTargetText, hasAttachedImage };
  }
  if (hasPostTitle) return { name: 'composer', reason: 'post_title_visible', hasTargetText, hasAttachedImage };

  if (findNodeInNodes(nodes, composerLabels)) return { name: 'home', reason: 'composer_entry_visible', hasTargetText, hasAttachedImage };
  if (findNodeInNodes(nodes, facebookHomeLabels)) return { name: 'home', reason: 'home_navigation_visible', hasTargetText, hasAttachedImage };

  return { name: 'unknown', reason: 'no_known_labels', hasTargetText, hasAttachedImage };
}

const jobs = new Map();

export function createMobileLoginJob({ userId, accountIds, override = {}, retries = 1 }) {
  const id = randomUUID();
  const job = {
    id,
    userId,
    accountIds,
    override,
    retries,
    status: 'queued',
    currentAccountId: null,
    total: accountIds.length,
    completed: 0,
    failed: 0,
    results: [],
    cancelRequested: false,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(id, job);
  void runJob(job);
  return serializeJob(job);
}

export function getMobileLoginJob(id, userId) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  return serializeJob(job);
}

export function cancelMobileLoginJob(id, userId) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  if (['queued', 'running'].includes(job.status)) {
    job.cancelRequested = true;
    job.status = 'canceling';
    touchJob(job);
  }
  return serializeJob(job);
}

async function runJob(job) {
  job.status = 'running';
  touchJob(job);

  for (const accountId of job.accountIds) {
    if (job.cancelRequested) {
      job.status = 'canceled';
      touchJob(job);
      return;
    }

    job.currentAccountId = accountId;
    touchJob(job);
    const account = await MobileAccount.findOne({ _id: accountId, userId: job.userId });
    if (!account) {
      job.failed += 1;
      job.results.push({ accountId, ok: false, error: 'Account not found.' });
      touchJob(job);
      continue;
    }

    let lastError = null;
    for (let attempt = 1; attempt <= job.retries + 1; attempt += 1) {
      if (job.cancelRequested) break;
      try {
        await writeLog(job.userId, account._id, 'info', 'job_attempt', `Chạy đăng nhập lần ${attempt}.`, {
          jobId: job.id,
          attempt
        });
        const result = await runMobileLogin(account, job.userId, job.override);
        job.completed += 1;
        job.results.push({ accountId, ok: true, attempt, account: sanitizeAccount(result.account) });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await captureScreenshot(account, job.userId, `failed_attempt_${attempt}`);
        await writeLog(job.userId, account._id, 'error', 'job_attempt_failed', error.message, {
          jobId: job.id,
          attempt
        });
        if (attempt <= job.retries) await delay(1500);
      }
    }

    if (lastError) {
      account.status = 'error';
      await account.save();
      job.failed += 1;
      job.results.push({ accountId, ok: false, error: lastError.message });
    }
    touchJob(job);
  }

  job.currentAccountId = null;
  job.status = job.failed > 0 ? 'completed_with_errors' : 'completed';
  touchJob(job);
}

function touchJob(job) {
  job.updatedAt = new Date().toISOString();
}

function serializeJob(job) {
  return {
    id: job.id,
    status: job.status,
    currentAccountId: job.currentAccountId,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    results: job.results,
    cancelRequested: job.cancelRequested,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function sanitizeAccount(account) {
  if (!account) return account;
  const output = account.toJSON ? account.toJSON() : { ...account };
  if (output.metadata?.password) output.metadata = { ...output.metadata, password: '' };
  return output;
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
  await writeLog(userId, accountId, result.ok ? 'info' : 'error', action, result.ok ? `Tap ${point.x},${point.y}.` : `Tap lỗi ${point.x},${point.y}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || `${action} failed.`);
  await delay(action.startsWith('facebook_post') ? postStepDelay() : env.mobileAutomation.stepDelayMs);
  return result;
}

function isTransientAdbFailure(message = '') {
  return /device offline|device ['"]?.+['"]? not found|no devices?\/emulators? found|closed|transport error|protocol fault/i.test(String(message));
}

async function tapTextOrPoint(account, userId, target, labels, fallbackPoint, action, options = {}) {
  const match = await findVisibleTextBounds(target, labels, options);
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
  const dumpArgs = ['-s', target, 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'];
  let dump = await runCommand(env.mobileAutomation.adbPath, dumpArgs, {
    timeoutMs: 10_000
  });
  if (!dump.ok && target.includes(':')) {
    await runCommand(env.mobileAutomation.adbPath, ['connect', target]);
    await delay(600);
    dump = await runCommand(env.mobileAutomation.adbPath, dumpArgs, { timeoutMs: 10_000 });
  }
  if (!dump.ok) return [];

  const xmlArgs = ['-s', target, 'shell', 'cat', '/sdcard/window.xml'];
  let xml = await runCommand(env.mobileAutomation.adbPath, xmlArgs, {
    timeoutMs: 10_000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (!xml.ok && target.includes(':')) {
    await runCommand(env.mobileAutomation.adbPath, ['connect', target]);
    await delay(600);
    xml = await runCommand(env.mobileAutomation.adbPath, xmlArgs, {
      timeoutMs: 10_000,
      maxBuffer: 2 * 1024 * 1024
    });
  }
  if (!xml.ok || !xml.stdout) return [];

  return (xml.stdout.match(/<node\b[^>]*>/g) || [])
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
  ].filter((item) => item.length >= 3);
  const haystack = nodes
    .map((node) => normalizeSearchText(`${node.text} ${node.desc}`))
    .join(' ');
  const compactHaystack = haystack.replace(/\s+/g, '');
  return snippets.some((snippet) => haystack.includes(snippet) || compactHaystack.includes(snippet.replace(/\s+/g, '')));
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
  return match?.[1] || '';
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
  await delay(action.startsWith('facebook_post') ? postStepDelay() : env.mobileAutomation.stepDelayMs);
  return result;
}

async function inputDeviceText(target, text, options = {}) {
  const value = cleanClipboardText(text);
  const shouldUseUnicodePath = hasUnicodeText(value) || value.includes('\n');

  if (shouldUseUnicodePath) {
    const unicodeResult = await inputUnicodeText(target, value, options);
    if (unicodeResult.ok) return unicodeResult;
  }

  const fallback = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'input', 'text', cleanText(value)]);
  return {
    ...fallback,
    method: shouldUseUnicodePath ? 'input_text_ascii_fallback' : 'input_text',
    unicodeFallback: shouldUseUnicodePath
  };
}

async function inputUnicodeText(target, text, options = {}) {
  const adbKeyboard = await inputWithAdbKeyboard(target, text);
  if (adbKeyboard.ok) return adbKeyboard;

  const clipboard = await inputWithClipboardPaste(target, text);
  if (clipboard.ok) return clipboard;

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
