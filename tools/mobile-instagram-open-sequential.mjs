process.env.NO_DB = process.env.NO_DB || 'true';
process.env.ENV_FILE = process.env.ENV_FILE || '.env';
process.env.MOBILE_LOG_STDOUT = process.env.MOBILE_LOG_STDOUT || 'true';

const { appendFile, mkdir, writeFile } = await import('fs/promises');
const path = await import('path');
const { checkInstagramHealth, closeAccountSession } = await import('../server/src/services/mobile/automation-engine.service.js');

const options = parseArgs(process.argv.slice(2));
const caseTimeoutMs = Math.max(30_000, Number(options.caseTimeoutMs || options.timeoutMs || 95_000));
const coolDownMs = Math.max(1_000, Number(options.coolDownMs || 8_000));
const closeAfterEach = options.close === undefined ? true : !['0', 'false', 'no'].includes(String(options.close).toLowerCase());
const userId = 'manual-instagram-open-sequential';
const reportFile = options.reportFile
  ? path.resolve(String(options.reportFile))
  : path.resolve('downloads', 'instagram-open-tests', `instagram-open-sequential-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const progressFile = options.progressFile
  ? path.resolve(String(options.progressFile))
  : reportFile.replace(/\.json$/i, '.jsonl');

const allInstances = [
  { label: 'LD1', index: 0, instanceName: 'LDPlayer', deviceId: 'emulator-5554' },
  { label: 'LD2', index: 1, instanceName: 'LDPlayer-1', deviceId: 'emulator-5556' },
  { label: 'LD3', index: 2, instanceName: 'LDPlayer-2', deviceId: 'emulator-5558' }
];
const only = parseList(options.only).map((value) => value.toUpperCase());
const instances = only.length
  ? allInstances.filter((instance) => only.includes(instance.label.toUpperCase()))
  : allInstances;

if (!instances.length) throw new Error(`No instances matched --only=${options.only}`);

const startedAt = Date.now();
const results = [];
console.log(`Instagram open sequential: ${instances.map((item) => item.label).join(', ')}`);
console.log(`caseTimeoutMs=${caseTimeoutMs}, closeAfterEach=${closeAfterEach}, coolDownMs=${coolDownMs}`);
console.log(`report=${reportFile}`);

await writeProgress({ type: 'start', instances: instances.map((item) => item.label), caseTimeoutMs, closeAfterEach });

for (const instance of instances) {
  const account = buildAccount(instance);
  const runStartedAt = Date.now();
  console.log(`\n[${instance.label}] opening Instagram on ${account.instanceName} (${account.deviceId})`);
  await writeProgress({ type: 'case-start', instance: instance.label, account });

  let health = null;
  let error = '';
  try {
    health = await checkInstagramHealth(account, userId, {
      appPackage: 'com.instagram.android',
      readyAttemptsAfterLaunch: 3,
      openLdPlayerOptions: {
        engineWaitMs: Math.min(140_000, caseTimeoutMs),
        engineNoDeviceAfterProcessMs: 130_000,
        directConnectMinProcessMs: 80_000,
        directConnectIntervalMs: 15_000,
        missingDeviceRecoveryWaitMs: 10_000,
        directConnectDelayMs: 12_000,
        recoveryEngineWaitMs: 10_000,
        relaunchDelayMs: 12_000,
        relaunchEngineWaitMs: 24_000,
        relaunchNoDeviceAfterProcessMs: 14_000
      }
    });
  } catch (caught) {
    error = caught?.message || String(caught);
  }

  const item = {
    instance: instance.label,
    instanceName: account.instanceName,
    requestedTarget: instance.deviceId,
    resolvedTarget: health?.target || account.deviceId,
    ok: Boolean(health?.ok),
    automationReady: Boolean(health?.automationReady),
    status: health?.status || (error || !health?.ok ? 'failed' : 'unknown'),
    error,
    elapsedMs: Date.now() - runStartedAt,
    checks: summarizeChecks(health?.checks || []),
    foreground: summarizeAndroidState(health?.foreground),
    focus: summarizeAndroidState(health?.focus),
    systemUi: {
      ok: Boolean(health?.systemUi?.ok),
      recoveryCount: Number(health?.systemUi?.recoveryCount || 0),
      error: health?.systemUi?.error || ''
    },
    nodeCount: Number(health?.nodeCount || 0),
    screenshot: health?.screenshot
      ? {
        ok: Boolean(health.screenshot.ok),
        width: health.screenshot.width || 0,
        height: health.screenshot.height || 0,
        error: health.screenshot.error || ''
      }
      : null,
    steps: summarizeSteps(health?.steps || [])
  };

  console.log(`[${instance.label}] status=${item.status} ok=${item.ok} automationReady=${item.automationReady} elapsed=${item.elapsedMs}ms`);
  for (const check of item.checks) {
    console.log(`  - ${check.key}: ${check.ok ? 'ok' : 'fail'} - ${check.detail}`);
  }
  if (item.error) console.log(`  error: ${item.error}`);

  if (closeAfterEach) {
    const close = await closeAccountSession(account, userId, 'com.instagram.android')
      .catch((caught) => ({ ok: false, error: caught?.message || String(caught) }));
    item.close = {
      ok: Boolean(close?.ok),
      appOk: Boolean(close?.app?.ok),
      ldplayerOk: Boolean(close?.ldplayer?.ok),
      cleanupOk: Boolean(close?.cleanup?.ok),
      error: close?.error || close?.ldplayer?.error || close?.cleanup?.error || ''
    };
    console.log(`[${instance.label}] close ok=${item.close.ok}${item.close.error ? ` error="${item.close.error}"` : ''}`);
    await delay(coolDownMs);
  }

  results.push(item);
  await writeProgress({ type: 'case-result', ...item });
}

const summary = {
  total: results.length,
  ready: results.filter((item) => item.automationReady).length,
  opened: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok).length,
  elapsedMs: Date.now() - startedAt,
  byStatus: results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {})
};

const report = {
  generatedAt: new Date().toISOString(),
  options: {
    instances: instances.map((item) => item.label),
    caseTimeoutMs,
    closeAfterEach,
    coolDownMs
  },
  summary,
  results
};

await mkdir(path.dirname(reportFile), { recursive: true });
await writeFile(reportFile, JSON.stringify(report, null, 2));
await writeProgress({ type: 'summary', ...summary, reportFile });
console.log('\nSummary');
console.log(JSON.stringify({ ...summary, reportFile }, null, 2));
process.exitCode = summary.failed === 0 ? 0 : 1;

function buildAccount(instance) {
  return {
    _id: `instagram-${instance.label.toLowerCase()}-open-test`,
    id: `instagram-${instance.label.toLowerCase()}-open-test`,
    userId,
    platform: 'instagram',
    displayName: `Instagram ${instance.label}`,
    accountHandle: '',
    instanceName: instance.instanceName,
    adbHost: '',
    deviceId: instance.deviceId,
    status: 'ready',
    metadata: {
      appPackage: 'com.instagram.android'
    }
  };
}

function summarizeChecks(checks = []) {
  return checks.map((check) => ({
    key: check.key,
    ok: Boolean(check.ok),
    detail: check.detail || ''
  }));
}

function summarizeAndroidState(state = {}) {
  return {
    ok: Boolean(state?.ok),
    packageName: state?.packageName || '',
    activityName: state?.activityName || '',
    source: state?.source || '',
    error: state?.error || ''
  };
}

function summarizeSteps(steps = []) {
  return steps.map((step) => ({
    phase: step.phase || '',
    ok: Boolean(step.result?.ok),
    target: step.result?.target || '',
    error: step.result?.error || step.result?.stderr || '',
    launchMethod: step.result?.launchMethod || step.result?.launch?.launchMethod || '',
    reason: step.result?.reason || step.result?.engine?.reason || ''
  }));
}

async function writeProgress(payload) {
  await mkdir(path.dirname(progressFile), { recursive: true });
  await appendFile(progressFile, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`);
}

function parseList(value = '') {
  if (Array.isArray(value)) return value.flatMap((item) => parseList(item));
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
