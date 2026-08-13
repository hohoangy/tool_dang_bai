process.env.NO_DB = process.env.NO_DB || 'true';
process.env.ENV_FILE = process.env.ENV_FILE || '.env';
process.env.MOBILE_LOG_STDOUT = process.env.MOBILE_LOG_STDOUT || 'true';

const { appendFile, mkdir, writeFile } = await import('fs/promises');
const path = await import('path');
const { spawn } = await import('child_process');
const { env } = await import('../server/src/config/env.js');
const { runCommand } = await import('../server/src/services/mobile/mobile-command.service.js');

const options = parseArgs(process.argv.slice(2));
const closeAfterEach = options.close === undefined ? true : !['0', 'false', 'no'].includes(String(options.close).toLowerCase());
const caseTimeoutMs = Math.max(20_000, Number(options.caseTimeoutMs || options.timeoutMs || 55_000));
const bootTimeoutMs = Math.max(12_000, Number(options.bootTimeoutMs || 45_000));
const processWaitMs = Math.max(6_000, Number(options.processWaitMs || 14_000));
const directTimeoutMs = Math.max(2_500, Number(options.directTimeoutMs || 4_000));
const actionTimeoutMs = Math.max(2_500, Number(options.actionTimeoutMs || 5_000));
const createSettleMs = Math.max(1_000, Number(options.createSettleMs || 4_000));
const userId = 'manual-instagram-create-smoke';
const reportFile = options.reportFile
  ? path.resolve(String(options.reportFile))
  : path.resolve('downloads', 'instagram-smoke-tests', `instagram-create-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const progressFile = options.progressFile
  ? path.resolve(String(options.progressFile))
  : reportFile.replace(/\.json$/i, '.jsonl');

const allInstances = [
  { label: 'LD1', index: 0, instanceName: 'LDPlayer', emulatorTarget: 'emulator-5554', directTarget: '127.0.0.1:5555' },
  { label: 'LD2', index: 1, instanceName: 'LDPlayer-1', emulatorTarget: 'emulator-5556', directTarget: '127.0.0.1:5557' },
  { label: 'LD3', index: 2, instanceName: 'LDPlayer-2', emulatorTarget: 'emulator-5558', directTarget: '127.0.0.1:5559' }
];
const only = parseList(options.only).map((value) => value.toUpperCase());
const instances = only.length
  ? allInstances.filter((instance) => only.includes(instance.label.toUpperCase()))
  : allInstances;
if (!instances.length) throw new Error(`No instances matched --only=${options.only}`);

const startedAt = Date.now();
const results = [];
console.log(`Instagram create smoke: ${instances.map((item) => item.label).join(', ')}`);
console.log(`caseTimeoutMs=${caseTimeoutMs}, bootTimeoutMs=${bootTimeoutMs}, closeAfterEach=${closeAfterEach}`);
console.log(`report=${reportFile}`);
await writeProgress({ type: 'start', instances: instances.map((item) => item.label), caseTimeoutMs, bootTimeoutMs });

for (const instance of instances) {
  const runStartedAt = Date.now();
  console.log(`\n[${instance.label}] smoke start ${instance.instanceName}`);
  const item = await withTimeout(
    runCreateSmoke(instance),
    caseTimeoutMs,
    `${instance.label} smoke vượt quá ${Math.round(caseTimeoutMs / 1000)} giây`
  ).catch((error) => ({
    ok: false,
    status: 'timeout_or_runtime_error',
    error: error.message || String(error),
    target: '',
    steps: []
  }));
  item.instance = instance.label;
  item.instanceName = instance.instanceName;
  item.elapsedMs = Date.now() - runStartedAt;

  if (closeAfterEach) {
    item.close = await closeInstance(instance, item.target || instance.emulatorTarget);
  }

  results.push(item);
  await writeProgress({ type: 'case-result', ...item });
  console.log(`[${instance.label}] status=${item.status} ok=${item.ok} target=${item.target || ''} elapsed=${item.elapsedMs}ms`);
  if (item.error) console.log(`  error: ${item.error}`);
}

const summary = {
  total: results.length,
  passed: results.filter((item) => item.ok).length,
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
    closeAfterEach,
    caseTimeoutMs,
    bootTimeoutMs,
    processWaitMs,
    directTimeoutMs,
    actionTimeoutMs,
    createSettleMs
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

async function runCreateSmoke(instance) {
  const steps = [];
  steps.push({ step: 'start_dnplayer', ...(await startDnPlayer(instance)) });

  const targetReady = await waitForAnyTarget(instance, bootTimeoutMs);
  steps.push({ step: 'wait_for_adb', ...targetReady });
  if (!targetReady.ok) {
    return {
      ok: false,
      status: 'adb_not_ready',
      target: '',
      error: targetReady.error || 'ADB chưa sẵn sàng.',
      steps
    };
  }
  const target = targetReady.target;

  const launch = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'monkey',
    '-p',
    'com.instagram.android',
    '-c',
    'android.intent.category.LAUNCHER',
    '1'
  ], { timeoutMs: actionTimeoutMs, retryTransient: false });
  steps.push({ step: 'launch_instagram', ...compactCommand(launch) });
  if (!launch.ok) {
    return {
      ok: false,
      status: 'instagram_launch_failed',
      target,
      error: launch.error || launch.stderr || 'Không mở được Instagram.',
      steps
    };
  }

  await delay(4_000);
  const beforeCreate = await readWindowState(target);
  steps.push({ step: 'before_create_window', ...beforeCreate.summary });
  if (beforeCreate.instagramAnr || beforeCreate.systemUiAnr) {
    await forceStopInstagram(target);
    return {
      ok: false,
      status: beforeCreate.instagramAnr ? 'instagram_anr_before_create' : 'system_ui_anr_before_create',
      target,
      error: beforeCreate.instagramAnr ? 'Instagram ANR trước khi bấm Create.' : 'System UI ANR trước khi bấm Create.',
      steps
    };
  }
  if (!beforeCreate.instagramForeground) {
    return {
      ok: false,
      status: 'instagram_not_foreground',
      target,
      error: 'Instagram chưa vào foreground sau khi mở.',
      steps
    };
  }

  const tap = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'input',
    'tap',
    '49',
    '994'
  ], { timeoutMs: actionTimeoutMs, retryTransient: false });
  steps.push({ step: 'tap_create', ...compactCommand(tap) });
  if (!tap.ok) {
    return {
      ok: false,
      status: 'tap_create_timeout',
      target,
      error: tap.error || tap.stderr || 'ADB tap Create không phản hồi.',
      steps
    };
  }

  await delay(createSettleMs);
  const afterCreate = await readWindowState(target);
  steps.push({ step: 'after_create_window', ...afterCreate.summary });
  if (afterCreate.instagramAnr || afterCreate.systemUiAnr) {
    await forceStopInstagram(target);
    return {
      ok: false,
      status: afterCreate.instagramAnr ? 'instagram_anr_after_create' : 'system_ui_anr_after_create',
      target,
      error: afterCreate.instagramAnr ? 'Instagram ANR sau khi bấm Create.' : 'System UI ANR sau khi bấm Create.',
      steps
    };
  }

  return {
    ok: true,
    status: 'create_tap_no_anr',
    target,
    error: '',
    steps,
    beforeCreate: beforeCreate.summary,
    afterCreate: afterCreate.summary
  };
}

async function startDnPlayer(instance) {
  const dnplayerPath = path.join(path.dirname(env.mobileAutomation.ldconsolePath), 'dnplayer.exe');
  const escaped = dnplayerPath.replace(/'/g, "''");
  const result = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath '${escaped}' -ArgumentList 'index=${instance.index}' -WindowStyle Hidden`
  ], { timeoutMs: 8_000, retryTransient: false }).catch((error) => ({
    ok: false,
    error: error.message || String(error),
    stdout: '',
    stderr: ''
  }));
  if (result.ok) return { ...compactCommand(result), command: dnplayerPath, args: [`index=${instance.index}`], method: 'powershell_start_process' };

  try {
    const child = spawn(dnplayerPath, [`index=${instance.index}`], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      cwd: path.dirname(dnplayerPath)
    });
    child.unref();
    return { ok: true, command: dnplayerPath, args: [`index=${instance.index}`], method: 'node_spawn_fallback' };
  } catch (error) {
    return { ok: false, command: dnplayerPath, args: [`index=${instance.index}`], error: error.message || String(error), method: 'node_spawn_fallback' };
  }
}

