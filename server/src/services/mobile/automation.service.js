import { execFile } from 'child_process';
import { promisify } from 'util';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { MobileAccount } from '../../models/mobile-account.model.js';
import { MobileAccountLog } from '../../models/mobile-account-log.model.js';
import { getLocalUploadPath } from '../../utils/media-file.js';

const execFileAsync = promisify(execFile);

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
  composerTap: { x: 390, y: 145 },
  submitTap: { x: 818, y: 1552 }
};

const composerLabels = [
  "What's on your mind?",
  'Bạn đang nghĩ gì?',
  'Ban dang nghi gi?',
  'Create post',
  'Tạo bài viết'
];

const submitLabels = ['Post', 'POST', 'Đăng', 'Dang'];
const closeMenuLabels = ['Đóng menu.', 'Dong menu.', 'Close menu'];
const doneLabels = ['Xong', 'Done'];
const galleryLabels = ['Thư viện', 'Ảnh/video', 'Photo/video', 'Gallery'];
const galleryPermissionLabels = ['Cho phép truy cập', 'Allow access'];
const galleryNextLabels = ['Tiếp', 'Next'];
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

const defaultAdbHost = '127.0.0.1:5555';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const result = await runCommand(env.mobileAutomation.ldconsolePath, ['launch', '--name', account.instanceName]);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_launch_ldplayer', result.ok ? 'Đã mở LDPlayer.' : 'Mở LDPlayer lỗi.', result);
  if (account.adbHost) {
    await delay(env.mobileAutomation.launchWaitMs);
    const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', account.adbHost]);
    await writeLog(userId, account._id, connect.ok ? 'info' : 'error', 'remote_adb_connect', connect.ok ? `Đã nối ADB ${account.adbHost}.` : `Nối ADB lỗi ${account.adbHost}.`, connect);
    return { launch: result, connect };
  }
  return { launch: result, connect: null };
}

