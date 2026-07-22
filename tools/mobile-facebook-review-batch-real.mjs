process.env.NO_DB = process.env.NO_DB || 'true';
process.env.MOBILE_COMMAND_MOCK = '';
process.env.ENV_FILE = process.env.ENV_FILE || '.env';

const { appendFile, mkdir, writeFile } = await import('fs/promises');
const path = await import('path');
const { publishFacebookPostViaMobile, closeAccountSession, captureScreenshot } = await import('../server/src/services/mobile/automation-engine.service.js');

const options = parseArgs(process.argv.slice(2));
const iterations = Math.max(1, Number(options.iterations || options.n || 20));
const text = String(options.text || 'hi');
const images = await Promise.all((options.images || []).map((image) => resolveUploadImage(String(image))));
const videos = await Promise.all((options.videos || []).map((video) => resolveUploadVideo(String(video))));
const retries = Math.max(0, Number(options.retries || 1));
const order = String(options.order || 'grouped');
const closeEach = ['true', '1', 'yes'].includes(String(options.closeEach || '').toLowerCase());
const progressFile = options.progressFile ? path.resolve(String(options.progressFile)) : '';
const userId = 'manual-batch-review-user';
const allInstances = [
  { label: 'LD1', instanceName: 'LDPlayer', deviceId: 'emulator-5554' },
  { label: 'LD2', instanceName: 'LDPlayer-1', deviceId: 'emulator-5556' },
  { label: 'LD3', instanceName: 'LDPlayer-2', deviceId: 'emulator-5558' }
];
const onlyLabels = String(options.only || '')
  .split(',')
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const instances = onlyLabels.length
  ? allInstances.filter((instance) => onlyLabels.includes(instance.label.toUpperCase()))
  : allInstances;
if (!instances.length) {
  throw new Error(`No LDPlayer instances matched --only=${options.only}`);
}
const plan = buildPlan(iterations, instances, { order });
const startedAt = Date.now();
const results = [];
const failures = [];

if (images.length && videos.length) throw new Error('Real review batch chỉ chạy một loại media mỗi lượt: ảnh hoặc video.');

console.log(`Facebook real composer review batch: iterations=${iterations}, text="${text}", images=${images.length}, videos=${videos.length}, autoSubmit=false, order=${order}, closeEach=${closeEach}`);
await writeProgress({
  type: 'start',
  iterations,
  text,
  imageNames: images.map((image) => image.name),
  videoNames: videos.map((video) => video.name),
  order,
  closeEach,
  startedAt: new Date(startedAt).toISOString()
});

for (const group of plan) {
  const account = buildAccount(group.instance, userId);
  console.log(`\n[${group.instance.label}] start ${group.count} review run${group.count > 1 ? 's' : ''} on ${account.instanceName} (${account.deviceId})`);

  for (let index = 1; index <= group.count; index += 1) {
    const globalIndex = results.length + 1;
    const runStartedAt = Date.now();
    let item = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await runReview(account, text);
        const screenshotPath = await saveScreenshot(result?.screenshot, group.instance.label, globalIndex);
        item = {
          index: globalIndex,
          instance: group.instance.label,
          ok: Boolean(result?.ok),
          finalState: result?.finalState || '',
          composerPending: Boolean(result?.composerPending),
          submitVerified: Boolean(result?.submitVerified),
          screenshotOk: Boolean(result?.screenshot?.ok),
          screenshotVerified: Boolean(result?.screenshotVerified),
          screenshotPath,
          perfStages: result?.perf?.stages?.map((stage) => stage.name) || [],
          attempt: attempt + 1,
          elapsedMs: Date.now() - runStartedAt
        };
        item.success = isSafeReviewResult(item);
        if (item.success || attempt >= retries) break;
      } catch (error) {
        const screenshot = await captureScreenshot(account, userId, 'facebook_review_batch_error').catch(() => null);
        const screenshotPath = await saveScreenshot(screenshot, group.instance.label, globalIndex);
        item = {
          index: globalIndex,
          instance: group.instance.label,
          ok: false,
          error: error.message,
          screenshotOk: Boolean(screenshot?.ok),
          screenshotPath,
          attempt: attempt + 1,
          elapsedMs: Date.now() - runStartedAt,
          success: false
        };
        if (attempt >= retries || !isRetryableReviewError(error.message)) break;
      }
      console.log(`[${group.instance.label}] ${index}/${group.count} retry ${attempt + 1}/${retries + 1}`);
    }

    results.push(item);
    await writeProgress({ type: 'run', ...item });
    console.log(`[${group.instance.label}] ${index}/${group.count} success=${item.success} state=${item.finalState || 'error'} submitVerified=${item.submitVerified || false} screenshotVerified=${item.screenshotVerified || false} fallbackGallery=${item.perfStages?.includes('image_share_fallback_to_gallery') || false} attempt=${item.attempt} elapsed=${item.elapsedMs}ms`);
    if (!item.success) {
      failures.push({ ...item, error: item.error || 'unexpected_result' });
    }

    if (closeEach) {
      const close = await closeAccountSession(account, userId, 'com.facebook.katana').catch((error) => ({
        ok: false,
        error: error.message
      }));
      console.log(`[${group.instance.label}] closeEach closeOk=${Boolean(close?.ok)}${close?.error ? ` error="${close.error}"` : ''}`);
    }
  }

  if (!closeEach) {
    const close = await closeAccountSession(account, userId, 'com.facebook.katana').catch((error) => ({
      ok: false,
      error: error.message
    }));
    console.log(`[${group.instance.label}] closeOk=${Boolean(close?.ok)}${close?.error ? ` error="${close.error}"` : ''}`);
  }
}

