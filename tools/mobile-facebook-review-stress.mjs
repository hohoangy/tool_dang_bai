process.env.NO_DB = process.env.NO_DB || 'true';
process.env.MOBILE_COMMAND_MOCK = process.env.MOBILE_COMMAND_MOCK || 'facebook-review';
process.env.MOBILE_STEP_DELAY_MS = process.env.MOBILE_STEP_DELAY_MS || '0';
process.env.LD_RUNTIME_HELPER_URL = '';

const fs = await import('fs/promises');
const path = await import('path');
const { existsSync } = await import('fs');
const { publishFacebookPostViaMobile } = await import('../server/src/services/mobile/automation-engine.service.js');

const options = parseArgs(process.argv.slice(2));
const iterations = Math.max(1, Number(options.iterations || options.n || 1000));
const concurrency = Math.max(1, Number(options.concurrency || options.c || 25));
const progressEvery = Math.max(1, Number(options.progressEvery || Math.ceil(iterations / 20)));
const maxFailures = Math.max(0, Number(options.maxFailures || 0));
const minRate = Math.max(0, Number(options.minRate || 0));
const textPrefix = String(options.text || 'stress composer review');
const scenarioPlan = parseScenarioPlan(options.scenarios || 'text:35,collage:35,share-chooser:20,system-ui-once:10');
const localePlan = parseList(options.locales || options.locale || 'vi');
const resolutionPlan = parseList(options.resolutions || options.resolution || '900x1600');
const collageImage = await resolveUploadImage(options.image || '');
const multiImages = await resolveUploadImages(options.images || '', Math.max(2, Number(options.imageCount || 3)));
const videoFixture = await resolveUploadVideo(options.video || '');
const startedAt = Date.now();
const failures = [];
const durations = [];
const scenarioStats = new Map();
const variantStats = new Map();
let completed = 0;
let nextIndex = 0;

console.log(`Mobile mock stress: facebook composer review, iterations=${iterations}, concurrency=${concurrency}`);
console.log(`Scenarios: ${scenarioPlan.map((item) => `${item.id}:${item.weight}`).join(', ')}`);
console.log(`Locales: ${localePlan.join(', ')}`);
console.log(`Resolutions: ${resolutionPlan.join(', ')}`);
console.log(`Collage fixture: ${collageImage?.name || 'not found'}`);
console.log(`Multi-image fixtures: ${multiImages.map((item) => item.name).join(', ') || 'not found'}`);
console.log(`Video fixture: ${videoFixture?.name || 'not found'}`);

async function worker(workerId) {
  while (nextIndex < iterations) {
    const index = nextIndex;
    nextIndex += 1;
    const scenario = pickScenario(index);
    const variant = pickVariant(index);
    try {
      const runStartedAt = Date.now();
      const result = await runOne(index, workerId, scenario, variant);
      const elapsed = Date.now() - runStartedAt;
      durations.push(elapsed);
      const validation = validateResult(result, scenario);
      recordScenario(scenario.id, validation.ok, elapsed);
      recordVariant(variant, validation.ok, elapsed);
      if (!validation.ok) {
        failures.push({
          index,
          workerId,
          scenario: scenario.id,
          variant,
          error: validation.error,
          result: pickResult(result)
        });
      }
    } catch (error) {
      durations.push(0);
      recordScenario(scenario.id, false, 0);
      recordVariant(variant, false, 0);
      failures.push({
        index,
        workerId,
        scenario: scenario.id,
        variant,
        error: error.message || String(error)
      });
    } finally {
      completed += 1;
      if (completed % progressEvery === 0 || completed === iterations) {
        const elapsedMs = Date.now() - startedAt;
        const rate = Math.round((completed / Math.max(1, elapsedMs)) * 1000);
        console.log(`progress ${completed}/${iterations}, failures=${failures.length}, rate=${rate}/s`);
      }
    }
  }
}

async function runOne(index, workerId, scenario, variant) {
  const target = `mock-${workerId}-${index}-scenario-${scenario.mockScenario}-locale-${variant.locale}-size-${variant.resolution}`;
  const account = {
    _id: `mock-account-${workerId}-${index}`,
    displayName: `Mock Facebook ${index}`,
    platform: 'facebook',
    instanceName: `LDPlayer-Mock-${workerId}`,
    deviceId: target,
    adbHost: '',
    metadata: {
      appPackage: 'com.facebook.katana'
    }
  };
  const text = `${textPrefix} run ${index} worker ${workerId}`;
  return publishFacebookPostViaMobile(account, 'mock-user', {
    text,
    appPackage: 'com.facebook.katana',
    autoSubmit: false,
    textInputMode: 'stable',
    waitAfterSubmitMs: 0,
    images: buildScenarioImages(scenario),
    videos: scenario.usesVideo && videoFixture ? [videoFixture] : []
  });
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));

