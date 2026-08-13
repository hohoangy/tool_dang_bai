process.env.NO_DB = process.env.NO_DB || 'true';
process.env.ENV_FILE = process.env.ENV_FILE || '.env';
process.env.MOBILE_LOG_STDOUT = process.env.MOBILE_LOG_STDOUT || 'true';

const { appendFile, mkdir, writeFile } = await import('fs/promises');
const path = await import('path');
const { env } = await import('../server/src/config/env.js');
const { runCommand } = await import('../server/src/services/mobile/mobile-command.service.js');
const { checkInstagramHealth, closeAccountSession } = await import('../server/src/services/mobile/automation-engine.service.js');

const options = parseArgs(process.argv.slice(2));
const caseTimeoutMs = Math.max(30_000, Number(options.caseTimeoutMs || options.timeoutMs || 95_000));
const coolDownMs = Math.max(1_000, Number(options.coolDownMs || 8_000));
const launchWarmupMs = Math.max(0, Number(options.launchWarmupMs || 30_000));
const processWaitMs = Math.max(0, Number(options.processWaitMs || 25_000));
const postAdbReadySettleMs = Math.max(0, Number(options.postAdbReadySettleMs ?? 60_000));
const closeAfterEach = options.close === undefined ? true : !['0', 'false', 'no'].includes(String(options.close).toLowerCase());
const openProfile = String(options.profile || 'sequential').toLowerCase();
const userId = 'manual-instagram-open-sequential';
const reportFile = options.reportFile
  ? path.resolve(String(options.reportFile))
  : path.resolve('downloads', 'instagram-open-tests', `instagram-open-sequential-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const progressFile = options.progressFile
  ? path.resolve(String(options.progressFile))
  : reportFile.replace(/\.json$/i, '.jsonl');

const allInstances = [
  { label: 'LD1', index: 0, instanceName: 'LDPlayer', deviceId: 'emulator-5554', directTarget: '127.0.0.1:5555' },
  { label: 'LD2', index: 1, instanceName: 'LDPlayer-1', deviceId: 'emulator-5556', directTarget: '127.0.0.1:5557' },
  { label: 'LD3', index: 2, instanceName: 'LDPlayer-2', deviceId: 'emulator-5558', directTarget: '127.0.0.1:5559' }
];
const only = parseList(options.only).map((value) => value.toUpperCase());
const instances = only.length
  ? allInstances.filter((instance) => only.includes(instance.label.toUpperCase()))
  : allInstances;

if (!instances.length) throw new Error(`No instances matched --only=${options.only}`);

const startedAt = Date.now();
const results = [];
console.log(`Instagram open sequential: ${instances.map((item) => item.label).join(', ')}`);
console.log(`caseTimeoutMs=${caseTimeoutMs}, closeAfterEach=${closeAfterEach}, coolDownMs=${coolDownMs}, launchWarmupMs=${launchWarmupMs}, processWaitMs=${processWaitMs}, postAdbReadySettleMs=${postAdbReadySettleMs}, profile=${openProfile}`);
console.log(`report=${reportFile}`);

await writeProgress({ type: 'start', instances: instances.map((item) => item.label), caseTimeoutMs, closeAfterEach, launchWarmupMs, processWaitMs, postAdbReadySettleMs });

for (const instance of instances) {
  const account = buildAccount(instance);
  const runStartedAt = Date.now();
  console.log(`\n[${instance.label}] opening Instagram on ${account.instanceName} (${account.deviceId})`);
  await writeProgress({ type: 'case-start', instance: instance.label, account });

  let health = null;
  let error = '';
  let preflight = null;
  try {
    preflight = await preflightWeakMachineInstance(instance);
    if (preflight && !preflight.ok) {
      health = {
        ok: false,
        automationReady: false,
        status: 'failed',
        target: preferredTarget(instance),
        checks: [{
          key: 'adb',
          ok: false,
          detail: preflight.error || `${instance.label} chưa attach được ADB ${targetCandidates(instance).join(' hoặc ')}.`
        }],
        steps: [],
        elapsedMs: preflight.elapsedMs || 0
      };
    } else if (preflight?.target) {
      account.adbHost = preflight.target;
      account.deviceId = preflight.target;
      health = await checkInstagramHealth(account, userId, {
        appPackage: 'com.instagram.android',
        readyAttemptsAfterLaunch: 3,
        postAdbReadySettleMs,
        openLdPlayerOptions: buildOpenLdPlayerOptions(caseTimeoutMs, openProfile)
      });
    } else {
      health = await checkInstagramHealth(account, userId, {
        appPackage: 'com.instagram.android',
        readyAttemptsAfterLaunch: 3,
        postAdbReadySettleMs,
        openLdPlayerOptions: buildOpenLdPlayerOptions(caseTimeoutMs, openProfile)
      });
    }
  } catch (caught) {
    error = caught?.message || String(caught);
  }

  const item = {
    instance: instance.label,
    instanceName: account.instanceName,
    requestedTarget: instance.deviceId,
    directTarget: instance.directTarget,
    resolvedTarget: health?.target || preflight?.target || account.deviceId,
    ok: Boolean(health?.ok),
    automationReady: Boolean(health?.automationReady),
    status: health?.status || (error || !health?.ok ? 'failed' : 'unknown'),
    category: categorizeResult(health, error),
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
  item.preflight = summarizePreflight(preflight);

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
    coolDownMs,
    launchWarmupMs,
    processWaitMs,
    postAdbReadySettleMs,
    profile: openProfile
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
    adbHost: instance.directTarget,
    deviceId: instance.deviceId,
    status: 'ready',
    metadata: {
      appPackage: 'com.instagram.android'
    }
  };
}

async function preflightWeakMachineInstance(instance) {
  if (openProfile === 'patient') return null;

  const startedAt = Date.now();
  const steps = [];
  const candidates = targetCandidates(instance);
  for (const target of candidates) {
    const initialState = await getTargetState(target);
    steps.push({ step: 'initial_get_state', target, ...initialState, atMs: Date.now() - startedAt });
    if (initialState.ok) {
      return { ok: true, target, elapsedMs: Date.now() - startedAt, steps };
    }
  }

  if (instance.directTarget) {
    const staleDisconnect = await runCommand(env.mobileAutomation.adbPath, ['disconnect', instance.directTarget], {
      timeoutMs: 5_000,
      retryTransient: false
    }).catch((error) => ({ ok: false, error: error.message || String(error) }));
    steps.push({ step: 'adb_disconnect_stale_direct', ok: staleDisconnect.ok, error: staleDisconnect.error || staleDisconnect.stderr || '', stdout: staleDisconnect.stdout || '' });
  }
  const launch = await startLdPlayer(instance.index);
  steps.push({ step: 'ldconsole_launch', ok: launch.ok, error: launch.error || launch.stderr || '', stdout: launch.stdout || '' });
  const launchList = await listLdPlayers();
  steps.push({ step: 'ldconsole_list2_after_launch', ok: launchList.ok, error: launchList.error || launchList.stderr || '', stdout: launchList.stdout || '' });
  const running = await waitForInstanceRunning(instance.index, processWaitMs);
  steps.push({ step: 'ldconsole_wait_running', ok: running.ok, error: running.error || '', stdout: running.stdout || '' });
  if (!running.ok) {
    const visibleLaunch = await startDnPlayerVisible(instance.index);
    steps.push({ step: 'dnplayer_visible_launch', ok: visibleLaunch.ok, error: visibleLaunch.error || visibleLaunch.stderr || '', stdout: visibleLaunch.stdout || '' });
    const visibleRunning = await waitForInstanceRunning(instance.index, Math.max(20_000, processWaitMs));
    steps.push({ step: 'dnplayer_visible_wait_running', ok: visibleRunning.ok, error: visibleRunning.error || '', stdout: visibleRunning.stdout || '' });
    if (!visibleRunning.ok) {
      return {
        ok: false,
        target: '',
        elapsedMs: Date.now() - startedAt,
        error: visibleRunning.error || running.error || `${instance.label} nhận lệnh launch nhưng LDPlayer chưa bật process sau ${Math.round(processWaitMs / 1000)} giây.`,
        steps
      };
    }
  }
  if (launchWarmupMs > 0) {
    await delay(launchWarmupMs);
    const warmupList = await listLdPlayers();
    steps.push({ step: 'ldconsole_list2_after_warmup', ok: warmupList.ok, error: warmupList.error || warmupList.stderr || '', stdout: warmupList.stdout || '' });
  }
  const deadlineMs = Math.max(12_000, Math.min(Number(options.preflightTimeoutMs || 75_000), caseTimeoutMs));
  const pollMs = Math.max(1_500, Number(options.preflightPollMs || 4_000));
  let lastState = null;
  let lastReconnect = null;

  while (Date.now() - startedAt < deadlineMs) {
    for (const target of candidates) {
      lastState = await getTargetState(target);
      steps.push({ step: 'get_state', target, ...lastState, atMs: Date.now() - startedAt });
      if (lastState.ok) return { ok: true, target, elapsedMs: Date.now() - startedAt, steps };

      if (isTcpTarget(target)) {
        lastReconnect = await reconnectTarget(target);
        steps.push({ step: 'adb_reconnect', target, ...lastReconnect, atMs: Date.now() - startedAt });
        lastState = await getTargetState(target);
        steps.push({ step: 'get_state_after_reconnect', target, ...lastState, atMs: Date.now() - startedAt });
        if (lastState.ok) return { ok: true, target, elapsedMs: Date.now() - startedAt, steps };
      }
    }

    await delay(pollMs);
  }

  let restart = null;
  for (const target of candidates) {
    restart = isTcpTarget(target)
      ? await restartAdbAndConnect(target)
      : await restartAdbServer();
    steps.push({ step: isTcpTarget(target) ? 'adb_restart_connect' : 'adb_restart_server', target, ...restart });
    const state = await getTargetState(target);
    steps.push({ step: 'get_state_after_adb_restart', target, ...state });
    if (state.ok) {
      return {
        ok: true,
        target,
        elapsedMs: Date.now() - startedAt,
        steps
      };
    }
    lastState = state;
  }
  return {
    ok: false,
    target: '',
    elapsedMs: Date.now() - startedAt,
    error: lastState?.error || lastState?.stderr || lastReconnect?.error || restart?.error || `${candidates.join(' / ')} chưa attach ADB sau ${Math.round(deadlineMs / 1000)} giây.`,
    steps
  };
}

function targetCandidates(instance) {
  return [instance.deviceId, instance.directTarget].filter(Boolean);
}

function preferredTarget(instance) {
  return instance.directTarget || instance.deviceId;
}

function isTcpTarget(target = '') {
  return /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(String(target));
}

async function startLdPlayer(index) {
  return runCommand(env.mobileAutomation.ldconsolePath, ['launch', '--index', String(index)], {
    timeoutMs: 20_000,
    retryTransient: false
  });
}

async function startDnPlayerVisible(index) {
  const dnplayerPath = path.join(path.dirname(env.mobileAutomation.ldconsolePath), 'dnplayer.exe');
  return runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath '${dnplayerPath.replace(/'/g, "''")}' -ArgumentList 'index=${index}'`
  ], {
    timeoutMs: 8_000,
    retryTransient: false
  });
}

