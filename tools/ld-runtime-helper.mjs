import { execFile } from 'child_process';
import { createServer } from 'http';
import { existsSync } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const port = Number(process.env.LD_RUNTIME_HELPER_PORT || 5279);
const ldconsolePath = process.env.LDCONSOLE_PATH || 'D:\\LDPlayer\\LDPlayer9\\ldconsole.exe';
const adbPath = process.env.ADB_PATH || 'D:\\LDPlayer\\LDPlayer9\\adb.exe';
const ldBoxServicePath = process.env.LD_BOX_SERVICE_PATH || 'C:\\Program Files\\ldplayer9box\\Ld9BoxSVC.exe';
const launchQueue = Promise.resolve();
let queueTail = launchQueue;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(command, args = [], options = {}) {
  const startedAt = Date.now();
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd || path.dirname(command),
      timeout: options.timeoutMs || 60_000,
      windowsHide: options.windowsHide === true,
      maxBuffer: options.maxBuffer || 1024 * 1024
    });
    return {
      ok: true,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim()
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      durationMs: Date.now() - startedAt,
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || '').trim(),
      error: error.message
    };
  }
}

function parseAdbRows(output = '') {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state)
    .map(([serial, state]) => ({ serial, state }));
}

async function ensureLdBoxService() {
  const existing = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-Process Ld9BoxSVC -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id)'
  ], { timeoutMs: 5_000 });
  const existingPid = String(existing.stdout || '').trim();
  if (/^\d+$/.test(existingPid)) {
    return { ok: true, alreadyRunning: true, processId: Number(existingPid), check: existing };
  }

  if (!existsSync(ldBoxServicePath)) {
    return { ok: false, error: `Missing Ld9BoxSVC.exe: ${ldBoxServicePath}`, check: existing };
  }

  const started = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath "${ldBoxServicePath.replace(/"/g, '\\"')}" -WindowStyle Hidden`
  ], { timeoutMs: 10_000 });
  await delay(8_000);
  const verify = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-Process Ld9BoxSVC -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id)'
  ], { timeoutMs: 5_000 });
  const processId = String(verify.stdout || '').trim();
  return {
    ok: /^\d+$/.test(processId),
    alreadyRunning: false,
    processId: /^\d+$/.test(processId) ? Number(processId) : null,
    started,
    verify
  };
}

async function waitForDevice(target, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastDevices = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastDevices = await run(adbPath, ['devices'], { timeoutMs: 8_000 });
    const rows = parseAdbRows(lastDevices.stdout);
    const state = rows.find((row) => row.serial === target)?.state || '';
    if (state === 'device') {
      return {
        ok: true,
        target,
        state,
        elapsedMs: Date.now() - startedAt,
        devices: lastDevices
      };
    }
    await delay(state === 'offline' ? 2_500 : 1_000);
  }
  return {
    ok: false,
    target,
    elapsedMs: Date.now() - startedAt,
    devices: lastDevices,
    error: `ADB target ${target} was not ready.`
  };
}

async function launchLd(payload = {}) {
  const index = Number(payload.index);
  const target = payload.target || `emulator-${5554 + (index * 2)}`;
  if (!Number.isInteger(index) || index < 0) {
    return { ok: false, error: 'Missing or invalid LD index.' };
  }

  const startedAt = Date.now();
  const steps = [];
  const service = await ensureLdBoxService();
  steps.push({ step: 'ensure_ldbox_service', ...service });
  if (!service.ok) return { ok: false, target, elapsedMs: Date.now() - startedAt, steps, error: service.error || 'Ld9BoxSVC is not running.' };

  steps.push({ step: 'adb_kill_server', ...(await run(adbPath, ['kill-server'], { timeoutMs: 10_000 })) });
  const launch = await run(ldconsolePath, ['launch', '--index', String(index)], {
    timeoutMs: 20_000,
    windowsHide: false
  });
  steps.push({ step: 'ldconsole_launch', ...launch });
  if (!launch.ok) return { ok: false, target, elapsedMs: Date.now() - startedAt, steps, error: launch.error || launch.stderr || 'LD launch failed.' };

  await delay(Number(payload.initialWaitMs || 35_000));
  const device = await waitForDevice(target, Number(payload.timeoutMs || 120_000));
  steps.push({ step: 'wait_for_adb_device', ...device });
  return {
    ok: device.ok,
    target,
    elapsedMs: Date.now() - startedAt,
    steps,
    error: device.ok ? '' : device.error
  };
}

