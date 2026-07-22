process.env.NO_DB = process.env.NO_DB || 'true';
process.env.MOBILE_COMMAND_MOCK = '';
process.env.ENV_FILE = process.env.ENV_FILE || '.env';

const { appendFile, mkdir, readdir, writeFile } = await import('fs/promises');
const path = await import('path');
const { existsSync } = await import('fs');
const { publishFacebookPostViaMobile, closeAccountSession, captureScreenshot } = await import('../server/src/services/mobile/automation-engine.service.js');

const options = parseArgs(process.argv.slice(2));
const retries = Math.max(0, Number(options.retries || 1));
const progressFile = options.progressFile ? path.resolve(String(options.progressFile)) : '';
const scenarioIds = parseList(options.scenarios || 'text,collage,video');
const userId = 'manual-smoke-review-user';
const allInstances = [
  { label: 'LD1', instanceName: 'LDPlayer', deviceId: 'emulator-5554' },
  { label: 'LD2', instanceName: 'LDPlayer-1', deviceId: 'emulator-5556' },
  { label: 'LD3', instanceName: 'LDPlayer-2', deviceId: 'emulator-5558' }
];
const onlyLabels = parseList(options.only).map((value) => value.toUpperCase());
const instances = onlyLabels.length
  ? allInstances.filter((instance) => onlyLabels.includes(instance.label.toUpperCase()))
  : allInstances;
if (!instances.length) throw new Error(`No LDPlayer instances matched --only=${options.only}`);

const fixtures = {
  collage: await resolveUploadImage(options.collage || 'facebook-collage-test-2-grid.jpg'),
  multiImages: await resolveUploadImages(options.images || '', Math.max(2, Number(options.imageCount || 3))),
  video: await resolveUploadVideo(options.video || '')
};
const scenarios = buildScenarios(scenarioIds, fixtures);
const startedAt = Date.now();
const results = [];
const failures = [];

console.log(`Facebook real smoke review: instances=${instances.map((item) => item.label).join(', ')}, scenarios=${scenarios.map((item) => item.id).join(', ')}, autoSubmit=false`);
console.log(`Collage: ${fixtures.collage?.name || 'not found'}`);
console.log(`Multi images: ${fixtures.multiImages.map((item) => item.name).join(', ') || 'not found'}`);
console.log(`Video: ${fixtures.video?.name || 'not found'}`);
await writeProgress({ type: 'start', instances: instances.map((item) => item.label), scenarios: scenarios.map((item) => item.id), startedAt: new Date(startedAt).toISOString() });

for (const instance of instances) {
  const account = buildAccount(instance);
  console.log(`\n[${instance.label}] open/review sequence on ${account.instanceName} (${account.deviceId})`);
  for (const scenario of scenarios) {
    const index = results.length + 1;
    const runStartedAt = Date.now();
    let item = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await runReview(account, scenario, index);
        const screenshotPath = await saveScreenshot(result?.screenshot, instance.label, scenario.id, index);
        item = {
          index,
          instance: instance.label,
          scenario: scenario.id,
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
        item.success = isSafeReviewResult(item, scenario);
        if (item.success || attempt >= retries) break;
      } catch (error) {
        const screenshot = await captureScreenshot(account, userId, `facebook_smoke_${scenario.id}_error`).catch(() => null);
        const screenshotPath = await saveScreenshot(screenshot, instance.label, scenario.id, index);
        item = {
          index,
          instance: instance.label,
          scenario: scenario.id,
          ok: false,
          error: error.message,
          screenshotOk: Boolean(screenshot?.ok),
          screenshotPath,
          attempt: attempt + 1,
          elapsedMs: Date.now() - runStartedAt,
          success: false
        };
        const retryable = isRetryableReviewError(error.message);
        if (retryable && attempt < retries) {
          const close = await closeAccountSession(account, userId, 'com.facebook.katana').catch((closeError) => ({ ok: false, error: closeError.message }));
          console.log(`[${instance.label}] ${scenario.id} retry cleanup closeOk=${Boolean(close?.ok)}${close?.error ? ` error="${close.error}"` : ''}`);
          await writeProgress({
            type: 'retry-cleanup',
            instance: instance.label,
            scenario: scenario.id,
            attempt: attempt + 1,
            ok: Boolean(close?.ok),
            error: close?.error || ''
          });
          await delay(4_000);
        }
        if (attempt >= retries || !retryable) break;
      }
      console.log(`[${instance.label}] ${scenario.id} retry ${attempt + 1}/${retries + 1}`);
    }

    results.push(item);
    if (!item.success) failures.push({ ...item, error: item.error || 'unexpected_result' });
    await writeProgress({ type: 'run', ...item });
    console.log(`[${instance.label}] ${scenario.id} success=${item.success} state=${item.finalState || 'error'} screenshotVerified=${item.screenshotVerified || false} elapsed=${item.elapsedMs}ms`);
    const close = await closeAccountSession(account, userId, 'com.facebook.katana').catch((error) => ({ ok: false, error: error.message }));
    console.log(`[${instance.label}] ${scenario.id} closeOk=${Boolean(close?.ok)}${close?.error ? ` error="${close.error}"` : ''}`);
    await writeProgress({
      type: 'close',
      instance: instance.label,
      scenario: scenario.id,
      ok: Boolean(close?.ok),
      error: close?.error || ''
    });
  }
}