async function listLdPlayers() {
  return runCommand(env.mobileAutomation.ldconsolePath, ['list2'], {
    timeoutMs: 8_000,
    retryTransient: false
  });
}

async function waitForInstanceRunning(index, timeoutMs) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt <= timeoutMs) {
    last = await listLdPlayers();
    const info = parseList2Instance(last.stdout || '', index);
    if (info?.running) {
      return {
        ok: true,
        stdout: last.stdout || '',
        instance: info,
        elapsedMs: Date.now() - startedAt
      };
    }
    if (timeoutMs <= 0) break;
    await delay(1_500);
  }
  return {
    ok: false,
    stdout: last?.stdout || '',
    error: `LD index ${index} chưa chuyển sang running trong ${Math.round(timeoutMs / 1000)} giây.`
  };
}

function parseList2Instance(output = '', index) {
  const line = String(output || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${index},`));
  if (!line) return null;
  const parts = line.split(',');
  return {
    index: Number(parts[0]),
    name: parts[1] || '',
    running: parts[4] === '1',
    processId: Number(parts[5] || -1),
    boxProcessId: Number(parts[6] || -1),
    raw: line
  };
}

async function getTargetState(target) {
  const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], {
    timeoutMs: 4_000,
    retryTransient: false
  });
  return {
    ok: state.ok && String(state.stdout || '').trim() === 'device',
    stdout: state.stdout || '',
    stderr: state.stderr || '',
    error: state.error || ''
  };
}

async function reconnectTarget(target) {
  const disconnect = await runCommand(env.mobileAutomation.adbPath, ['disconnect', target], {
    timeoutMs: 6_000,
    retryTransient: false
  });
  await delay(500);
  const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', target], {
    timeoutMs: 8_000,
    retryTransient: false
  });
  return {
    ok: /connected|already connected/i.test(`${connect.stdout || ''} ${connect.stderr || ''}`),
    disconnect,
    connect,
    error: connect.error || connect.stderr || ''
  };
}

async function restartAdbAndConnect(target) {
  const kill = await runCommand(env.mobileAutomation.adbPath, ['kill-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  });
  const start = await runCommand(env.mobileAutomation.adbPath, ['start-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  });
  const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', target], {
    timeoutMs: 8_000,
    retryTransient: false
  });
  return {
    ok: /connected|already connected/i.test(`${connect.stdout || ''} ${connect.stderr || ''}`),
    kill,
    start,
    connect,
    error: connect.error || connect.stderr || ''
  };
}

async function restartAdbServer() {
  const kill = await runCommand(env.mobileAutomation.adbPath, ['kill-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  });
  const start = await runCommand(env.mobileAutomation.adbPath, ['start-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  });
  return {
    ok: start.ok,
    kill,
    start,
    error: start.error || start.stderr || ''
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

function summarizePreflight(preflight = null) {
  if (!preflight) return null;
  return {
    ok: Boolean(preflight.ok),
    target: preflight.target || '',
    elapsedMs: Number(preflight.elapsedMs || 0),
    error: preflight.error || '',
    steps: Array.isArray(preflight.steps)
      ? preflight.steps.map((step) => ({
        step: step.step || '',
        ok: Boolean(step.ok),
        error: step.error || step.stderr || '',
        stdout: /^ldconsole_|^adb_disconnect_stale_direct$/.test(step.step || '') ? String(step.stdout || '').slice(0, 500) : ''
      }))
      : []
  };
}

function buildOpenLdPlayerOptions(timeoutMs, profile = 'sequential') {
  if (profile === 'patient') {
    return {
      engineWaitMs: Math.min(140_000, timeoutMs),
      engineNoDeviceAfterProcessMs: 130_000,
      directConnectMinProcessMs: 80_000,
      directConnectIntervalMs: 15_000,
      missingDeviceRecoveryWaitMs: 10_000,
      directConnectDelayMs: 12_000,
      recoveryEngineWaitMs: 10_000,
      relaunchDelayMs: 12_000,
      relaunchEngineWaitMs: 24_000,
      relaunchNoDeviceAfterProcessMs: 14_000
    };
  }

  return {
    postLaunchDelayMs: 6_000,
    engineWaitMs: Math.min(24_000, timeoutMs),
    engineNoDeviceAfterProcessMs: 14_000,
    directConnectMinProcessMs: 8_000,
    directConnectIntervalMs: 5_000,
    missingDeviceRecoveryWaitMs: 1_500,
    skipAdbDeviceRecovery: true,
    directConnectDelayMs: 2_000,
    recoveryEngineWaitMs: 3_000,
    relaunchDelayMs: 2_000,
    relaunchEngineWaitMs: 6_000,
    relaunchNoDeviceAfterProcessMs: 4_000
  };
}

function categorizeResult(health = null, error = '') {
  const text = JSON.stringify({ health, error }).slice(0, 6000);
  if (/ADB Debugging|ADB bridge|adb_bridge|LDPLAYER_ADB_BRIDGE_UNAVAILABLE|cổng ADB|port_closed|ECONNREFUSED|device ['"]?.+['"]? not found|no devices|chưa attach được ADB/i.test(text)) {
    return 'adb_bridge_unavailable';
  }
  if (/Instagram|com\.instagram\.android/i.test(text) && health?.ok) return 'instagram_opened';
  if (/timeout|timed out/i.test(text)) return 'timeout';
  return health?.ok ? 'opened' : 'failed';
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
