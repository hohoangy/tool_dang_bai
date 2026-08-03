process.env.NO_DB = process.env.NO_DB || 'true';
process.env.MOBILE_COMMAND_MOCK = process.env.MOBILE_COMMAND_MOCK || 'instagram-review';
process.env.MOBILE_STEP_DELAY_MS = process.env.MOBILE_STEP_DELAY_MS || '0';
process.env.INSTAGRAM_FAST_SUBMIT_PROGRESS_MS = process.env.INSTAGRAM_FAST_SUBMIT_PROGRESS_MS || '180';
process.env.INSTAGRAM_SUBMIT_VERIFY_POLL_MS = process.env.INSTAGRAM_SUBMIT_VERIFY_POLL_MS || '90';
process.env.INSTAGRAM_STILL_ON_SHARE_MIN_MS = process.env.INSTAGRAM_STILL_ON_SHARE_MIN_MS || '300';
process.env.INSTAGRAM_STILL_ON_SHARE_SAMPLES = process.env.INSTAGRAM_STILL_ON_SHARE_SAMPLES || '3';
process.env.LD_RUNTIME_HELPER_URL = '';

const fs = await import('fs/promises');
const path = await import('path');
const { existsSync } = await import('fs');
const { publishInstagramPostViaMobile } = await import('../server/src/services/mobile/automation-engine.service.js');

const options = parseArgs(process.argv.slice(2));
const iterations = Math.max(1, Number(options.iterations || options.n || 1000));
const concurrency = Math.max(1, Number(options.concurrency || options.c || 25));
const progressEvery = Math.max(1, Number(options.progressEvery || Math.ceil(iterations / 20)));
const maxFailures = Math.max(0, Number(options.maxFailures || 0));
const minRate = Math.max(0, Number(options.minRate || 0));
const maxP95Ms = Math.max(0, Number(options.maxP95Ms || options.maxP95 || 0));
const maxP99Ms = Math.max(0, Number(options.maxP99Ms || options.maxP99 || 0));
const mode = ['submit', 'review'].includes(String(options.mode || '').toLowerCase())
  ? String(options.mode).toLowerCase()
  : 'review';
const autoSubmit = mode === 'submit';
const textPrefix = String(options.text || 'kiểm tra instagram');
const scenarioPlan = parseScenarioPlan(options.scenarios || 'single-photo:32,album-2:28,album-4:23,empty-caption:10,system-ui-once:7');
const localePlan = parseList(options.locales || options.locale || 'vi,en');
const resolutionPlan = parseList(options.resolutions || options.resolution || '720x1280,900x1600,1080x1920');
const imageFixtures = await resolveUploadImages(options.images || '', Math.max(4, Number(options.imageCount || 4)));
const startedAt = Date.now();
const failures = [];
const durations = [];
const scenarioStats = new Map();
const variantStats = new Map();
let completed = 0;
let nextIndex = 0;

console.log(`Mobile mock stress: instagram composer ${mode}, iterations=${iterations}, concurrency=${concurrency}`);
console.log(`Scenarios: ${scenarioPlan.map((item) => `${item.id}:${item.weight}`).join(', ')}`);
console.log(`Locales: ${localePlan.join(', ')}`);
console.log(`Resolutions: ${resolutionPlan.join(', ')}`);
console.log(`Image fixtures: ${imageFixtures.map((item) => item.name).join(', ') || 'generated mock URLs'}`);

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

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));

durations.sort((left, right) => left - right);
const elapsedMs = Date.now() - startedAt;
const rate = Math.round((iterations / Math.max(1, elapsedMs)) * 1000);
const memory = process.memoryUsage();
const summary = {
  iterations,
  concurrency,
  progressEvery,
  maxFailures,
  minRate,
  maxP95Ms,
  maxP99Ms,
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
  scenarios: Object.fromEntries([...scenarioStats.entries()].map(([id, stats]) => [id, summarizeStats(stats)])),
  variants: Object.fromEntries([...variantStats.entries()].map(([id, stats]) => [id, summarizeStats(stats)])),
  failures: failures.length,
  sampleFailures: failures.slice(0, 10)
};

