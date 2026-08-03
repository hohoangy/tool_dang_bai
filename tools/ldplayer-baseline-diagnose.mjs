import { execFile } from 'child_process';
import { readFile, writeFile, copyFile, stat } from 'fs/promises';
import net from 'net';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const options = parseArgs(process.argv.slice(2));
const ldRoot = options.ldRoot || 'D:\\LDPlayer\\LDPlayer9';
const baselineIndex = Number(options.baseline ?? 1);
const indexes = parseIndexes(options.indexes || '0,1,2');
const fixConfig = Boolean(options.fixConfig);

const ldconsole = path.join(ldRoot, 'ldconsole.exe');
const adb = path.join(ldRoot, 'adb.exe');
const configDir = path.join(ldRoot, 'vms', 'config');

const baseline = await readConfig(baselineIndex);
const devices = await run(adb, ['devices']);
const deviceRows = parseAdbDevices(devices.stdout || '');
const list2 = await run(ldconsole, ['list2']);
const instances = parseList2(list2.stdout || '');
const results = [];

for (const index of indexes) {
  const config = await readConfig(index);
  const instance = instances.find((item) => item.index === index) || null;
  const expectedTarget = `emulator-${5554 + (index * 2)}`;
  const localhostPort = 5555 + (index * 2);
  const externalState = deviceRows.find((row) => row.serial === expectedTarget)?.state || '';
  const bridge = await run(ldconsole, ['adb', '--index', String(index), '--command', 'get-state']);
  const bridgeState = String(bridge.stdout || '').trim();
  const port = await probeTcp('127.0.0.1', localhostPort);
  const configDiff = diffConfig(config, baseline);

  if (fixConfig && index !== baselineIndex) {
    await applyBaselineConfig(index, config, baseline);
  }

  results.push({
    index,
    name: instance?.name || `leidian${index}`,
    expectedTarget,
    localhostPort,
    running: Boolean(instance?.running),
    externalAdb: externalState || 'missing',
    ldconsoleBridge: bridgeState || (bridge.stderr || bridge.error || 'missing'),
    tcpPort: port.open ? 'open' : `closed:${port.error}`,
    configDiff,
    verdict: makeVerdict({ externalState, bridgeState, port, configDiff, index })
  });
}

console.log(JSON.stringify({
  baselineIndex,
  fixConfig,
  devices: deviceRows,
  results
}, null, 2));

function makeVerdict({ externalState, bridgeState, port, configDiff, index }) {
  if (externalState === 'device') return 'ready_external_adb';
  if (bridgeState === 'device') return 'usable_via_ldconsole_bridge';
  if (index === baselineIndex) return 'baseline_not_ready_now';
  if (configDiff.missingImportant.length) return `config_diff:${configDiff.missingImportant.join(',')}`;
  if (!port.open) return 'adb_bridge_unavailable';
  return 'needs_manual_ldplayer_repair';
}

function diffConfig(config, baselineConfig) {
  const importantKeys = [
    'basicSettings.adbDebug',
    'advancedSettings.resolution',
    'advancedSettings.resolutionDpi',
    'advancedSettings.cpuCount',
    'advancedSettings.memorySize',
    'basicSettings.lockWindow',
    'basicSettings.disableMouseFastOpt',
    'basicSettings.qjcjdisableMouseFast',
    'statusSettings.closeOption'
  ];
  const missingImportant = importantKeys.filter((key) => baselineConfig[key] !== undefined && config[key] === undefined);
  const differentImportant = importantKeys.filter((key) => (
    baselineConfig[key] !== undefined
    && config[key] !== undefined
    && JSON.stringify(config[key]) !== JSON.stringify(baselineConfig[key])
  ));
  return { missingImportant, differentImportant };
}

async function applyBaselineConfig(index, config, baselineConfig) {
  const targetPath = configPath(index);
  const backupPath = `${targetPath}.baseline-fix-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  await copyFile(targetPath, backupPath);
  const preserveIdentity = new Set([
    'propertySettings.phoneIMEI',
    'propertySettings.phoneIMSI',
    'propertySettings.phoneSimSerial',
    'propertySettings.phoneAndroidId',
    'propertySettings.phoneModel',
    'propertySettings.phoneManufacturer',
    'propertySettings.macAddress'
  ]);
  const next = { ...config };
  for (const [key, value] of Object.entries(baselineConfig)) {
    if (preserveIdentity.has(key)) continue;
    if (key.startsWith('advancedSettings.') || key.startsWith('basicSettings.') || key.startsWith('statusSettings.')) {
      next[key] = value;
    }
  }
  next['basicSettings.adbDebug'] = 1;
  await writeFile(targetPath, `${JSON.stringify(next, null, 4)}\n`, 'utf8');
}

async function readConfig(index) {
  const raw = await readFile(configPath(index), 'utf8');
  return JSON.parse(raw);
}

function configPath(index) {
  return path.join(configDir, `leidian${index}.config`);
}

async function probeTcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (open, error = '') => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ open, error });
    };
    socket.setTimeout(1_200, () => done(false, 'timeout'));
    socket.once('connect', () => done(true));
    socket.once('error', (error) => done(false, error?.code || error?.message || String(error)));
  });
}

async function run(command, args) {
  try {
    const result = await execFileAsync(command, args, { timeout: 10_000, windowsHide: true });
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      error: error.message
    };
  }
}

function parseAdbDevices(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state && serial !== 'List')
    .map(([serial, state]) => ({ serial, state }));
}

function parseList2(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',');
      const index = Number(parts[0]);
      return {
        index,
        name: parts[1] || '',
        running: Number(parts[4] || 0) > 0 || Number(parts[5] || -1) > 0 || Number(parts[6] || -1) > 0
      };
    })
    .filter((item) => Number.isInteger(item.index));
}

function parseIndexes(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 0);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fix-config') {
      parsed.fixConfig = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      parsed[match[1]] = match[2];
      continue;
    }
    if (arg.startsWith('--')) {
      parsed[arg.slice(2)] = argv[index + 1] || '';
      index += 1;
    }
  }
  return parsed;
}