export async function openAccountApp(account, userId, appPackage) {
  const target = getDeviceTarget(account);
  const packageName = appPackage || account.metadata?.appPackage || defaultPackages[account.platform];
  if (!target) throw new Error('Thiếu deviceId hoặc adbHost.');
  if (!packageName) throw new Error('Thiếu Android package name.');
  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  await writeLog(userId, account._id, result.ok ? 'info' : 'error', 'remote_open_app', result.ok ? `Đã mở app ${packageName}.` : `Mở app lỗi ${packageName}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || 'Open app failed.');
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
    submitTap: override.submitTap || metadata.postSteps?.submitTap || defaultPostSteps.submitTap,
    autoSubmit: Boolean(override.autoSubmit)
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
    submitTap: payload.submitTap,
    autoSubmit: payload.autoSubmit
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
  const device = await probeDevice(account, userId, target);
  steps.push(device);
  if (!device.ok || device.stdout !== 'device') throw new Error(device.error || device.stderr || 'Device is not ready.');

  const preparedImages = [];
  for (const image of [...images].reverse()) {
    const preparedImage = await pushFacebookImage(account, userId, target, image);
    preparedImages.push(preparedImage);
    steps.push(...preparedImage.steps);
  }

  const openHome = await openFacebookComposer(account, userId, target, config, text, preparedImages);
  steps.push(openHome);
  await delay(env.mobileAutomation.stepDelayMs);

  const stateMachine = await runFacebookPostStateMachine(account, userId, target, config, text, preparedImages);
  steps.push(...stateMachine.steps);

  await writeLog(userId, account._id, 'info', 'facebook_post_finished', config.autoSubmit ? 'Đã chạy luồng tự đăng Facebook.' : 'Đã mở composer Facebook, chờ kiểm tra/tự bấm đăng.', {
    autoSubmit: config.autoSubmit,
    submitTap: config.submitTap,
    finalState: stateMachine.finalState,
    imageCount: preparedImages.length
  });

  return {
    ok: true,
    autoSubmit: config.autoSubmit,
    composerTap: config.composerTap,
    submitTap: config.submitTap,
    composerPending: stateMachine.composerPending,
    screenshot: stateMachine.screenshot,
    steps
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
  await delay(800);

  const intentArgs = [
    '-s',
    target,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.SEND',
    '-t',
    'text/plain',
    '--es',
    'android.intent.extra.TEXT',
    quoteAdbShellArg(text),
  ];
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
      args: intentArgs.map((value, index) => intentArgs[index - 1] === 'android.intent.extra.TEXT' ? '***' : value)
    });
    return { ...shareIntent, method: images.length ? 'text_share_then_gallery' : 'share_intent' };
  }

  return openFacebookHome(account, userId, target, config, shareIntent);
}

async function pushFacebookImage(account, userId, target, image) {
  const localPath = getLocalUploadPath(image.url);
  if (!localPath || !existsSync(localPath)) {
    throw new Error('Ảnh chưa được upload vào server hoặc không còn tồn tại.');
  }

  const extension = path.extname(localPath).toLowerCase() || '.jpg';
  const filename = `socialpilot-${randomUUID()}${extension}`;
  const remoteDir = '/sdcard/Pictures/SocialPilot';
  const remotePath = `${remoteDir}/${filename}`;
  const steps = [];

  const mkdir = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'mkdir', '-p', remoteDir]);
  steps.push(mkdir);
  if (!mkdir.ok) throw new Error(mkdir.error || mkdir.stderr || 'Không tạo được thư mục ảnh trong LDPlayer.');

  const push = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'push', localPath, remotePath], { timeoutMs: 120_000 });
  steps.push(push);
  await writeLog(userId, account._id, push.ok ? 'info' : 'error', 'facebook_post_push_image', push.ok ? `Đã chép ảnh ${filename} vào LDPlayer.` : 'Không chép được ảnh vào LDPlayer.', {
    ...push,
    args: ['-s', target, 'push', path.basename(localPath), remotePath]
  });
  if (!push.ok) throw new Error(push.error || push.stderr || 'ADB push ảnh thất bại.');

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
  await delay(600);

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

  const mediaInsert = await runCommand(env.mobileAutomation.adbPath, [
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
    `mime_type:s:${image.mimeType || mimeTypeFromExtension(extension)}`,
    '--bind',
    `_display_name:s:${filename}`,
    '--bind',
    `title:s:${path.parse(filename).name}`,
    '--bind',
    `date_added:l:${Math.floor(Date.now() / 1000)}`,
    '--bind',
    `date_modified:l:${Math.floor(Date.now() / 1000)}`,
    '--bind',
    `datetaken:l:${Date.now()}`
  ]);
  steps.push(mediaInsert);
  await delay(600);

  return {
    mimeType: image.mimeType || mimeTypeFromExtension(extension),
    remotePath,
    steps
  };
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

async function runFacebookPostStateMachine(account, userId, target, config, text, images = []) {
  const steps = [];
  let textEntered = false;
  let imageAttached = false;
  const imageCount = images.length;
  let screenshot = null;
  let finalState = 'unknown';

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const state = await detectFacebookState(target, text);
    if (state.hasTargetText) textEntered = true;
    finalState = state.name;
    await writeLog(userId, account._id, 'info', 'facebook_post_state', `Facebook state: ${state.name}.`, {
      attempt,
      reason: state.reason,
      observedText: state.observedText || ''
    });

    if (state.name === 'blocked') {
      screenshot = await captureScreenshot(account, userId, 'facebook_post_blocked');
      throw new Error('Facebook đang ở màn đăng nhập/checkpoint/session expired. Cần xử lý thủ công trước khi tự đăng.');
    }

    if (state.name === 'share_chooser') {
      const feed = await tapTextOrPoint(account, userId, target, shareFeedLabels, { x: 225, y: 1368 }, 'facebook_post_choose_feed', { exact: true });
      steps.push(feed);
      await delay(env.mobileAutomation.stepDelayMs);
      const once = await tapTextOrPoint(account, userId, target, shareOnceLabels, { x: 600, y: 1550 }, 'facebook_post_choose_feed_once', { exact: true });
      steps.push(once);
      await delay(env.mobileAutomation.stepDelayMs * 3);
      continue;
    }

    if (state.name === 'menu') {
      await closeFacebookMenuIfOpen(account, userId, target);
      await delay(env.mobileAutomation.stepDelayMs);
      continue;
    }

    if (state.name === 'discard_dialog') {
      const discard = await tapTextOrPoint(account, userId, target, discardPostLabels, { x: 450, y: 1460 }, 'facebook_post_discard_stale_draft', { exact: true });
      steps.push(discard);
      await delay(env.mobileAutomation.stepDelayMs * 2);
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
      await delay(env.mobileAutomation.stepDelayMs * 2);
      const replace = await replaceFocusedText(target, text);
      await writeLog(userId, account._id, replace.ok ? 'info' : 'error', 'facebook_post_replace_stale_text', replace.ok ? 'Đã thay nội dung draft cũ bằng nội dung mới.' : 'Không thay được nội dung draft cũ.', replace);
      if (!replace.ok) throw new Error(replace.error || replace.stderr || 'Không thay được nội dung draft cũ.');
      steps.push(replace);
      textEntered = true;
      await delay(env.mobileAutomation.stepDelayMs * 2);
      const editorState = await detectFacebookState(target, text);
      if (editorState.name === 'text_editor') {
        const done = await tapTextOrPoint(account, userId, target, doneLabels, config.doneTap || { x: 844, y: 70 }, 'facebook_post_done_replaced_text', { exact: true });
        steps.push(done);
        await delay(env.mobileAutomation.stepDelayMs * 2);
      }
      continue;
    }

    if (state.name === 'ready_to_post') {
      if (imageCount && !imageAttached) {
        const attachment = await attachFacebookImages(account, userId, target, imageCount);
        steps.push(...attachment.steps);
        imageAttached = true;
        await delay(env.mobileAutomation.stepDelayMs * 2);
        continue;
      }

      if (!config.autoSubmit) {
        screenshot = await captureScreenshot(account, userId, 'facebook_post_ready_to_post');
        return { finalState, screenshot, steps, composerPending: false };
      }

      await delay(env.mobileAutomation.stepDelayMs * 2);
      const submit = await tapTextOrPoint(account, userId, target, submitLabels, config.submitTap, 'facebook_post_submit_tap', { exact: true });
      steps.push(submit);
      await delay(env.mobileAutomation.stepDelayMs * 4);
      screenshot = await captureScreenshot(account, userId, 'facebook_post_after_submit');
      return { finalState: 'submitted', screenshot, steps, composerPending: false };
    }

    if (state.name === 'text_editor') {
      if (!textEntered) {
        const input = await inputAndLog(userId, account._id, target, 'facebook_post_input_text', text);
        steps.push(input);
        textEntered = true;
        await delay(env.mobileAutomation.stepDelayMs * 2);
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
      await delay(env.mobileAutomation.stepDelayMs * 3);
      continue;
    }

    if (state.name === 'composer') {
      if (state.hasTargetText) {
        if (imageCount && !imageAttached) {
          const attachment = await attachFacebookImages(account, userId, target, imageCount);
          steps.push(...attachment.steps);
          imageAttached = true;
          await delay(env.mobileAutomation.stepDelayMs * 2);
          continue;
        }

        if (!config.autoSubmit) {
          screenshot = await captureScreenshot(account, userId, 'facebook_post_composer_ready');
          return { finalState, screenshot, steps, composerPending: false };
        }
        await delay(env.mobileAutomation.stepDelayMs * 2);
        const submit = await tapTextOrPoint(account, userId, target, submitLabels, config.submitTap, 'facebook_post_submit_from_composer', { exact: true });
        steps.push(submit);
        await delay(env.mobileAutomation.stepDelayMs * 4);
        screenshot = await captureScreenshot(account, userId, 'facebook_post_after_submit');
        return { finalState: 'submitted', screenshot, steps, composerPending: false };
      }

      const bodyTap = await tapTextOrPoint(account, userId, target, composerLabels, { x: 450, y: 360 }, 'facebook_post_open_text_editor');
      steps.push(bodyTap);
      await delay(env.mobileAutomation.stepDelayMs * 2);
      continue;
    }

    if (state.name === 'home') {
      const composerTap = await tapTextOrPoint(account, userId, target, composerLabels, config.composerTap, 'facebook_post_tap_composer');
      steps.push(composerTap);
      await delay(env.mobileAutomation.stepDelayMs * 2);
      continue;
    }

    if (attempt <= 4) {
      await writeLog(userId, account._id, 'info', 'facebook_post_wait_for_ui', 'Đang chờ Facebook hoàn tất chuyển màn.', {
        attempt,
        state: state.name
      });
      await delay(env.mobileAutomation.stepDelayMs * 2);
      continue;
    }

    const home = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'monkey', '-p', config.appPackage, '-c', 'android.intent.category.LAUNCHER', '1']);
    steps.push(home);
    await writeLog(userId, account._id, home.ok ? 'info' : 'warn', 'facebook_post_reopen_home', home.ok ? 'Đã mở lại Facebook để tìm Home.' : 'Mở lại Facebook lỗi.', home);
    await delay(env.mobileAutomation.stepDelayMs * 2);
  }

  screenshot = await captureScreenshot(account, userId, 'facebook_post_state_machine_pending');
  await writeLog(userId, account._id, 'warn', 'facebook_post_state_machine_pending', 'Không đưa được Facebook tới trạng thái đăng bài sau nhiều bước.', {
    finalState
  });
  return { finalState, screenshot, steps, composerPending: true };
}

async function attachFacebookImages(account, userId, target, imageCount = 1) {
  const steps = [];
  const count = Math.max(1, Math.min(Number(imageCount) || 1, 4));
  const staleImage = await findVisibleTextBounds(target, removeImageLabels, { exact: true });
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
    await delay(env.mobileAutomation.stepDelayMs * 2);
  }

  const gallery = await tapTextOrPoint(
    account,
    userId,
    target,
    galleryLabels,
    { x: 88, y: 1430 },
    'facebook_post_open_gallery',
    { exact: true }
  );
  steps.push(gallery);
  await delay(env.mobileAutomation.stepDelayMs * 2);

  const permission = await findVisibleTextBounds(target, galleryPermissionLabels);
  if (permission) {
    const allow = await tapTextOrPoint(account, userId, target, galleryPermissionLabels, { x: 450, y: 965 }, 'facebook_post_allow_gallery');
    steps.push(allow);
    await delay(env.mobileAutomation.stepDelayMs * 2);
  }

  const imageMatch = await waitForAnyText(target, selectedImageLabels, 8_000);
  const firstImagePoint = imageMatch
    ? { x: Math.round((imageMatch.left + imageMatch.right) / 2), y: Math.round((imageMatch.top + imageMatch.bottom) / 2) }
    : { x: 150, y: 380 };
  const imagePoints = buildGalleryImagePoints(firstImagePoint, count);
  for (let index = 0; index < imagePoints.length; index += 1) {
    const selectImage = await tapAndLog(userId, account._id, target, `facebook_post_select_image_${index + 1}`, imagePoints[index]);
    steps.push(selectImage);
    await delay(env.mobileAutomation.stepDelayMs);
  }

  const next = await tapTextOrPoint(account, userId, target, galleryNextLabels, { x: 835, y: 1530 }, 'facebook_post_gallery_next', { exact: true });
  steps.push(next);
  await delay(env.mobileAutomation.stepDelayMs * 3);

  const attached = await waitForAnyText(target, attachedImageLabels, 10_000);
  if (!attached) {
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
  return { steps };
}

function buildGalleryImagePoints(firstPoint, count) {
  const cell = 250;
  const left = Math.max(120, firstPoint.x);
  const top = Math.max(320, firstPoint.y);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    points.push({
      x: left + (index % 3) * cell,
      y: top + Math.floor(index / 3) * cell
    });
  }
  return points;
}

async function detectFacebookState(target, text) {
  const nodes = await dumpVisibleNodes(target);
  if (!nodes.length) return { name: 'unknown', reason: 'no_uiautomator_nodes', hasTargetText: false };

  const hasTargetText = screenHasText(nodes, text);
  if (findNodeInNodes(nodes, shareFeedLabels, { exact: true }) && findNodeInNodes(nodes, shareOnceLabels, { exact: true })) {
    return { name: 'share_chooser', reason: 'android_share_target_picker', hasTargetText };
  }
  if (findNodeInNodes(nodes, discardPostLabels, { exact: true })) {
    return { name: 'discard_dialog', reason: 'discard_post_visible', hasTargetText };
  }
  if (findNodeInNodes(nodes, loginBlockLabels)) return { name: 'blocked', reason: 'login_or_checkpoint', hasTargetText };
  if (findNodeInNodes(nodes, closeMenuLabels)) return { name: 'menu', reason: 'menu_close_button_visible', hasTargetText };

  const hasDone = Boolean(findNodeInNodes(nodes, doneLabels, { exact: true }));
  const hasTextEditor = Boolean(findNodeInNodes(nodes, textEditorLabels));
  if (hasDone || hasTextEditor) return { name: 'text_editor', reason: hasDone ? 'done_visible' : 'text_editor_title', hasTargetText };

  const hasPostTitle = Boolean(findNodeInNodes(nodes, postTitleLabels));
  const hasSubmit = Boolean(findNodeInNodes(nodes, submitLabels, { exact: true }));
  const hasAttachedImage = Boolean(findNodeInNodes(nodes, attachedImageLabels));
  const observedText = nodes.find((node) => node.className.includes('EditText') && normalizeSearchText(node.text))?.text || '';
  const hasComposerText = Boolean(observedText);
  if (hasPostTitle && !hasTargetText && (hasAttachedImage || hasComposerText)) {
    return {
      name: 'stale_composer',
      reason: hasAttachedImage ? 'existing_image_draft' : 'existing_text_draft',
      hasTargetText,
      observedText
    };
  }
  if ((hasSubmit || hasPostTitle) && hasTargetText) return { name: 'ready_to_post', reason: hasSubmit ? 'submit_visible' : 'post_title_with_text', hasTargetText };
  if (hasPostTitle) return { name: 'composer', reason: 'post_title_visible', hasTargetText };

  if (findNodeInNodes(nodes, composerLabels)) return { name: 'home', reason: 'composer_entry_visible', hasTargetText };

  return { name: 'unknown', reason: 'no_known_labels', hasTargetText };
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
  if (!result.ok && target.includes(':')) {
    await runCommand(env.mobileAutomation.adbPath, ['connect', target]);
    await delay(600);
    const retry = await runCommand(env.mobileAutomation.adbPath, args, { timeoutMs: 10_000 });
    result = { ...retry, retried: true, firstError: result.error || result.stderr };
  }
  await writeLog(userId, accountId, result.ok ? 'info' : 'error', action, result.ok ? `Tap ${point.x},${point.y}.` : `Tap lỗi ${point.x},${point.y}.`, result);
  if (!result.ok) throw new Error(result.error || result.stderr || `${action} failed.`);
  await delay(env.mobileAutomation.stepDelayMs);
  return result;
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
  if (!match) return false;

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
      bounds: readBounds(node)
    }))
    .filter((node) => node.bounds);
}

function findNodeInNodes(nodes, labels, options = {}) {
  for (const label of labels) {
    const normalizedLabel = normalizeSearchText(label);
    for (const node of nodes) {
      const normalizedText = normalizeSearchText(node.text);
      const normalizedDesc = normalizeSearchText(node.desc);
      const haystack = normalizeSearchText(`${node.text} ${node.desc}`);
      if (!haystack) continue;
      const matched = options.exact
        ? normalizedText === normalizedLabel || normalizedDesc === normalizedLabel || haystack === normalizedLabel
        : haystack.includes(normalizedLabel);
      if (!matched) continue;

      return { ...node.bounds, label, text: node.text, desc: node.desc };
    }
  }

  return null;
}

function screenHasText(nodes, text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return false;
  const compactNeedle = normalized.replace(/\s+/g, '');
  const snippets = [
    normalized,
    normalized.slice(0, 40).trim(),
    compactNeedle.slice(0, 40)
  ].filter((item) => item.length >= 8);
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
  await delay(env.mobileAutomation.stepDelayMs);
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
  const setIme = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME'], { timeoutMs: 10_000 });
  if (!setIme.ok) return { ...setIme, method: 'adb_keyboard_replace_set_ime' };

  const clear = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_CLEAR_TEXT'], { timeoutMs: 3_000 });
  const clearSent = clear.ok || /Broadcasting:\s+Intent/i.test(`${clear.stdout || ''}\n${clear.stderr || ''}`);
  const payload = Buffer.from(cleanClipboardText(text), 'utf8').toString('base64');
  const input = clearSent
    ? await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', payload], { timeoutMs: 10_000 })
    : clear;

  if (current.ok && current.stdout && current.stdout !== 'com.android.adbkeyboard/.AdbIME') {
    await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', current.stdout], { timeoutMs: 10_000 });
  }

  return {
    ...input,
    method: 'adb_keyboard_replace',
    clearOk: clear.ok,
    clearSent,
    clearError: clear.ok ? '' : (clear.error || clear.stderr || '')
  };
}

async function inputWithAdbKeyboard(target, text) {
  const list = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'list', '-a'], { timeoutMs: 10_000 });
  if (!list.ok || !list.stdout.includes('com.android.adbkeyboard/.AdbIME')) {
    return { ok: false, method: 'adb_keyboard', error: 'ADB Keyboard is not installed.' };
  }

  const current = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'settings', 'get', 'secure', 'default_input_method'], { timeoutMs: 10_000 });
  const setIme = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME'], { timeoutMs: 10_000 });
  if (!setIme.ok) return { ...setIme, method: 'adb_keyboard_set_ime' };

  const payload = Buffer.from(text, 'utf8').toString('base64');
  const broadcast = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', payload], { timeoutMs: 10_000 });

  if (current.ok && current.stdout && current.stdout !== 'com.android.adbkeyboard/.AdbIME') {
    await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'ime', 'set', current.stdout], { timeoutMs: 10_000 });
  }

  return { ...broadcast, method: 'adb_keyboard' };
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