console.log(JSON.stringify(summary, null, 2));
const budgetFailures = [];
if (failures.length > maxFailures) budgetFailures.push(`failures ${failures.length} > ${maxFailures}`);
if (minRate > 0 && rate < minRate) budgetFailures.push(`rate ${rate}/s < ${minRate}/s`);
if (maxP95Ms > 0 && summary.latencyMs.p95 > maxP95Ms) budgetFailures.push(`p95 ${summary.latencyMs.p95}ms > ${maxP95Ms}ms`);
if (maxP99Ms > 0 && summary.latencyMs.p99 > maxP99Ms) budgetFailures.push(`p99 ${summary.latencyMs.p99}ms > ${maxP99Ms}ms`);
if (budgetFailures.length) {
  console.error(`Performance budget failed: ${budgetFailures.join('; ')}`);
  process.exitCode = 1;
}

async function runOne(index, workerId, scenario, variant) {
  const target = `ig-mock-${workerId}-${index}-scenario-${scenario.mockScenario}-size-${variant.resolution}-variant_${variant.locale}`;
  const account = {
    _id: `mock-instagram-account-${workerId}-${index}`,
    displayName: `Mock Instagram ${index}`,
    platform: 'instagram',
    instanceName: `LDPlayer-Mock-${workerId}`,
    deviceId: target,
    adbHost: '',
    metadata: {
      appPackage: 'com.instagram.android'
    }
  };
  const text = scenario.emptyCaption ? '' : `${textPrefix} ${index} ${variant.locale}`;
  return publishInstagramPostViaMobile(account, 'mock-user', {
    text,
    appPackage: 'com.instagram.android',
    autoSubmit,
    cleanupAfterDryRun: !autoSubmit,
    waitAfterSubmitMs: 0,
    images: buildScenarioImages(scenario)
  });
}