const elapsedMs = Date.now() - startedAt;
const successCount = results.filter((item) => item.success).length;
const summary = {
  total: results.length,
  successCount,
  failureCount: results.length - successCount,
  elapsedMs,
  avgRunMs: Math.round(results.reduce((total, item) => total + Number(item.elapsedMs || 0), 0) / Math.max(1, results.length)),
  byInstance: summarize(results, 'instance'),
  byScenario: summarize(results, 'scenario'),
  sampleFailures: failures.slice(0, 8),
  lastScreenshots: results.slice(-8).map((item) => item.screenshotPath).filter(Boolean)
};

console.log('\nSmoke summary');
console.log(JSON.stringify(summary, null, 2));
await writeProgress({ type: 'summary', ...summary });
if (successCount !== results.length) process.exitCode = 1;

function runReview(account, scenario, index) {
  return publishFacebookPostViaMobile(account, userId, {
    text: `${scenario.text} ${index}`,
    appPackage: 'com.facebook.katana',
    autoSubmit: false,
    textInputMode: 'stable',
    waitAfterSubmitMs: 0,
    images: scenario.images || [],
    videos: scenario.videos || []
  });
}

function isSafeReviewResult(item, scenario) {
  if (!item.ok || !item.screenshotOk || !item.screenshotVerified) return false;
  if (item.submitVerified !== false) return false;
  if (!['ready_to_post', 'composer'].includes(item.finalState)) return false;
  if (scenario.id !== 'multi-image' && item.perfStages?.includes('image_share_fallback_to_gallery')) return false;
  return true;
}

function isRetryableReviewError(message = '') {
  return /adb|device|system ui|không phản hồi|khong phan hoi|isn't responding|input tap|uiautomator|unknown|offline|share intent|composer video|chưa nhận được video|chua nhan duoc video|chưa mở thành công|chua mo thanh cong|media composer|video trong composer/i.test(String(message));
}

function buildScenarios(ids, media) {
  const definitions = new Map([
    ['text', { id: 'text', text: 'smoke text review', images: [], videos: [] }],
    ['collage', { id: 'collage', text: 'smoke collage review', images: media.collage ? [media.collage] : [], videos: [] }],
    ['multi-image', { id: 'multi-image', text: 'smoke multi image review', images: media.multiImages, videos: [] }],
    ['video', { id: 'video', text: 'smoke video review', images: [], videos: media.video ? [media.video] : [] }]
  ]);
  return ids.map((id) => {
    const scenario = definitions.get(id);
    if (!scenario) throw new Error(`Unknown scenario: ${id}`);
    if (id === 'collage' && !scenario.images.length) throw new Error('Missing collage fixture.');
    if (id === 'multi-image' && scenario.images.length < 2) throw new Error('Missing multi-image fixtures.');
    if (id === 'video' && !scenario.videos.length) throw new Error('Missing video fixture.');
    return scenario;
  });
}

