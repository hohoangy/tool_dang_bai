process.env.NO_DB = process.env.NO_DB || 'true';
process.env.MOBILE_COMMAND_MOCK = '';
process.env.ENV_FILE = process.env.ENV_FILE || '.env';

const { mkdir, writeFile } = await import('fs/promises');
const path = await import('path');
const { publishFacebookPostViaMobile, closeAccountSession, captureScreenshot } = await import('../server/src/services/mobile/automation-engine.service.js');

const args = parseArgs(process.argv.slice(2));
const text = args.text
  || `test composer khong dang that ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
const images = await Promise.all(args.images.map((image) => resolveUploadImage(image)));
const instanceName = args.instanceName || 'LDPlayer';
const deviceId = args.deviceId || 'emulator-5554';
const adbHost = args.adbHost || '';
const label = args.label || '01';
const autoSubmit = parseBooleanFlag(args.autoSubmit);
const waitAfterSubmitMs = Math.max(0, Number(args.waitAfterSubmitMs || (autoSubmit ? 90_000 : 0)));

const account = {
  _id: `facebook-account-${label}-real-review`,
  id: `facebook-account-${label}-real-review`,
  userId: 'manual-test-user',
  platform: 'facebook',
  displayName: `Facebook Account ${label}`,
  accountHandle: '',
  instanceName,
  adbHost,
  deviceId,
  status: 'ready',
  notes: 'Manual real composer review test.',
  metadata: {
    appPackage: 'com.facebook.katana'
  }
};

const startedAt = Date.now();
let result = null;
let closeResult = null;

try {
  console.log(`Starting Facebook composer ${autoSubmit ? 'publish' : 'review'}. autoSubmit=${autoSubmit} text="${text}" images=${images.length}`);
  result = await publishFacebookPostViaMobile(account, account.userId, {
    text,
    appPackage: 'com.facebook.katana',
    autoSubmit,
    textInputMode: 'stable',
    waitAfterSubmitMs,
    images,
    videos: []
  });

  const screenshotPath = await saveScreenshot(result?.screenshot);
  console.log(JSON.stringify({
    ok: result?.ok,
    autoSubmit: result?.autoSubmit,
    finalState: result?.finalState,
    composerPending: result?.composerPending,
    submitVerified: result?.submitVerified,
    submitReason: result?.submitReason,
    screenshotVerified: result?.screenshotVerified,
    screenshotOk: Boolean(result?.screenshot?.ok),
    screenshotSize: result?.screenshot ? `${result.screenshot.width}x${result.screenshot.height}` : '',
    screenshotPath,
    imageNames: images.map((image) => image.name),
    perfStages: result?.perf?.stages?.map((stage) => stage.name) || [],
    elapsedMs: Date.now() - startedAt
  }, null, 2));
} catch (error) {
  const screenshot = await captureScreenshot(account, account.userId, 'facebook_review_real_error').catch(() => null);
  const screenshotPath = await saveScreenshot(screenshot);
  console.log(JSON.stringify({
    ok: false,
    error: error.message,
    screenshotOk: Boolean(screenshot?.ok),
    screenshotPath,
    imageNames: images.map((image) => image.name),
    elapsedMs: Date.now() - startedAt
  }, null, 2));
  process.exitCode = 1;
} finally {
  console.log(`Closing LDPlayer session after composer ${autoSubmit ? 'publish' : 'review'}.`);
  closeResult = await closeAccountSession(account, account.userId, 'com.facebook.katana').catch((error) => ({
    ok: false,
    error: error.message
  }));
  console.log(JSON.stringify({
    closeOk: Boolean(closeResult?.ok),
    closeError: closeResult?.error || '',
    totalElapsedMs: Date.now() - startedAt
  }, null, 2));
}

async function saveScreenshot(screenshot) {
  if (!screenshot?.imageBase64) return '';
  const outputDir = path.resolve('downloads', 'facebook-review-tests');
  await mkdir(outputDir, { recursive: true });
  const filename = `facebook-review-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filePath = path.join(outputDir, filename);
  await writeFile(filePath, Buffer.from(screenshot.imageBase64, 'base64'));
  return filePath;
}

function parseArgs(argv) {
  const parsed = {
    images: [],
    text: '',
    instanceName: '',
    deviceId: '',
    adbHost: '',
    label: '',
    autoSubmit: false,
    waitAfterSubmitMs: ''
  };
  const textParts = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--image') {
      parsed.images.push(...splitImageArgs(argv[index + 1] || ''));
      index += 1;
      continue;
    }
    if (arg.startsWith('--image=')) {
      parsed.images.push(...splitImageArgs(arg.slice('--image='.length)));
      continue;
    }
    if (arg === '--text') {
      parsed.text = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--text=')) {
      parsed.text = arg.slice('--text='.length);
      continue;
    }
    if (arg === '--instanceName') {
      parsed.instanceName = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--instanceName=')) {
      parsed.instanceName = arg.slice('--instanceName='.length);
      continue;
    }
    if (arg === '--deviceId') {
      parsed.deviceId = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--deviceId=')) {
      parsed.deviceId = arg.slice('--deviceId='.length);
      continue;
    }
    if (arg === '--adbHost') {
      parsed.adbHost = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--adbHost=')) {
      parsed.adbHost = arg.slice('--adbHost='.length);
      continue;
    }
    if (arg === '--label') {
      parsed.label = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--label=')) {
      parsed.label = arg.slice('--label='.length);
      continue;
    }
    if (arg === '--autoSubmit') {
      parsed.autoSubmit = true;
      continue;
    }
    if (arg.startsWith('--autoSubmit=')) {
      parsed.autoSubmit = arg.slice('--autoSubmit='.length);
      continue;
    }
    if (arg === '--waitAfterSubmitMs') {
      parsed.waitAfterSubmitMs = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--waitAfterSubmitMs=')) {
      parsed.waitAfterSubmitMs = arg.slice('--waitAfterSubmitMs='.length);
      continue;
    }
    textParts.push(arg);
  }

  if (!parsed.text) parsed.text = textParts.join(' ').trim();
  return parsed;
}

function parseBooleanFlag(value) {
  if (value === true) return true;
  return /^(1|true|yes|y)$/i.test(String(value || ''));
}

function splitImageArgs(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveUploadImage(value) {
  const uploadsDir = path.resolve('server', 'uploads');
  const candidate = path.isAbsolute(value)
    ? value
    : path.resolve(value.includes(path.sep) || value.includes('/') ? value : path.join(uploadsDir, value));
  const resolvedUploadsDir = `${uploadsDir}${path.sep}`;
  if (!candidate.startsWith(resolvedUploadsDir)) {
    throw new Error(`Image test file must be inside ${uploadsDir}`);
  }

  const filename = path.basename(candidate);
  return {
    url: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    imageUrl: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    name: filename,
    mimeType: mimeTypeFromPath(filename)
  };
}

function mimeTypeFromPath(value) {
  const extension = path.extname(String(value)).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  }[extension] || 'application/octet-stream';
}