const elapsedMs = Date.now() - startedAt;
const rate = Math.round((iterations / Math.max(1, elapsedMs)) * 1000);
durations.sort((left, right) => left - right);
const memory = process.memoryUsage();
const summary = {
  iterations,
  concurrency,
  progressEvery,
  maxFailures,
  minRate,
  elapsedMs,
  ratePerSecond: rate,
  latencyMs: {
    min: percentile(durations, 0),
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    max: percentile(durations, 100)
  },
  memoryMb: {
    rss: toMb(memory.rss),
    heapUsed: toMb(memory.heapUsed),
    heapTotal: toMb(memory.heapTotal)
  },
  scenarios: Object.fromEntries([...scenarioStats.entries()].map(([id, stats]) => [id, {
    runs: stats.runs,
    ok: stats.ok,
    failed: stats.failed,
    avgMs: Math.round(stats.elapsedMs / Math.max(1, stats.runs))
  }])),
  variants: Object.fromEntries([...variantStats.entries()].map(([id, stats]) => [id, {
    runs: stats.runs,
    ok: stats.ok,
    failed: stats.failed,
    avgMs: Math.round(stats.elapsedMs / Math.max(1, stats.runs))
  }])),
  failures: failures.length,
  sampleFailures: failures.slice(0, 10)
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > maxFailures || (minRate > 0 && rate < minRate)) process.exitCode = 1;

function validateResult(result = {}, scenario = {}) {
  if (!result.ok) return { ok: false, error: 'result_not_ok' };
  if (!['ready_to_post', 'composer'].includes(result.finalState)) {
    return { ok: false, error: `unexpected_final_state:${result.finalState || 'unknown'}` };
  }
  if (result.submitVerified !== false) return { ok: false, error: 'review_mode_must_not_submit' };
  if (result.composerPending) return { ok: false, error: 'composer_should_be_ready_for_review' };
  if (!result.screenshot?.ok) return { ok: false, error: 'screenshot_missing' };
  if (!result.screenshotVerified) return { ok: false, error: 'screenshot_not_verified' };

  const perfStages = result.perf?.stages?.map((stage) => stage.name) || [];
  if (scenario.usesImage && perfStages.includes('image_share_fallback_to_gallery')) {
    return { ok: false, error: 'collage_must_not_fallback_to_gallery' };
  }
  return { ok: true };
}

function parseScenarioPlan(value = '') {
  const definitions = new Map([
    ['text', { id: 'text', mockScenario: 'text', usesImage: false }],
    ['collage', { id: 'collage', mockScenario: 'collage', usesImage: true }],
    ['multi-image', { id: 'multi-image', mockScenario: 'multi-image', usesImage: true, usesMultiImage: true }],
    ['video', { id: 'video', mockScenario: 'video', usesVideo: true }],
    ['share-chooser', { id: 'share-chooser', mockScenario: 'share-chooser', usesImage: true }],
    ['system-ui-once', { id: 'system-ui-once', mockScenario: 'system-ui-once', usesImage: true }],
    ['collage-text-only', { id: 'collage-text-only', mockScenario: 'collage-text-only', usesImage: true }]
  ]);
  const parsed = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [id, rawWeight] = item.split(':');
      const definition = definitions.get(id);
      if (!definition) throw new Error(`Unknown scenario: ${id}`);
      return { ...definition, weight: Math.max(1, Number(rawWeight || 1)) };
    });
  return parsed.length ? parsed : [{ ...definitions.get('text'), weight: 1 }];
}

function buildScenarioImages(scenario = {}) {
  if (scenario.usesMultiImage) return multiImages;
  if (scenario.usesImage && collageImage) return [collageImage];
  return [];
}

function pickScenario(index) {
  const total = scenarioPlan.reduce((sum, item) => sum + item.weight, 0);
  let cursor = index % total;
  for (const scenario of scenarioPlan) {
    if (cursor < scenario.weight) return scenario;
    cursor -= scenario.weight;
  }
  return scenarioPlan[0];
}

function pickVariant(index) {
  const variants = [];
  for (const locale of localePlan) {
    for (const resolution of resolutionPlan) {
      variants.push({ locale, resolution });
    }
  }
  return variants[index % variants.length] || { locale: 'vi', resolution: '900x1600' };
}