async function waitForAnyTarget(instance, timeoutMs) {
  const startedAt = Date.now();
  let last = null;
  let sawProcess = false;
  let relaunched = false;
  let adbRestartedAfterProcess = false;
  while (Date.now() - startedAt < timeoutMs) {
    const elapsedMs = Date.now() - startedAt;
    const ldState = await getLdPlayerInstance(instance.index);
    if (ldState?.running) sawProcess = true;

    const direct = await getTargetState(instance.directTarget, directTimeoutMs);
    if (direct.ok) return { ok: true, target: instance.directTarget, mode: 'direct', elapsedMs, ldState, sawProcess, relaunched };

    const emulator = await getTargetState(instance.emulatorTarget, directTimeoutMs);
    if (emulator.ok) return { ok: true, target: instance.emulatorTarget, mode: 'emulator', elapsedMs, ldState, sawProcess, relaunched };

    const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', instance.directTarget], {
      timeoutMs: directTimeoutMs,
      retryTransient: false
    });
    last = { direct, emulator, connect: compactCommand(connect), ldState, sawProcess, elapsedMs, adbRestartedAfterProcess };

    if (sawProcess && !adbRestartedAfterProcess && elapsedMs >= Math.min(18_000, Math.max(8_000, processWaitMs))) {
      const recovery = await restartAdbAndConnect(instance.directTarget);
      last.adbRestartAfterProcess = recovery;
      adbRestartedAfterProcess = true;
      const directAfterRecovery = await getTargetState(instance.directTarget, directTimeoutMs);
      if (directAfterRecovery.ok) {
        return {
          ok: true,
          target: instance.directTarget,
          mode: 'direct_after_adb_restart',
          elapsedMs: Date.now() - startedAt,
          ldState,
          sawProcess,
          relaunched,
          adbRestartedAfterProcess
        };
      }
      const emulatorAfterRecovery = await getTargetState(instance.emulatorTarget, directTimeoutMs);
      if (emulatorAfterRecovery.ok) {
        return {
          ok: true,
          target: instance.emulatorTarget,
          mode: 'emulator_after_adb_restart',
          elapsedMs: Date.now() - startedAt,
          ldState,
          sawProcess,
          relaunched,
          adbRestartedAfterProcess
        };
      }
    }

    if (!sawProcess && !relaunched && elapsedMs >= processWaitMs) {
      const relaunch = await startDnPlayer(instance);
      last.relaunch = relaunch;
      relaunched = true;
    }

    await delay(2_000);
  }
  return {
    ok: false,
    target: '',
    error: sawProcess
      ? `${instance.label} đã có process LD nhưng chưa attach ADB trong ${Math.round(timeoutMs / 1000)} giây.`
      : `${instance.label} chưa tạo process LD/ADB trong ${Math.round(timeoutMs / 1000)} giây.`,
    sawProcess,
    relaunched,
    adbRestartedAfterProcess,
    last
  };
}