function validateResult(result = {}, scenario = {}) {
  if (!result.ok) return { ok: false, error: 'result_not_ok' };
  if (result.autoSubmit !== autoSubmit) return { ok: false, error: `auto_submit:${result.autoSubmit}` };
  if (!result.screenshot?.ok) return { ok: false, error: 'screenshot_missing' };
  if (result.postType !== scenario.expectedPostType) return { ok: false, error: `post_type:${result.postType || 'unknown'}` };
  if (result.postType === 'carousel' && result.stepCount < 8) return { ok: false, error: 'carousel_steps_too_short' };
  if (scenario.expectedSubmitReason === 'pre_submit_gate_failed') {
    if (!autoSubmit) return { ok: false, error: 'gate_failure_requires_submit_mode' };
    if (result.submitVerified !== false) return { ok: false, error: 'gate_failure_must_not_submit' };
    if (!result.composerPending) return { ok: false, error: 'gate_failure_should_keep_composer_pending' };
    if (result.submitReason !== 'pre_submit_gate_failed') return { ok: false, error: `unexpected_gate_reason:${result.submitReason || 'unknown'}` };
    if (!result.failedComposerCleanup?.ok) return { ok: false, error: 'gate_failure_cleanup_missing' };
    if (result.resultStatus !== 'blocked_before_share') return { ok: false, error: `unexpected_result_status:${result.resultStatus || 'missing'}` };
    if (result.resultCategory !== 'pre_submit_gate') return { ok: false, error: `unexpected_result_category:${result.resultCategory || 'missing'}` };
    if (result.safeToRetry !== true) return { ok: false, error: 'gate_failure_should_be_safe_to_retry' };
    const failedChecks = Array.isArray(result.preSubmitGate?.failedChecks) ? result.preSubmitGate.failedChecks : [];
    const missing = (scenario.expectedGateFailures || []).filter((item) => !failedChecks.includes(item));
    if (missing.length) return { ok: false, error: `missing_gate_failures:${missing.join('|')}` };
    return { ok: true };
  }
  if (scenario.expectedSubmitReason === 'still_on_share_screen') {
    if (!autoSubmit) return { ok: false, error: 'post_submit_unverified_requires_submit_mode' };
    if (result.submitVerified !== false) return { ok: false, error: 'post_submit_unverified_must_not_be_verified' };
    if (!result.composerPending) return { ok: false, error: 'post_submit_unverified_should_keep_composer_pending' };
    if (result.submitReason !== 'still_on_share_screen') return { ok: false, error: `unexpected_unverified_reason:${result.submitReason || 'unknown'}` };
    if (result.resultStatus !== 'review_after_share') return { ok: false, error: `unexpected_result_status:${result.resultStatus || 'missing'}` };
    if (result.resultCategory !== 'post_submit_unverified') return { ok: false, error: `unexpected_result_category:${result.resultCategory || 'missing'}` };
    if (result.safeToRetry !== false) return { ok: false, error: 'post_submit_unverified_must_not_retry' };
    if (!result.preSubmitGate?.ok) return { ok: false, error: 'pre_submit_gate_must_pass_before_unverified_submit' };
    return { ok: true };
  }
  if (autoSubmit) {
    if (result.submitVerified !== true) return { ok: false, error: 'submit_must_be_verified' };
    if (result.composerPending) return { ok: false, error: 'composer_should_not_remain_pending_after_submit' };
    if (!result.preSubmitGate?.ok) return { ok: false, error: 'pre_submit_gate_must_pass' };
    if (result.resultStatus !== 'submitted_verified') return { ok: false, error: `unexpected_result_status:${result.resultStatus || 'missing'}` };
    if (result.resultCategory !== 'success') return { ok: false, error: `unexpected_result_category:${result.resultCategory || 'missing'}` };
    if (result.safeToRetry !== false) return { ok: false, error: 'verified_submit_must_not_retry' };
    if (!['sharing_progress_visible', 'share_progress_visible_fast_path', 'share_confirmation_visible', 'instagram_left_foreground_after_share', 'main_activity_after_share_progress'].includes(result.submitReason)) {
      return { ok: false, error: `unexpected_submit_reason:${result.submitReason || 'unknown'}` };
    }
    return { ok: true };
  }
  if (result.submitVerified !== false) return { ok: false, error: 'submit_must_not_be_verified_in_review' };
  if (result.composerPending) return { ok: false, error: 'composer_should_be_ready_for_review' };
  if (result.submitReason !== 'review_mode') return { ok: false, error: `unexpected_submit_reason:${result.submitReason || 'unknown'}` };
  if (!result.screenshotVerified) return { ok: false, error: 'screenshot_not_verified' };
  if (!result.dryRunCleanup?.ok) return { ok: false, error: 'dry_run_cleanup_missing' };
  if (result.resultStatus !== 'review_ready') return { ok: false, error: `unexpected_result_status:${result.resultStatus || 'missing'}` };
  if (result.resultCategory !== 'review') return { ok: false, error: `unexpected_result_category:${result.resultCategory || 'missing'}` };
  if (result.safeToRetry !== true) return { ok: false, error: 'review_mode_should_be_safe_to_retry' };
  return { ok: true };
}