const elapsedMs = Date.now() - startedAt;
const successCount = results.filter((item) => item.success).length;
const summary = {
  iterations,
  text,
  imageNames: images.map((image) => image.name),
  videoNames: videos.map((video) => video.name),
  retries,
  order,
  closeEach,
  successCount,
  failureCount: results.length - successCount,
  elapsedMs,
  avgRunMs: Math.round(results.reduce((total, item) => total + item.elapsedMs, 0) / Math.max(1, results.length)),
  byInstance: summarizeByInstance(results),
  sampleFailures: failures.slice(0, 5),
  fallbackGalleryCount: results.filter((item) => item.perfStages?.includes('image_share_fallback_to_gallery')).length,
  lastScreenshots: results.slice(-5).map((item) => item.screenshotPath).filter(Boolean)
};

console.log('\nBatch summary');
console.log(JSON.stringify(summary, null, 2));
await writeProgress({ type: 'summary', ...summary });
if (successCount !== iterations) process.exitCode = 1;

function runReview(account, content) {
  return publishFacebookPostViaMobile(account, userId, {
    text: content,
    appPackage: 'com.facebook.katana',
    autoSubmit: false,
    textInputMode: 'stable',
    waitAfterSubmitMs: 0,
    images,
    videos
  });
}

function isSafeReviewResult(item) {
  return Boolean(
    item.ok
    && item.screenshotOk
    && item.screenshotVerified
    && item.submitVerified === false
    && ['ready_to_post', 'composer'].includes(item.finalState)
  );
}

function isRetryableReviewError(message = '') {
  return /adb|device|system ui|không phản hồi|khong phan hoi|input tap|uiautomator|unknown/i.test(String(message));
}

function buildPlan(total, items, options = {}) {
  if (options.order === 'round-robin') {
    return Array.from({ length: total }, (_, index) => ({
      instance: items[index % items.length],
      count: 1
    }));
  }
  return items.map((instance, index) => ({
    instance,
    count: Math.floor(total / items.length) + (index < total % items.length ? 1 : 0)
  })).filter((item) => item.count > 0);
}

function buildAccount(instance, accountUserId) {
  return {
    _id: `facebook-${instance.label.toLowerCase()}-real-review`,
    id: `facebook-${instance.label.toLowerCase()}-real-review`,
    userId: accountUserId,
    platform: 'facebook',
    displayName: `Facebook Account ${instance.label}`,
    accountHandle: '',
    instanceName: instance.instanceName,
    adbHost: '',
    deviceId: instance.deviceId,
    status: 'ready',
    notes: 'Manual real composer review batch test.',
    metadata: {
      appPackage: 'com.facebook.katana'
    }
  };
}

async function saveScreenshot(screenshot, instanceLabel, index) {
  if (!screenshot?.imageBase64) return '';
  const outputDir = path.resolve('downloads', 'facebook-review-tests', 'batch');
  await mkdir(outputDir, { recursive: true });
  const filename = `facebook-review-${String(index).padStart(2, '0')}-${instanceLabel}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filePath = path.join(outputDir, filename);
  await writeFile(filePath, Buffer.from(screenshot.imageBase64, 'base64'));
  return filePath;
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

async function resolveUploadVideo(value) {
  const uploadsDir = path.resolve('server', 'uploads');
  const candidate = path.isAbsolute(value)
    ? value
    : path.resolve(value.includes(path.sep) || value.includes('/') ? value : path.join(uploadsDir, value));
  const resolvedUploadsDir = `${uploadsDir}${path.sep}`;
  if (!candidate.startsWith(resolvedUploadsDir)) {
    throw new Error(`Video test file must be inside ${uploadsDir}`);
  }

  const filename = path.basename(candidate);
  return {
    url: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    videoUrl: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    name: filename,
    mimeType: videoMimeTypeFromPath(filename)
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

function videoMimeTypeFromPath(value) {
  const extension = path.extname(String(value)).toLowerCase();
  return {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm'
  }[extension] || 'application/octet-stream';
}

function summarizeByInstance(items) {
  return instances.map((instance) => {
    const rows = items.filter((item) => item.instance === instance.label);
    return {
      instance: instance.label,
      total: rows.length,
      ok: rows.filter((item) => item.success).length,
      failed: rows.filter((item) => !item.success).length,
      avgRunMs: Math.round(rows.reduce((total, item) => total + Number(item.elapsedMs || 0), 0) / Math.max(1, rows.length))
    };
  });
}

function parseArgs(args) {
  const parsed = { images: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    const value = inlineValue ?? args[index + 1] ?? true;
    if (key === 'image') {
      parsed.images.push(...splitImageArgs(value));
    } else if (key === 'video') {
      parsed.videos = parsed.videos || [];
      parsed.videos.push(...splitImageArgs(value));
    } else {
      parsed[key] = value;
    }
    if (inlineValue === undefined && args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
  }
  return parsed;
}

function splitImageArgs(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function writeProgress(payload) {
  if (!progressFile) return;
  await mkdir(path.dirname(progressFile), { recursive: true });
  await appendFile(progressFile, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`, 'utf8');
}