async function restartAdbAndConnect(target) {
  const kill = await runCommand(env.mobileAutomation.adbPath, ['kill-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const start = await runCommand(env.mobileAutomation.adbPath, ['start-server'], {
    timeoutMs: 8_000,
    retryTransient: false
  }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const connect = await runCommand(env.mobileAutomation.adbPath, ['connect', target], {
    timeoutMs: 8_000,
    retryTransient: false
  }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  return {
    ok: /connected|already connected/i.test(`${connect.stdout || ''} ${connect.stderr || ''}`),
    kill: compactCommand(kill),
    start: compactCommand(start),
    connect: compactCommand(connect),
    error: connect.error || connect.stderr || ''
  };
}

async function getLdPlayerInstance(index) {
  const list = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], {
    timeoutMs: 5_000,
    retryTransient: false
  }).catch((error) => ({ ok: false, error: error.message || String(error), stdout: '', stderr: '' }));
  if (!list.ok || !list.stdout) return { ok: false, index, error: list.error || list.stderr || 'list2 failed' };
  const row = String(list.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().split(','))
    .find((item) => Number(item?.[0]) === Number(index));
  if (!row) return { ok: false, index, error: 'instance not found', raw: list.stdout };
  const processId = Number(row[5]);
  const boxProcessId = Number(row[6]);
  const androidStarted = Number(row[4]) > 0;
  return {
    ok: true,
    index,
    instanceName: row[1] || '',
    running: androidStarted || processId > 0 || boxProcessId > 0,
    androidStarted,
    processId: processId > 0 ? processId : null,
    boxProcessId: boxProcessId > 0 ? boxProcessId : null,
    raw: row.join(',')
  };
}