function parseScenarioPlan(value = '') {
  const definitions = new Map([
    ['single-photo', { id: 'single-photo', mockScenario: 'single-photo', imageCount: 1, expectedPostType: 'singlePhoto' }],
    ['album-2', { id: 'album-2', mockScenario: 'album-2', imageCount: 2, expectedPostType: 'carousel' }],
    ['album-4', { id: 'album-4', mockScenario: 'album-4', imageCount: 4, expectedPostType: 'carousel' }],
    ['empty-caption', { id: 'empty-caption', mockScenario: 'empty-caption', imageCount: 1, expectedPostType: 'singlePhoto', emptyCaption: true }],
    ['system-ui-once', { id: 'system-ui-once', mockScenario: 'system-ui-once', imageCount: 1, expectedPostType: 'singlePhoto' }],
    ['submit-unverified', { id: 'submit-unverified', mockScenario: 'submit-unverified', imageCount: 1, expectedPostType: 'singlePhoto', expectedSubmitReason: 'still_on_share_screen' }],
    ['gate-no-share', { id: 'gate-no-share', mockScenario: 'gate-no-share', imageCount: 1, expectedPostType: 'singlePhoto', expectedSubmitReason: 'pre_submit_gate_failed', expectedGateFailures: ['shareButtonOk'] }],
    ['gate-no-media', { id: 'gate-no-media', mockScenario: 'gate-no-media', imageCount: 1, expectedPostType: 'singlePhoto', expectedSubmitReason: 'pre_submit_gate_failed', expectedGateFailures: ['mediaOk'] }]
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
  return parsed.length ? parsed : [{ ...definitions.get('single-photo'), weight: 1 }];
}

function buildScenarioImages(scenario = {}) {
  const count = Math.max(1, scenario.imageCount || 1);
  const fixtures = imageFixtures.length ? imageFixtures : createSyntheticImages(count);
  return Array.from({ length: count }, (_, index) => fixtures[index % fixtures.length]);
}

function createSyntheticImages(count) {
  return Array.from({ length: count }, (_, index) => ({
    url: `http://localhost:5000/uploads/mock-instagram-${index + 1}.jpg`,
    imageUrl: `http://localhost:5000/uploads/mock-instagram-${index + 1}.jpg`,
    name: `mock-instagram-${index + 1}.jpg`,
    mimeType: 'image/jpeg',
    size: 1
  }));
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
    for (const resolution of resolutionPlan) variants.push({ locale, resolution });
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

function summarizeStats(stats) {
  return {
    runs: stats.runs,
    ok: stats.ok,
    failed: stats.failed,
    avgMs: Math.round(stats.elapsedMs / Math.max(1, stats.runs))
  };
}

function parseList(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveUploadImages(value = '', count = 4) {
  const uploadsDir = path.resolve('server', 'uploads');
  const requested = parseList(value);
  if (requested.length) {
    const resolved = [];
    for (const item of requested.slice(0, count)) {
      const media = await resolveUploadImage(item);
      if (media) resolved.push(media);
    }
    return resolved;
  }
  const files = await fs.readdir(uploadsDir).catch(() => []);
  const images = files.filter((file) => /\.(jpe?g|png|webp)$/i.test(file)).slice(0, count);
  const resolved = await Promise.all(images.map((file) => resolveUploadImage(file)));
  return resolved.filter(Boolean);
}

async function resolveUploadImage(value = '') {
  const uploadsDir = path.resolve('server', 'uploads');
  const candidate = path.resolve(value.includes(path.sep) || value.includes('/') ? value : path.join(uploadsDir, value));
  if (!candidate || !existsSync(candidate)) return null;
  const filename = path.basename(candidate);
  return {
    url: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    imageUrl: `http://localhost:5000/uploads/${encodeURIComponent(filename)}`,
    name: filename,
    mimeType: mimeTypeFromPath(filename),
    size: 1
  };
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
    postType: result.postType,
    finalState: result.finalState,
    composerPending: result.composerPending,
    submitVerified: result.submitVerified,
    submitReason: result.submitReason,
    resultStatus: result.resultStatus || '',
    resultCategory: result.resultCategory || '',
    safeToRetry: Boolean(result.safeToRetry),
    preSubmitGateOk: Boolean(result.preSubmitGate?.ok),
    stepCount: result.stepCount,
    screenshotOk: Boolean(result.screenshot?.ok),
    screenshotVerified: Boolean(result.screenshotVerified),
    dryRunCleanupOk: Boolean(result.dryRunCleanup?.ok),
    failedComposerCleanupOk: Boolean(result.failedComposerCleanup?.ok),
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