function recordScenario(id, ok, elapsedMs) {
  const current = scenarioStats.get(id) || { runs: 0, ok: 0, failed: 0, elapsedMs: 0 };
  current.runs += 1;
  current.ok += ok ? 1 : 0;
  current.failed += ok ? 0 : 1;
  current.elapsedMs += elapsedMs;
  scenarioStats.set(id, current);
}

function recordVariant(variant, ok, elapsedMs) {
  const id = `${variant.locale}@${variant.resolution}`;
  const current = variantStats.get(id) || { runs: 0, ok: 0, failed: 0, elapsedMs: 0 };
  current.runs += 1;
  current.ok += ok ? 1 : 0;
  current.failed += ok ? 0 : 1;
  current.elapsedMs += elapsedMs;
  variantStats.set(id, current);
}

function parseList(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveUploadImage(value = '') {
  const uploadsDir = path.resolve('server', 'uploads');
  const candidate = value
    ? path.resolve(value.includes(path.sep) || value.includes('/') ? value : path.join(uploadsDir, value))
    : await findDefaultCollageImage(uploadsDir);
  if (!candidate || !existsSync(candidate)) return null;
  const filename = path.basename(candidate);
  return {
    url: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    imageUrl: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    name: filename.startsWith('facebook-collage') ? filename : `facebook-collage-mock-${filename}`,
    mimeType: mimeTypeFromPath(filename),
    size: 1
  };
}

async function resolveUploadImages(value = '', count = 3) {
  const uploadsDir = path.resolve('server', 'uploads');
  const requested = parseList(value);
  if (requested.length) {
    const resolved = [];
    for (const item of requested.slice(0, count)) {
      const media = await resolveUploadImage(item);
      if (media) resolved.push({ ...media, name: media.name.replace(/^facebook-collage-mock-/, 'multi-image-mock-') });
    }
    return resolved;
  }
  const files = await fs.readdir(uploadsDir).catch(() => []);
  const images = files
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file) && !file.startsWith('facebook-collage'))
    .slice(0, count);
  const resolved = await Promise.all(images.map((file) => resolveUploadImage(file)));
  return resolved
    .filter(Boolean)
    .map((item) => ({ ...item, name: item.name.replace(/^facebook-collage-mock-/, 'multi-image-mock-') }));
}

async function resolveUploadVideo(value = '') {
  const uploadsDir = path.resolve('server', 'uploads');
  const candidate = value
    ? path.resolve(value.includes(path.sep) || value.includes('/') ? value : path.join(uploadsDir, value))
    : await findDefaultVideo(uploadsDir);
  if (!candidate || !existsSync(candidate)) return null;
  const filename = path.basename(candidate);
  return {
    url: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    videoUrl: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    name: filename,
    mimeType: videoMimeTypeFromPath(filename),
    size: 1
  };
}

async function findDefaultCollageImage(uploadsDir) {
  const preferred = path.join(uploadsDir, 'facebook-collage-test-2-grid.jpg');
  if (existsSync(preferred)) return preferred;
  const files = await fs.readdir(uploadsDir).catch(() => []);
  const image = files.find((file) => /\.(jpe?g|png|webp)$/i.test(file));
  return image ? path.join(uploadsDir, image) : '';
}

async function findDefaultVideo(uploadsDir) {
  const files = await fs.readdir(uploadsDir).catch(() => []);
  const video = files.find((file) => /\.(mp4|mov|m4v|webm)$/i.test(file));
  return video ? path.join(uploadsDir, video) : '';
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

function pickResult(result = {}) {
  return {
    ok: result.ok,
    finalState: result.finalState,
    composerPending: result.composerPending,
    submitVerified: result.submitVerified,
    submitReason: result.submitReason,
    stepCount: result.stepCount,
    screenshotOk: Boolean(result.screenshot?.ok),
    screenshotVerified: Boolean(result.screenshotVerified),
    perfStages: result.perf?.stages?.map((stage) => stage.name) || []
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil((p / 100) * values.length) - 1));
  return values[index];
}

function toMb(value) {
  return Math.round((Number(value || 0) / 1024 / 1024) * 10) / 10;
}

function mimeTypeFromPath(value) {
  const extension = path.extname(String(value)).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  }[extension] || 'image/jpeg';
}

function videoMimeTypeFromPath(value) {
  const extension = path.extname(String(value)).toLowerCase();
  return {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm'
  }[extension] || 'video/mp4';
}