async function getTargetState(target, timeoutMs = 4_000) {
  const state = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], {
    timeoutMs,
    retryTransient: false
  }).catch((error) => ({ ok: false, error: error.message || String(error), stdout: '', stderr: '' }));
  return {
    ok: state.ok && String(state.stdout || '').trim() === 'device',
    target,
    stdout: state.stdout || '',
    stderr: state.stderr || '',
    error: state.error || ''
  };
}

async function readWindowState(target) {
  const result = await runCommand(env.mobileAutomation.adbPath, [
    '-s',
    target,
    'shell',
    'dumpsys',
    'window',
    'windows'
  ], { timeoutMs: actionTimeoutMs, retryTransient: false });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const focus = pickFirst(output, [
    /mCurrentFocus=([^\r\n]+)/i,
    /mFocusedWindow=([^\r\n]+)/i,
    /mFocusedApp=([^\r\n]+)/i
  ]);
  const app = pickFirst(output, [
    /mFocusedApp=([^\r\n]+)/i,
    /ActivityRecord\{[^\r\n]*com\.instagram\.android\/([^\s}]+)/i
  ]);
  return {
    ok: result.ok,
    instagramForeground: /com\.instagram\.android/i.test(`${focus} ${app}`),
    instagramAnr: /Application Not Responding:\s*com\.instagram\.android/i.test(output),
    systemUiAnr: /Application Not Responding:\s*com\.android\.systemui/i.test(output),
    summary: {
      ok: result.ok,
      focus,
      app,
      instagramForeground: /com\.instagram\.android/i.test(`${focus} ${app}`),
      instagramAnr: /Application Not Responding:\s*com\.instagram\.android/i.test(output),
      systemUiAnr: /Application Not Responding:\s*com\.android\.systemui/i.test(output),
      error: result.error || result.stderr || ''
    }
  };
}

async function forceStopInstagram(target) {
  return runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'am', 'force-stop', 'com.instagram.android'], {
    timeoutMs: actionTimeoutMs,
    retryTransient: false
  }).catch(() => null);
}

async function closeInstance(instance, target) {
  const app = target
    ? await forceStopInstagram(target)
    : null;
  const ldplayer = await runCommand(env.mobileAutomation.ldconsolePath, ['quit', '--index', String(instance.index)], {
    timeoutMs: 10_000,
    retryTransient: false
  }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  return {
    ok: Boolean(ldplayer.ok),
    app: compactCommand(app || {}),
    ldplayer: compactCommand(ldplayer),
    error: ldplayer.error || ldplayer.stderr || ''
  };
}

function compactCommand(result = {}) {
  return {
    ok: Boolean(result.ok),
    stdout: String(result.stdout || '').trim().slice(0, 500),
    stderr: String(result.stderr || '').trim().slice(0, 500),
    error: String(result.error || '').trim().slice(0, 500),
    durationMs: Number(result.durationMs || 0)
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    parsed[rawKey] = inlineValue !== undefined ? inlineValue : (args[index + 1]?.startsWith('--') ? true : args[++index]);
  }
  return parsed;
}

function parseList(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickFirst(value = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(value || '').match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, message) {
  let timeout = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message || `Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function writeProgress(payload) {
  await mkdir(path.dirname(progressFile), { recursive: true });
  await appendFile(progressFile, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`);
}