function buildAccount(instance) {
  return {
    _id: `facebook-${instance.label.toLowerCase()}-real-smoke`,
    id: `facebook-${instance.label.toLowerCase()}-real-smoke`,
    userId,
    platform: 'facebook',
    displayName: `Facebook Account ${instance.label}`,
    accountHandle: '',
    instanceName: instance.instanceName,
    adbHost: '',
    deviceId: instance.deviceId,
    status: 'ready',
    notes: 'Manual real composer smoke test.',
    metadata: {
      appPackage: 'com.facebook.katana'
    }
  };
}

async function resolveUploadImage(value) {
  const uploadsDir = path.resolve('server', 'uploads');
  const candidate = path.isAbsolute(value)
    ? value
    : path.resolve(value.includes(path.sep) || value.includes('/') ? value : path.join(uploadsDir, value));
  const resolvedUploadsDir = `${uploadsDir}${path.sep}`;
  if (!candidate.startsWith(resolvedUploadsDir)) throw new Error(`Image test file must be inside ${uploadsDir}`);
  if (!existsSync(candidate)) return null;
  const filename = path.basename(candidate);
  return {
    url: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    imageUrl: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    name: filename,
    mimeType: imageMimeTypeFromPath(filename)
  };
}

async function resolveUploadImages(value = '', count = 3) {
  const requested = parseList(value);
  if (requested.length) {
    const resolved = [];
    for (const item of requested.slice(0, count)) {
      const image = await resolveUploadImage(item);
      if (image) resolved.push(image);
    }
    return resolved;
  }
  const uploadsDir = path.resolve('server', 'uploads');
  const files = await readdir(uploadsDir).catch(() => []);
  const images = files
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file) && !file.startsWith('facebook-collage'))
    .slice(0, count);
  return (await Promise.all(images.map((file) => resolveUploadImage(file)))).filter(Boolean);
}

async function resolveUploadVideo(value = '') {
  const uploadsDir = path.resolve('server', 'uploads');
  const filename = value || (await findDefaultVideo(uploadsDir));
  if (!filename) return null;
  const candidate = path.isAbsolute(filename)
    ? filename
    : path.resolve(filename.includes(path.sep) || filename.includes('/') ? filename : path.join(uploadsDir, filename));
  const resolvedUploadsDir = `${uploadsDir}${path.sep}`;
  if (!candidate.startsWith(resolvedUploadsDir)) throw new Error(`Video test file must be inside ${uploadsDir}`);
  if (!existsSync(candidate)) return null;
  const basename = path.basename(candidate);
  return {
    url: `http://localhost:5000/uploads/${encodeURIComponent(basename)}`,
    videoUrl: `http://localhost:5000/uploads/${encodeURIComponent(basename)}`,
    name: basename,
    mimeType: videoMimeTypeFromPath(basename)
  };
}

async function findDefaultVideo(uploadsDir) {
  const files = await readdir(uploadsDir).catch(() => []);
  return files.find((file) => /\.(mp4|mov|m4v|webm)$/i.test(file)) || '';
}

async function saveScreenshot(screenshot, instanceLabel, scenarioId, index) {
  if (!screenshot?.imageBase64) return '';
  const outputDir = path.resolve('downloads', 'facebook-review-tests', 'smoke');
  await mkdir(outputDir, { recursive: true });
  const filename = `facebook-smoke-${String(index).padStart(2, '0')}-${instanceLabel}-${scenarioId}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filePath = path.join(outputDir, filename);
  await writeFile(filePath, Buffer.from(screenshot.imageBase64, 'base64'));
  return filePath;
}

function summarize(items, key) {
  return Object.fromEntries([...new Set(items.map((item) => item[key]))].map((id) => {
    const rows = items.filter((item) => item[key] === id);
    return [id, {
      total: rows.length,
      ok: rows.filter((item) => item.success).length,
      failed: rows.filter((item) => !item.success).length,
      avgRunMs: Math.round(rows.reduce((total, item) => total + Number(item.elapsedMs || 0), 0) / Math.max(1, rows.length))
    }];
  }));
}

function imageMimeTypeFromPath(value) {
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

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    parsed[key] = inlineValue ?? args[index + 1] ?? true;
    if (inlineValue === undefined && args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
  }
  return parsed;
}

function parseList(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeProgress(payload) {
  if (!progressFile) return;
  await mkdir(path.dirname(progressFile), { recursive: true });
  await appendFile(progressFile, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`, 'utf8');
}