async function closeLd(payload = {}) {
  const index = Number(payload.index);
  const target = payload.target || `emulator-${5554 + (index * 2)}`;
  const packageName = String(payload.packageName || '').trim();
  if (!Number.isInteger(index) || index < 0) {
    return { ok: false, error: 'Missing or invalid LD index.' };
  }

  const startedAt = Date.now();
  const steps = [];
  const beforeDevices = await run(adbPath, ['devices'], { timeoutMs: 8_000 });
  steps.push({ step: 'adb_devices_before_close', ...beforeDevices });
  const beforeRows = parseAdbRows(beforeDevices.stdout);
  const targetState = beforeRows.find((row) => row.serial === target)?.state || '';

  if (targetState === 'device' && packageName) {
    steps.push({
      step: 'force_stop_app',
      ...(await run(adbPath, ['-s', target, 'shell', 'am', 'force-stop', packageName], { timeoutMs: 10_000 }))
    });
  }

  const quit = await run(ldconsolePath, ['quit', '--index', String(index)], {
    timeoutMs: 12_000,
    windowsHide: false
  });
  steps.push({ step: 'ldconsole_quit', ...quit });

  let finalDevices = null;
  let targetStillOnline = false;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await delay(1_000);
    finalDevices = await run(adbPath, ['devices'], { timeoutMs: 8_000 });
    const rows = parseAdbRows(finalDevices.stdout);
    targetStillOnline = rows.some((row) => row.serial === target);
    if (!targetStillOnline) {
      steps.push({ step: 'wait_target_offline', ok: true, attempt, devices: finalDevices });
      break;
    }
  }

  if (targetStillOnline) {
    const emuKill = await run(adbPath, ['-s', target, 'emu', 'kill'], { timeoutMs: 8_000 });
    steps.push({ step: 'adb_emu_kill', ...emuKill });
    await delay(2_000);
    finalDevices = await run(adbPath, ['devices'], { timeoutMs: 8_000 });
    targetStillOnline = parseAdbRows(finalDevices.stdout).some((row) => row.serial === target);
  }

  const rows = parseAdbRows(finalDevices?.stdout || '');
  if (!rows.length) {
    steps.push({ step: 'adb_kill_server_after_empty', ...(await run(adbPath, ['kill-server'], { timeoutMs: 10_000 })) });
  }

  return {
    ok: !targetStillOnline,
    target,
    elapsedMs: Date.now() - startedAt,
    steps,
    error: targetStillOnline ? `ADB target ${target} is still online after close.` : ''
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Request body too large.'));
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      send(res, 200, { ok: true, service: 'ld-runtime-helper', port });
      return;
    }
    if (req.method === 'POST' && req.url === '/launch') {
      const payload = await readBody(req);
      queueTail = queueTail.then(() => launchLd(payload));
      const result = await queueTail;
      send(res, result.ok ? 200 : 500, result);
      return;
    }
    if (req.method === 'POST' && req.url === '/close') {
      const payload = await readBody(req);
      queueTail = queueTail.then(() => closeLd(payload));
      const result = await queueTail;
      send(res, result.ok ? 200 : 500, result);
      return;
    }
    send(res, 404, { ok: false, error: 'Not found.' });
  } catch (error) {
    send(res, 500, { ok: false, error: error.message });
  }
});

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    const health = await checkExistingHelper();
    if (health.ok) {
      console.log(`LD runtime helper already running on http://127.0.0.1:${port}`);
      process.exit(0);
    }
    console.error(`Port ${port} is already in use, but the existing service is not ld-runtime-helper.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`LD runtime helper listening on http://127.0.0.1:${port}`);
});

function checkExistingHelper() {
  return new Promise((resolve) => {
    fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2_000) })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        resolve(Boolean(body?.ok && body?.service === 'ld-runtime-helper') ? body : { ok: false });
      })
      .catch(() => resolve({ ok: false }));
  });
}
