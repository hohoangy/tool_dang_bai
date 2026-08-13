process.env.NO_DB = process.env.NO_DB || 'true';
process.env.MOBILE_COMMAND_MOCK = '';
process.env.ENV_FILE = process.env.ENV_FILE || '.env';
process.env.MOBILE_LOG_STDOUT = process.env.MOBILE_LOG_STDOUT || 'true';

const { appendFile, mkdir, readdir, writeFile } = await import('fs/promises');
const path = await import('path');
const { existsSync } = await import('fs');
const { publishInstagramPostViaMobile, closeAccountSession, captureScreenshot, openLdPlayer } = await import('../server/src/services/mobile/automation-engine.service.js');
const { env } = await import('../server/src/config/env.js');
const { runCommand } = await import('../server/src/services/mobile/mobile-command.service.js');

const options = parseArgs(process.argv.slice(2));
const retries = Math.max(0, Number(options.retries || 1));
const caseTimeoutMs = Math.max(30_000, Number(options.caseTimeoutMs || options.timeoutMs || 150_000));
const singlePhotoTimeoutMs = Math.max(30_000, Number(options.singlePhotoTimeoutMs || process.env.INSTAGRAM_REVIEW_SINGLE_PHOTO_TIMEOUT_MS || Math.min(caseTimeoutMs, 90_000)));
const bootTimeoutMs = Math.max(30_000, Number(options.bootTimeoutMs || 75_000));
const adbWatchdogGraceMs = Math.max(8_000, Number(options.adbWatchdogGraceMs || process.env.INSTAGRAM_REVIEW_ADB_WATCHDOG_GRACE_MS || 15_000));
const adbWatchdogIntervalMs = Math.max(2_000, Number(options.adbWatchdogIntervalMs || process.env.INSTAGRAM_REVIEW_ADB_WATCHDOG_INTERVAL_MS || 5_000));
const adbWatchdogOfflineSamples = Math.max(1, Number(options.adbWatchdogOfflineSamples || process.env.INSTAGRAM_REVIEW_ADB_WATCHDOG_OFFLINE_SAMPLES || 2));
const launcherWatchdogGraceMs = Math.max(12_000, Number(options.launcherWatchdogGraceMs || process.env.INSTAGRAM_REVIEW_LAUNCHER_WATCHDOG_GRACE_MS || 25_000));
const launcherWatchdogSamples = Math.max(1, Number(options.launcherWatchdogSamples || process.env.INSTAGRAM_REVIEW_LAUNCHER_WATCHDOG_SAMPLES || 1));
const manualOpenMode = parseBooleanOption(options.manualOpen || process.env.INSTAGRAM_REVIEW_MANUAL_OPEN);
const noLaunch = manualOpenMode || parseBooleanOption(options.noLaunch || process.env.INSTAGRAM_REVIEW_NO_LAUNCH);
const keepOpen = manualOpenMode || parseBooleanOption(options.keepOpen || process.env.INSTAGRAM_REVIEW_KEEP_OPEN);
const scenarioIds = parseList(options.scenarios || 'single-photo,album-2,album-4,empty-caption');
const reportFile = options.reportFile ? path.resolve(String(options.reportFile)) : '';
const markdownReportFile = options.markdownReportFile ? path.resolve(String(options.markdownReportFile)) : '';
const progressFile = options.progressFile
  ? path.resolve(String(options.progressFile))
  : path.resolve('downloads', 'instagram-review-tests', 'reports', `instagram-review-progress-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const userId = 'manual-instagram-review-user';
const allInstances = [
  { label: 'LD1', index: 0, instanceName: 'LDPlayer', deviceId: 'emulator-5554', adbHost: '127.0.0.1:5555' },
  { label: 'LD2', index: 1, instanceName: 'LDPlayer-1', deviceId: 'emulator-5556', adbHost: '127.0.0.1:5557' },
  { label: 'LD3', index: 2, instanceName: 'LDPlayer-2', deviceId: 'emulator-5558', adbHost: '127.0.0.1:5559' }
];
const onlyLabels = parseList(options.only).map((value) => value.toUpperCase());
const instances = onlyLabels.length
  ? allInstances.filter((instance) => onlyLabels.includes(instance.label.toUpperCase()))
  : allInstances;
if (!instances.length) throw new Error(`No LDPlayer instances matched --only=${options.only}`);

const imageFixtures = await resolveUploadImages(options.images || '', Math.max(4, Number(options.imageCount || 4)));
const scenarios = buildScenarios(scenarioIds, imageFixtures);
const startedAt = Date.now();
const results = [];
const failures = [];

console.log(`Instagram real review: instances=${instances.map((item) => item.label).join(', ')}, scenarios=${scenarios.map((item) => item.id).join(', ')}, autoSubmit=false`);
console.log(`Images: ${imageFixtures.map((item) => item.name).join(', ') || 'not found'}`);
console.log(`Case timeout: ${caseTimeoutMs}ms`);
console.log(`Boot timeout: ${bootTimeoutMs}ms`);
console.log(`Manual open mode: ${manualOpenMode ? 'yes' : 'no'}, noLaunch=${noLaunch ? 'yes' : 'no'}, keepOpen=${keepOpen ? 'yes' : 'no'}`);
console.log(`Progress: ${progressFile}`);
await writeProgress({
  type: 'start',
  instances: instances.map((item) => item.label),
  scenarios: scenarios.map((item) => item.id),
  images: imageFixtures.map((item) => item.name),
  caseTimeoutMs,
  bootTimeoutMs,
  manualOpenMode,
  noLaunch,
  keepOpen,
  startedAt: new Date(startedAt).toISOString()
});

for (const instance of instances) {
  const account = buildAccount(instance);
  console.log(`\n[${instance.label}] open/review sequence on ${account.instanceName} (${account.adbHost || account.deviceId})`);
  for (const scenario of scenarios) {
    const index = results.length + 1;
    const runStartedAt = Date.now();
    let item = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const preflight = await ensureRealReviewDeviceReady(account, instance, scenario);
      if (!preflight.ok) {
        const diagnostics = await collectPreflightDiagnostics(account, scenario, preflight.error || 'preflight_boot_failed');
        const { diagnosticScreenshot, ...reportDiagnostics } = diagnostics;
        const screenshotPath = await saveScreenshot(diagnosticScreenshot, instance.label, scenario.id, index);
        item = {
          index,
          instance: instance.label,
          scenario: scenario.id,
          imageCount: scenario.images.length,
          ok: false,
          error: preflight.error || 'preflight_boot_failed',
          resultCategory: 'ldplayer_adb_preflight',
          screenshotOk: Boolean(diagnosticScreenshot?.ok),
          screenshotPath,
          diagnostics: reportDiagnostics,
          preflight,
          attempt: attempt + 1,
          elapsedMs: Date.now() - runStartedAt,
          success: false,
          failureReason: `preflight_boot_failed:${normalizeReason(preflight.error || preflight.reason || '')}`
        };
        break;
      }
      console.log(`[${instance.label}] ${scenario.id} attempt ${attempt + 1}/${retries + 1} start`);
      const scenarioTimeoutMs = getScenarioTimeoutMs(scenario);
      await writeProgress({
        type: 'attempt-start',
        instance: instance.label,
        scenario: scenario.id,
        attempt: attempt + 1,
        caseTimeoutMs: scenarioTimeoutMs,
        defaultCaseTimeoutMs: caseTimeoutMs
      });
      try {
        const result = await withTimeout(
          withAdbWatchdog(account, instance, scenario, attempt + 1, runReview(account, scenario, index)),
          scenarioTimeoutMs,
          `${instance.label}/${scenario.id} vượt quá ${Math.round(scenarioTimeoutMs / 1000)} giây`
        );
        const screenshotPath = await saveScreenshot(result?.screenshot, instance.label, scenario.id, index);
        item = {
          index,
          instance: instance.label,
          scenario: scenario.id,
          imageCount: scenario.images.length,
          ok: Boolean(result?.ok),
          postType: result?.postType || '',
          finalState: result?.finalState || '',
          composerPending: Boolean(result?.composerPending),
          submitVerified: Boolean(result?.submitVerified),
          submitReason: result?.submitReason || '',
          resultStatus: result?.resultStatus || '',
          resultCategory: result?.resultCategory || '',
          safeToRetry: Boolean(result?.safeToRetry),
          screenshotOk: Boolean(result?.screenshot?.ok),
          screenshotVerified: Boolean(result?.screenshotVerified),
          dryRunCleanupOk: Boolean(result?.dryRunCleanup?.ok),
          screenshotPath,
          perfStages: result?.perf?.stages?.map((stage) => stage.name) || [],
          attempt: attempt + 1,
          elapsedMs: Date.now() - runStartedAt
        };
        item.success = isSafeReviewResult(item, scenario);
        item.failureReason = item.success ? '' : getReviewFailureReason(item, scenario);
        if (item.success || attempt >= retries) break;
      } catch (error) {
        const diagnostics = await collectTimeoutDiagnostics(account, scenario, error.message);
        const { diagnosticScreenshot, ...reportDiagnostics } = diagnostics;
        const screenshot = diagnosticScreenshot || await withTimeout(
          captureScreenshot(account, userId, `instagram_review_${scenario.id}_error`),
          10_000,
          `${instance.label}/${scenario.id} screenshot timeout`
        ).catch(() => null);
        const screenshotPath = await saveScreenshot(screenshot, instance.label, scenario.id, index);
        item = {
          index,
          instance: instance.label,
          scenario: scenario.id,
          imageCount: scenario.images.length,
          ok: false,
          error: error.message,
          screenshotOk: Boolean(screenshot?.ok),
          screenshotPath,
          diagnostics: reportDiagnostics,
          attempt: attempt + 1,
          elapsedMs: Date.now() - runStartedAt,
          success: false,
          failureReason: getReviewFailureReason({ error: error.message, screenshotOk: Boolean(screenshot?.ok) }, scenario)
        };
        const retryable = isRetryableReviewError(error.message);
        if (!keepOpen && retryable && attempt < retries) {
          const close = await closeInstagram(account).catch((closeError) => ({ ok: false, error: closeError.message }));
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
        await writeProgress({
          type: 'diagnostics',
          instance: instance.label,
          scenario: scenario.id,
          attempt: attempt + 1,
          diagnostics: summarizeDiagnostics(reportDiagnostics)
        });
        if (attempt >= retries || !retryable) break;
      }
      console.log(`[${instance.label}] ${scenario.id} retry ${attempt + 1}/${retries + 1}`);
    }

    results.push(item);
    if (!item.success) failures.push({ ...item, error: item.error || item.failureReason || 'unexpected_result' });
    await writeProgress({ type: 'run', ...item });
    console.log(`[${instance.label}] ${scenario.id} success=${item.success} postType=${item.postType || 'error'} screenshotVerified=${item.screenshotVerified || false} cleanup=${item.dryRunCleanupOk || false} elapsed=${item.elapsedMs}ms`);
    if (keepOpen) {
      console.log(`[${instance.label}] ${scenario.id} keepOpen=true, skip close`);
      await writeProgress({
        type: 'close-skipped',
        instance: instance.label,
        scenario: scenario.id,
        reason: manualOpenMode ? 'manual_open_mode' : 'keep_open'
      });
      continue;
    }
    const close = await closeInstagram(account).catch((error) => ({ ok: false, error: error.message }));
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
  verdict: successCount === results.length ? 'pass' : 'review_required',
  elapsedMs,
  avgRunMs: Math.round(results.reduce((total, item) => total + Number(item.elapsedMs || 0), 0) / Math.max(1, results.length)),
  byInstance: summarize(results, 'instance'),
  byScenario: summarize(results, 'scenario'),
  byResultCategory: summarize(results, 'resultCategory'),
  byFailureReason: summarizeFailures(results),
  actionItems: buildActionItems(failures),
  sampleFailures: failures.slice(0, 8),
  lastScreenshots: results.slice(-8).map((item) => item.screenshotPath).filter(Boolean)
};

const report = {
  generatedAt: new Date().toISOString(),
  options: {
    instances: instances.map((item) => item.label),
    scenarios: scenarios.map((item) => item.id),
    retries,
    caseTimeoutMs,
    singlePhotoTimeoutMs,
    bootTimeoutMs,
    manualOpenMode,
    noLaunch,
    keepOpen,
    progressFile,
    imageNames: imageFixtures.map((item) => item.name)
  },
  summary,
  results
};

const savedReportPath = await saveReport(report);
const savedMarkdownReportPath = await saveMarkdownReport(report, savedReportPath);
console.log('\nInstagram real review summary');
console.log(JSON.stringify({ ...summary, reportPath: savedReportPath, markdownReportPath: savedMarkdownReportPath }, null, 2));
await writeProgress({ type: 'summary', reportPath: savedReportPath, markdownReportPath: savedMarkdownReportPath, ...summary });
process.exit(successCount === results.length ? 0 : 1);

function runReview(account, scenario, index) {
  return publishInstagramPostViaMobile(account, userId, {
    text: scenario.emptyCaption ? '' : `${scenario.text} ${index}`,
    appPackage: 'com.instagram.android',
    autoSubmit: false,
    cleanupAfterDryRun: true,
    textInputMode: 'stable',
    waitAfterSubmitMs: 0,
    images: scenario.images
  });
}

function getScenarioTimeoutMs(scenario = {}) {
  if (scenario.id === 'single-photo') return singlePhotoTimeoutMs;
  return caseTimeoutMs;
}

async function ensureRealReviewDeviceReady(account, instance, scenario) {
  const target = getReviewTarget(account);
  const startedAt = Date.now();
  const initial = await getAdbState(target);
  if (initial.ready) return { ok: true, target, warm: true, elapsedMs: Date.now() - startedAt };
  const initialFallback = target !== account.deviceId && account.deviceId
    ? await getAdbState(account.deviceId)
    : { ready: false };
  if (initialFallback.ready) {
    account.adbHost = '';
    return { ok: true, target: account.deviceId, warm: true, fallbackFrom: target, elapsedMs: Date.now() - startedAt };
  }
  if (noLaunch) {
    const list2 = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
    const devices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
    const result = {
      ok: false,
      target,
      reason: 'manual_open_adb_not_ready',
      error: `${instance.label} đang ở chế độ manualOpen nhưng ${target} chưa sẵn sàng trong adb devices; không tự launch lại LD.`,
      initial: initial.result,
      fallback: initialFallback.result || null,
      list2: compactCommandResult(list2),
      devices: compactCommandResult(devices),
      elapsedMs: Date.now() - startedAt
    };
    await writeProgress({ type: 'device-preflight-manual-open-not-ready', instance: instance.label, scenario: scenario.id, ...result });
    console.log(`[${instance.label}] ${scenario.id} preflight manualOpen not-ready ${result.error}`);
    return result;
  }

  console.log(`[${instance.label}] ${scenario.id} preflight launch ${instance.instanceName} (${target})`);
  await writeProgress({
    type: 'device-preflight-start',
    instance: instance.label,
    scenario: scenario.id,
    target,
    initial: initial.result
  });
  const manualLaunch = await runCommand(env.mobileAutomation.ldconsolePath, ['launch', '--index', String(instance.index)], {
    timeoutMs: 10_000
  }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const manualReady = await waitForReviewEmulatorTarget(account, instance, scenario, startedAt, {
    launch: manualLaunch,
    maxWaitMs: Math.min(bootTimeoutMs, 90_000),
    pollMs: 5_000,
    failIfProcessMissingAfterMs: 18_000,
    failIfAdbMissingWithRunningProcessAfterMs: Math.min(bootTimeoutMs, 45_000)
  });
  if (manualReady.ok) {
    account.adbHost = '';
    await writeProgress({ type: 'device-preflight-ready', instance: instance.label, scenario: scenario.id, ...manualReady });
    console.log(`[${instance.label}] ${scenario.id} preflight ready manual=${account.deviceId} elapsed=${manualReady.elapsedMs}ms`);
    return manualReady;
  }
  const manualList2 = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const manualDevices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const manualClose = keepOpen
    ? { ok: true, skipped: true, reason: 'keep_open' }
    : await closeInstagram(account).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const manualFailed = {
    ok: false,
    target: account.deviceId || target,
    reason: 'emulator_adb_not_attached_after_manual_launch',
    error: `${instance.label} đã mở LDPlayer nhưng ${account.deviceId || target} không xuất hiện trong adb devices sau ${Math.round(Math.min(bootTimeoutMs, 90_000) / 1000)} giây; dừng case để tránh treo.`,
    manualReady,
    list2: compactCommandResult(manualList2),
    devices: compactCommandResult(manualDevices),
    close: manualClose,
    elapsedMs: Date.now() - startedAt
  };
  await writeProgress({ type: 'device-preflight-failed-fast', instance: instance.label, scenario: scenario.id, ...manualFailed });
  console.log(`[${instance.label}] ${scenario.id} preflight failed-fast ${manualFailed.error}`);
  return manualFailed;

  const open = await openLdPlayer(account, userId, {
    bootPackage: 'com.instagram.android',
    engineWaitMs: Math.min(28_000, bootTimeoutMs),
    engineNoDeviceAfterProcessMs: 15_000,
    missingDeviceRecoveryWaitMs: 5_000,
    recoveryEngineWaitMs: 12_000,
    relaunchDelayMs: 8_000,
    relaunchEngineWaitMs: 18_000,
    relaunchNoDeviceAfterProcessMs: 8_000
  }).catch((error) => ({
    ok: false,
    code: error.code || '',
    error: error.message || String(error),
    details: error.details || null
  }));
  const launch = open?.launch || open;
  const service = open?.engine?.service || open?.details?.service || null;
  await runCommand(env.mobileAutomation.adbPath, ['start-server'], { timeoutMs: 8_000 }).catch(() => null);
  if (open?.target && open.target !== target) {
    if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(open.target)) account.adbHost = open.target;
    else account.deviceId = open.target;
  }
  const readyAfterOpen = await getAdbState(getReviewTarget(account) || target);
  if (readyAfterOpen.ready) {
    const result = {
      ok: true,
      target: getReviewTarget(account) || target,
      warm: false,
      launch,
      service,
      engine: open?.engine || null,
      elapsedMs: Date.now() - startedAt
    };
    await writeProgress({ type: 'device-preflight-ready', instance: instance.label, scenario: scenario.id, ...result });
    console.log(`[${instance.label}] ${scenario.id} preflight ready elapsed=${result.elapsedMs}ms`);
    return result;
  }
  if (open?.code === 'LDPLAYER_ADB_BRIDGE_UNAVAILABLE') {
    const list2 = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
    const devices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
    const close = await closeInstagram(account).catch((error) => ({ ok: false, error: error.message || String(error) }));
    const result = {
      ok: false,
      target,
      reason: 'adb_bridge_unavailable_fast_fail',
      error: `${instance.label} đã mở LDPlayer nhưng ADB bridge chưa sẵn sàng; dừng nhanh để tránh treo.`,
      launch,
      service,
      engine: open?.engine || open?.details?.recovery?.engine || null,
      list2: compactCommandResult(list2),
      devices: compactCommandResult(devices),
      close,
      elapsedMs: Date.now() - startedAt
    };
    await writeProgress({ type: 'device-preflight-failed-fast', instance: instance.label, scenario: scenario.id, ...result });
    console.log(`[${instance.label}] ${scenario.id} preflight failed-fast ${result.error}`);
    return result;
  }
  const emulatorReadyAfterOpen = target !== account.deviceId && account.deviceId
    ? await getAdbState(account.deviceId)
    : { ready: false };
  if (emulatorReadyAfterOpen.ready) {
    account.adbHost = '';
    const result = {
      ok: true,
      target: account.deviceId,
      warm: false,
      fallbackFrom: target,
      launch,
      service,
      engine: open?.engine || null,
      elapsedMs: Date.now() - startedAt
    };
    await writeProgress({ type: 'device-preflight-ready', instance: instance.label, scenario: scenario.id, ...result });
    console.log(`[${instance.label}] ${scenario.id} preflight ready fallback=${account.deviceId} elapsed=${result.elapsedMs}ms`);
    return result;
  }
  const launchedInstance = await getLdPlayerList2Instance(instance.index);
  if (launch?.ok && launchedInstance && !launchedInstance.running) {
    const result = {
      ok: false,
      target,
      reason: 'ldconsole_launch_returned_ok_but_instance_not_running',
      error: `${instance.label} nhận lệnh launch nhưng LDPlayer không bật process; dừng sớm để tránh chờ ADB ${Math.round(bootTimeoutMs / 1000)} giây.`,
      launch,
      service,
      engine: open?.engine || null,
      instance: launchedInstance,
      elapsedMs: Date.now() - startedAt
    };
    await writeProgress({ type: 'device-preflight-failed-fast', instance: instance.label, scenario: scenario.id, ...result });
    console.log(`[${instance.label}] ${scenario.id} preflight failed-fast ${result.error}`);
    return result;
  }

  let last = initial;
  while (Date.now() - startedAt < bootTimeoutMs) {
    await delay(5_000);
    last = await getAdbState(getReviewTarget(account) || target);
    if (last.ready) {
      const result = {
        ok: true,
        target: getReviewTarget(account) || target,
        warm: false,
        launch,
        service,
        engine: open?.engine || null,
        elapsedMs: Date.now() - startedAt
      };
      await writeProgress({ type: 'device-preflight-ready', instance: instance.label, scenario: scenario.id, ...result });
      console.log(`[${instance.label}] ${scenario.id} preflight ready elapsed=${result.elapsedMs}ms`);
      return result;
    }
    if (target !== account.deviceId && account.deviceId) {
      const emulatorLast = await getAdbState(account.deviceId);
      if (emulatorLast.ready) {
        account.adbHost = '';
        const result = {
          ok: true,
          target: account.deviceId,
          warm: false,
          fallbackFrom: target,
          launch,
          service,
          engine: open?.engine || null,
          elapsedMs: Date.now() - startedAt
        };
        await writeProgress({ type: 'device-preflight-ready', instance: instance.label, scenario: scenario.id, ...result });
        console.log(`[${instance.label}] ${scenario.id} preflight ready fallback=${account.deviceId} elapsed=${result.elapsedMs}ms`);
        return result;
      }
    }
  }

  const list2 = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const devices = await runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  const result = {
    ok: false,
    target,
    reason: 'adb_device_not_ready_before_review',
    error: `${instance.label} không attach được ADB ${target} trong ${Math.round(bootTimeoutMs / 1000)} giây; bỏ qua workflow Instagram để tránh treo.`,
    launch,
    service,
    lastState: last.result,
    list2: compactCommandResult(list2),
    devices: compactCommandResult(devices),
    elapsedMs: Date.now() - startedAt
  };
  await writeProgress({ type: 'device-preflight-failed', instance: instance.label, scenario: scenario.id, ...result });
  console.log(`[${instance.label}] ${scenario.id} preflight failed ${result.error}`);
  return result;
}

function getReviewTarget(account) {
  return account.deviceId || account.adbHost;
}

async function waitForReviewEmulatorTarget(account, instance, scenario, startedAt, options = {}) {
  const target = account.deviceId;
  if (!target) return { ok: false, reason: 'missing_emulator_target', target: '' };
  const maxWaitMs = Math.max(5_000, Number(options.maxWaitMs || bootTimeoutMs));
  const pollMs = Math.max(1_000, Number(options.pollMs || 5_000));
  const failIfProcessMissingAfterMs = Math.max(0, Number(options.failIfProcessMissingAfterMs || 0));
  const failIfAdbMissingWithRunningProcessAfterMs = Math.max(0, Number(options.failIfAdbMissingWithRunningProcessAfterMs || 0));
  let lastState = null;
  let lastList2 = null;
  let processMissingSamples = 0;
  let runningWithoutAdbSamples = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    await delay(pollMs);
    const elapsedMs = Date.now() - startedAt;
    lastState = await getAdbState(target);
    if (lastState.ready) {
      return {
        ok: true,
        target,
        warm: false,
        manualLaunch: options.launch || null,
        elapsedMs
      };
    }
    lastList2 = await getLdPlayerList2Instance(instance.index).catch(() => null);
    const isRunning = Boolean(lastList2?.running);
    if (!isRunning) {
      processMissingSamples += 1;
      runningWithoutAdbSamples = 0;
    } else {
      runningWithoutAdbSamples += 1;
      processMissingSamples = 0;
    }
    await writeProgress({
      type: 'device-preflight-wait-emulator',
      instance: instance.label,
      scenario: scenario.id,
      target,
      ready: false,
      elapsedMs,
      state: lastState.result,
      ldplayer: lastList2
    });
    if (failIfProcessMissingAfterMs > 0 && elapsedMs >= failIfProcessMissingAfterMs && processMissingSamples >= 2) {
      return {
        ok: false,
        target,
        reason: 'ldplayer_process_not_running_after_launch',
        manualLaunch: options.launch || null,
        lastState: lastState?.result || null,
        ldplayer: lastList2,
        elapsedMs
      };
    }
    if (failIfAdbMissingWithRunningProcessAfterMs > 0 && elapsedMs >= failIfAdbMissingWithRunningProcessAfterMs && runningWithoutAdbSamples >= 3) {
      return {
        ok: false,
        target,
        reason: 'ldplayer_running_but_adb_not_attached',
        manualLaunch: options.launch || null,
        lastState: lastState?.result || null,
        ldplayer: lastList2,
        elapsedMs
      };
    }
  }
  return {
    ok: false,
    target,
    reason: 'emulator_target_not_ready_after_manual_launch',
    manualLaunch: options.launch || null,
    lastState: lastState?.result || null,
    ldplayer: lastList2,
    elapsedMs: Date.now() - startedAt
  };
}

async function getAdbState(target) {
  const result = await runCommand(env.mobileAutomation.adbPath, ['-s', target, 'get-state'], {
    timeoutMs: 4_000,
    retryTransient: false
  }).catch((error) => ({ ok: false, error: error.message || String(error), stdout: '', stderr: '' }));
  return {
    ready: Boolean(result.ok && String(result.stdout || '').trim() === 'device'),
    result: compactCommandResult(result)
  };
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

function withAdbWatchdog(account, instance, scenario, attempt, promise) {
  let timer = null;
  let stopped = false;
  let offlineSamples = 0;
  let launcherSamples = 0;
  const startedAt = Date.now();

  const watchdog = new Promise((_, reject) => {
    const tick = async () => {
      if (stopped) return;
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs < adbWatchdogGraceMs) {
        timer = setTimeout(tick, adbWatchdogIntervalMs);
        return;
      }

      const target = getReviewTarget(account);
      const state = await getAdbState(target);
      if (state.ready) {
        offlineSamples = 0;
      } else {
        offlineSamples += 1;
        await writeProgress({
          type: 'adb-watchdog',
          instance: instance.label,
          scenario: scenario.id,
          attempt,
          target,
          ready: false,
          offlineSamples,
          threshold: adbWatchdogOfflineSamples,
          elapsedMs,
          state: state.result
        });
        if (offlineSamples >= adbWatchdogOfflineSamples) {
          reject(new Error(`${instance.label}/${scenario.id} ADB offline trong lúc test (${target}); dừng sớm để tránh treo LD.`));
          return;
        }
      }

      if (elapsedMs >= launcherWatchdogGraceMs) {
        const focus = await getInstagramRuntimeFocus(target);
        const launcherFocused = isLauncherRuntimeFocus(focus);
        if (launcherFocused) {
          launcherSamples += 1;
          await writeProgress({
            type: 'launcher-watchdog',
            instance: instance.label,
            scenario: scenario.id,
            attempt,
            target,
            launcherSamples,
            threshold: launcherWatchdogSamples,
            elapsedMs,
            focus
          });
          if (launcherSamples >= launcherWatchdogSamples) {
            reject(new Error(`${instance.label}/${scenario.id} Instagram rơi về launcher trong lúc test; dừng sớm để tránh treo LD.`));
            return;
          }
        } else {
          launcherSamples = 0;
        }
      }
      timer = setTimeout(tick, adbWatchdogIntervalMs);
    };
    timer = setTimeout(tick, adbWatchdogIntervalMs);
  });

  return Promise.race([promise, watchdog]).finally(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
  });
}

async function getInstagramRuntimeFocus(target) {
  const [activity, focus] = await Promise.all([
    runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'dumpsys', 'activity', 'activities'], {
      timeoutMs: 5_000,
      retryTransient: false
    }).catch((error) => ({ ok: false, error: error.message || String(error), stdout: '', stderr: '' })),
    runCommand(env.mobileAutomation.adbPath, ['-s', target, 'shell', 'dumpsys', 'window', 'windows'], {
      timeoutMs: 5_000,
      retryTransient: false
    }).catch((error) => ({ ok: false, error: error.message || String(error), stdout: '', stderr: '' }))
  ]);
  return {
    ok: Boolean(activity.ok || focus.ok),
    foregroundActivity: pickForegroundActivity(activity.stdout || ''),
    windowFocus: pickWindowFocus(focus.stdout || ''),
    activityError: activity.ok ? '' : (activity.error || activity.stderr || ''),
    focusError: focus.ok ? '' : (focus.error || focus.stderr || '')
  };
}

function isLauncherRuntimeFocus(focus = {}) {
  const text = `${focus.foregroundActivity || ''} ${focus.windowFocus || ''}`;
  if (!text.trim()) return false;
  if (/com\.instagram\.android/i.test(text)) return false;
  return /com\.ldmnq\.launcher3|com\.android\.launcher|Launcher/i.test(text);
}

async function collectTimeoutDiagnostics(account, scenario, errorMessage = '') {
  const target = getReviewTarget(account);
  const commands = [
    ['getState', ['-s', target, 'get-state']],
    ['foregroundActivity', ['-s', target, 'shell', 'dumpsys', 'activity', 'activities']],
    ['windowFocus', ['-s', target, 'shell', 'dumpsys', 'window', 'windows']],
    ['topPackages', ['-s', target, 'shell', 'dumpsys', 'activity', 'top']]
  ];
  const results = {};
  for (const [name, args] of commands) {
    results[name] = await runCommand(env.mobileAutomation.adbPath, args, {
      timeoutMs: name === 'getState' ? 4_000 : 8_000,
      retryTransient: false
    }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  }
  const screenshot = await withTimeout(
    captureScreenshot(account, userId, `instagram_review_${scenario.id}_timeout`),
    10_000,
    `${account.instanceName}/${scenario.id} diagnostic screenshot timeout`
  ).catch(() => null);
  const diagnostics = {
    errorMessage,
    target,
    getState: compactCommandResult(results.getState),
    foregroundActivity: pickForegroundActivity(results.foregroundActivity?.stdout || ''),
    windowFocus: pickWindowFocus(results.windowFocus?.stdout || ''),
    topActivity: pickTopActivity(results.topPackages?.stdout || ''),
    commandErrors: Object.fromEntries(
      Object.entries(results)
        .filter(([, result]) => !result?.ok)
        .map(([name, result]) => [name, result?.error || result?.stderr || 'command_failed'])
    ),
    screenshot: compactScreenshot(screenshot),
    diagnosticScreenshot: screenshot
  };
  console.log(`[${account.instanceName}] ${scenario.id} diagnostics ${JSON.stringify(summarizeDiagnostics(diagnostics))}`);
  return diagnostics;
}

async function collectPreflightDiagnostics(account, scenario, errorMessage = '') {
  const target = getReviewTarget(account);
  const [list2, devices] = await Promise.all([
    runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) })),
    runCommand(env.mobileAutomation.adbPath, ['devices'], { timeoutMs: 8_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }))
  ]);
  const diagnostics = {
    errorMessage,
    target,
    getState: { ok: false, stdout: '', stderr: '', error: 'ADB target is not available; skipped device-only diagnostics.' },
    foregroundActivity: '',
    windowFocus: '',
    topActivity: '',
    commandErrors: {},
    list2: compactCommandResult(list2),
    devices: compactCommandResult(devices),
    screenshot: null,
    diagnosticScreenshot: null
  };
  console.log(`[${account.instanceName}] ${scenario.id} preflight diagnostics ${JSON.stringify({
    target,
    list2: diagnostics.list2.stdout || diagnostics.list2.error,
    devices: diagnostics.devices.stdout || diagnostics.devices.error,
    screenshotSkipped: true
  })}`);
  return diagnostics;
}

function summarizeDiagnostics(diagnostics = {}) {
  return {
    target: diagnostics.target || '',
    getState: diagnostics.getState?.stdout || diagnostics.getState?.error || '',
    foregroundActivity: diagnostics.foregroundActivity || '',
    windowFocus: diagnostics.windowFocus || '',
    topActivity: diagnostics.topActivity || '',
    commandErrors: diagnostics.commandErrors || {},
    screenshotOk: Boolean(diagnostics.screenshot?.ok)
  };
}

function compactScreenshot(screenshot = null) {
  if (!screenshot) return null;
  return {
    ok: Boolean(screenshot.ok),
    width: screenshot.width || null,
    height: screenshot.height || null,
    error: screenshot.error || null
  };
}

async function ensureLdBoxServiceForReview() {
  const existing = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-Process Ld9BoxSVC -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id)'
  ], { timeoutMs: 5_000 }).catch((error) => ({ ok: false, error: error.message || String(error), stdout: '' }));
  if (existing.ok && /^\d+$/.test(String(existing.stdout || '').trim())) {
    return { ok: true, alreadyRunning: true, processId: Number(String(existing.stdout || '').trim()) };
  }

  const candidates = [
    'C:\\Program Files\\ldplayer9box\\Ld9BoxSVC.exe',
    'C:\\Program Files (x86)\\ldplayer9box\\Ld9BoxSVC.exe'
  ];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) return { ok: false, error: 'Missing Ld9BoxSVC.exe', existing };

  const escapedExecutable = executable.replace(/"/g, '\\"');
  const started = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath "${escapedExecutable}" -WindowStyle Hidden`
  ], { timeoutMs: 10_000 }).catch((error) => ({ ok: false, error: error.message || String(error) }));
  await delay(8_000);
  const verify = await runCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-Process Ld9BoxSVC -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id)'
  ], { timeoutMs: 5_000 }).catch((error) => ({ ok: false, error: error.message || String(error), stdout: '' }));
  const processId = String(verify.stdout || '').trim();
  return {
    ok: /^\d+$/.test(processId),
    alreadyRunning: false,
    processId: /^\d+$/.test(processId) ? Number(processId) : null,
    started,
    verify
  };
}

async function getLdPlayerList2Instance(index) {
  const list2 = await runCommand(env.mobileAutomation.ldconsolePath, ['list2'], { timeoutMs: 8_000 })
    .catch((error) => ({ ok: false, error: error.message || String(error), stdout: '' }));
  if (!list2.ok || !list2.stdout) return null;
  return String(list2.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(','))
    .map((row) => {
      const rowIndex = Number(row?.[0]);
      const processId = Number(row?.[5]);
      const boxProcessId = Number(row?.[6]);
      const androidStarted = Number(row?.[4]) > 0;
      return {
        index: rowIndex,
        instanceName: row?.[1]?.trim() || '',
        running: androidStarted || processId > 0 || boxProcessId > 0,
        androidStarted,
        processId: processId > 0 ? processId : null,
        boxProcessId: boxProcessId > 0 ? boxProcessId : null,
        raw: row.join(',')
      };
    })
    .find((item) => item.index === index) || null;
}

function compactCommandResult(result = {}) {
  return {
    ok: Boolean(result.ok),
    stdout: String(result.stdout || '').trim().slice(0, 500),
    stderr: String(result.stderr || '').trim().slice(0, 500),
    error: String(result.error || '').trim().slice(0, 500)
  };
}

function pickForegroundActivity(value = '') {
  return pickFirstMatch(value, [
    /mResumedActivity:\s*(.+)/i,
    /topResumedActivity=([^\r\n]+)/i,
    /ResumedActivity:\s*(.+)/i
  ]);
}

function pickWindowFocus(value = '') {
  return pickFirstMatch(value, [
    /mCurrentFocus=([^\r\n]+)/i,
    /mFocusedApp=([^\r\n]+)/i
  ]);
}

function pickTopActivity(value = '') {
  return pickFirstMatch(value, [
    /ACTIVITY\s+([^\s]+)\s+/i,
    /Hist #0:\s*ActivityRecord\{[^\s]+\s+[^\s]+\s+([^\s]+)\s/i
  ]);
}

function pickFirstMatch(value = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(value || '').match(pattern);
    if (match?.[1]) return match[1].trim().slice(0, 500);
  }
  return '';
}

function isSafeReviewResult(item, scenario) {
  if (!item.ok || !item.screenshotOk || !item.screenshotVerified) return false;
  if (item.submitVerified !== false) return false;
  if (item.submitReason !== 'review_mode') return false;
  if (!item.dryRunCleanupOk) return false;
  if (scenario.expectedPostType && item.postType !== scenario.expectedPostType) return false;
  return true;
}

function getReviewFailureReason(item = {}, scenario = {}) {
  if (/ADB offline/i.test(item.error || '')) return `adb_watchdog:${normalizeReason(item.error)}`;
  if (/rơi về launcher|roi ve launcher|launcher/i.test(item.error || '')) return `launcher_watchdog:${normalizeReason(item.error)}`;
  if (item.error) return `runtime_error:${normalizeReason(item.error)}`;
  if (!item.ok) return 'result_not_ok';
  if (!item.screenshotOk) return 'screenshot_missing';
  if (!item.screenshotVerified) return 'screenshot_not_verified';
  if (item.submitVerified !== false) return 'unexpected_submit_signal';
  if (item.submitReason !== 'review_mode') return `unexpected_submit_reason:${item.submitReason || 'unknown'}`;
  if (!item.dryRunCleanupOk) return 'cleanup_failed';
  if (scenario.expectedPostType && item.postType !== scenario.expectedPostType) return `post_type_mismatch:${item.postType || 'unknown'}`;
  return 'unexpected_result';
}

function isRetryableReviewError(message = '') {
  return /adb|device|system ui|không phản hồi|khong phan hoi|isn't responding|input tap|uiautomator|unknown|offline|launcher|share intent|chưa mở thành công|chua mo thanh cong|instagram|media|composer/i.test(String(message));
}

function buildScenarios(ids, images) {
  if (images.length < 1) throw new Error('Instagram real review cần ít nhất 1 ảnh trong server/uploads hoặc truyền --images.');
  const definitions = new Map([
    ['single-photo', { id: 'single-photo', text: 'instagram real review single photo', imageCount: 1, expectedPostType: 'singlePhoto' }],
    ['album-2', { id: 'album-2', text: 'instagram real review album 2', imageCount: 2, expectedPostType: 'carousel' }],
    ['album-4', { id: 'album-4', text: 'instagram real review album 4', imageCount: 4, expectedPostType: 'carousel' }],
    ['empty-caption', { id: 'empty-caption', text: '', imageCount: 1, expectedPostType: 'singlePhoto', emptyCaption: true }]
  ]);
  return ids.map((id) => {
    const definition = definitions.get(id);
    if (!definition) throw new Error(`Unknown scenario: ${id}`);
    if (images.length < definition.imageCount) {
      throw new Error(`${id} cần ${definition.imageCount} ảnh nhưng chỉ tìm thấy ${images.length}.`);
    }
    return {
      ...definition,
      images: images.slice(0, definition.imageCount)
    };
  });
}

function buildAccount(instance) {
  return {
    _id: `instagram-${instance.label.toLowerCase()}-real-review`,
    id: `instagram-${instance.label.toLowerCase()}-real-review`,
    userId,
    platform: 'instagram',
    displayName: `Instagram Account ${instance.label}`,
    accountHandle: '',
    instanceName: instance.instanceName,
    adbHost: instance.adbHost || '',
    deviceId: instance.deviceId,
    status: 'ready',
    notes: 'Manual Instagram composer review test.',
    metadata: {
      appPackage: 'com.instagram.android'
    }
  };
}

function closeInstagram(account) {
  return closeAccountSession(account, userId, 'com.instagram.android');
}

async function resolveUploadImages(value = '', count = 4) {
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
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .slice(0, count);
  return (await Promise.all(images.map((file) => resolveUploadImage(file)))).filter(Boolean);
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

async function saveScreenshot(screenshot, instanceLabel, scenarioId, index) {
  if (!screenshot?.imageBase64) return '';
  const outputDir = path.resolve('downloads', 'instagram-review-tests', 'screenshots');
  await mkdir(outputDir, { recursive: true });
  const filename = `instagram-review-${String(index).padStart(2, '0')}-${instanceLabel}-${scenarioId}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filePath = path.join(outputDir, filename);
  await writeFile(filePath, Buffer.from(screenshot.imageBase64, 'base64'));
  return filePath;
}

async function saveReport(report) {
  const outputPath = reportFile || path.resolve('downloads', 'instagram-review-tests', 'reports', `instagram-review-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}

async function saveMarkdownReport(report, jsonReportPath) {
  const outputPath = markdownReportFile
    || jsonReportPath.replace(/\.json$/i, '.md');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buildMarkdownReport(report, jsonReportPath));
  return outputPath;
}

function buildMarkdownReport(report, jsonReportPath) {
  const { summary, results, options: reportOptions } = report;
  const lines = [
    '# Instagram Real Review Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Verdict: ${summary.verdict}`,
    `Result: ${summary.successCount}/${summary.total} passed`,
    `Elapsed: ${(summary.elapsedMs / 1000).toFixed(1)}s`,
    `JSON: ${jsonReportPath}`,
    '',
    '## Test Scope',
    '',
    `Instances: ${reportOptions.instances.join(', ') || 'none'}`,
    `Scenarios: ${reportOptions.scenarios.join(', ') || 'none'}`,
    `Images: ${reportOptions.imageNames.join(', ') || 'none'}`,
    `Retries: ${reportOptions.retries}`,
    '',
    '## Runs',
    '',
    '| # | Instance | Scenario | Status | ResultStatus | Safe Retry | Reason | Screenshot |',
    '|---|---|---|---|---|---|---|---|'
  ];

  for (const item of results) {
    lines.push([
      item.index,
      item.instance,
      item.scenario,
      item.success ? 'pass' : 'review',
      item.resultStatus || '',
      item.safeToRetry ? 'yes' : 'no',
      item.success ? '' : (item.failureReason || item.error || 'unexpected_result'),
      item.screenshotPath || ''
    ].map(markdownCell).join('|').replace(/^/, '|').replace(/$/, '|'));
  }

  lines.push('', '## Failure Groups', '');
  const failureEntries = Object.entries(summary.byFailureReason || {});
  if (!failureEntries.length) {
    lines.push('No failures.');
  } else {
    for (const [reason, count] of failureEntries) {
      lines.push(`- ${reason}: ${count}`);
    }
  }

  lines.push('', '## Result Categories', '');
  const categoryEntries = Object.entries(summary.byResultCategory || {});
  if (!categoryEntries.length) {
    lines.push('No result categories.');
  } else {
    for (const [category, stats] of categoryEntries) {
      lines.push(`- ${category || 'unknown'}: ${stats.success}/${stats.total} passed, ${stats.failed} review`);
    }
  }

  lines.push('', '## Action Items', '');
  if (!summary.actionItems?.length) {
    lines.push('No action needed.');
  } else {
    for (const item of summary.actionItems) {
      lines.push(`- ${item.reason} (${item.count}): ${item.action}`);
      for (const screenshot of item.screenshots || []) lines.push(`  Screenshot: ${screenshot}`);
    }
  }

  lines.push('', '## Recent Screenshots', '');
  if (!summary.lastScreenshots?.length) {
    lines.push('No screenshots saved.');
  } else {
    for (const screenshot of summary.lastScreenshots) lines.push(`- ${screenshot}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function writeProgress(payload) {
  if (!progressFile) return;
  await mkdir(path.dirname(progressFile), { recursive: true });
  await appendFile(progressFile, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`);
}

function summarize(items, key) {
  return items.reduce((acc, item) => {
    const id = item[key] || 'unknown';
    const current = acc[id] || { total: 0, success: 0, failed: 0 };
    current.total += 1;
    current.success += item.success ? 1 : 0;
    current.failed += item.success ? 0 : 1;
    acc[id] = current;
    return acc;
  }, {});
}

function summarizeFailures(items) {
  return items
    .filter((item) => !item.success)
    .reduce((acc, item) => {
      const reason = item.failureReason || item.error || 'unexpected_result';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});
}

function buildActionItems(items) {
  const grouped = new Map();
  for (const item of items) {
    const reason = item.failureReason || item.error || 'unexpected_result';
    const current = grouped.get(reason) || {
      reason,
      count: 0,
      action: actionForFailureReason(reason),
      screenshots: []
    };
    current.count += 1;
    if (item.screenshotPath && current.screenshots.length < 3) current.screenshots.push(item.screenshotPath);
    grouped.set(reason, current);
  }
  return [...grouped.values()].sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function actionForFailureReason(reason = '') {
  if (reason.includes('ldplayer_process_not_running_after_launch')) return 'LDPlayer nhận lệnh launch nhưng process không giữ trạng thái chạy. Kiểm tra cấu hình instance LD, giảm số LD mở cùng lúc, rồi mở thủ công instance này trước khi test lại.';
  if (reason.includes('ldplayer_running_but_adb_not_attached') || reason.includes('emulator_adb_not_attached_after_manual_launch')) return 'LDPlayer đã chạy nhưng ADB không attach ổn định. Mở LD thủ công đến khi adb devices thấy emulator-* là device, bật ADB Debugging trong LDPlayer nếu cần, rồi chạy lại test.';
  if (reason.startsWith('launcher_watchdog:')) return 'Instagram bị văng/rơi về màn hình launcher trong lúc test. Ưu tiên mở Instagram thủ công trên LD này, chờ Home/Reels render ổn định, rồi chạy lại ảnh đơn; nếu lặp lại thì kiểm tra crash/ANR của Instagram hoặc cấu hình LDPlayer.';
  if (reason.startsWith('adb_watchdog:')) return 'ADB mất kết nối trong lúc test. Đóng bớt LD, restart ADB/LDPlayer, chỉ test từng LD một và chạy lại khi adb devices hiển thị trạng thái device ổn định.';
  if (reason.startsWith('preflight_boot_failed:')) return 'Đây là lỗi preflight LDPlayer/ADB, chưa vào workflow Instagram. Tool đã dừng sớm để tránh treo; mở LD thủ công đến khi adb devices thấy device rồi chạy lại, hoặc kiểm tra ADB Debugging trong LDPlayer.';
  if (reason.startsWith('runtime_error:')) return 'Kiểm tra LDPlayer/ADB, Instagram login state và screenshot lỗi; chạy lại riêng profile này sau khi app ổn định.';
  if (reason === 'screenshot_missing') return 'Kiểm tra quyền screencap/ADB của LDPlayer; không đánh giá composer nếu chưa có screenshot.';
  if (reason === 'screenshot_not_verified') return 'Mở screenshot gần nhất để xem composer có đúng caption/media chưa; cập nhật selector nếu UI Instagram đổi.';
  if (reason === 'unexpected_submit_signal') return 'Dừng mở rộng test; xác minh vì review mode không được có tín hiệu đã gửi bài.';
  if (reason.startsWith('unexpected_submit_reason:')) return 'Đọc submitReason trong JSON và screenshot để xác định state machine dừng ở bước nào.';
  if (reason === 'cleanup_failed') return 'Composer đã mở nhưng cleanup chưa chắc chắn; kiểm tra LD đã đóng/draft đã bị discard trước lượt tiếp theo.';
  if (reason.startsWith('post_type_mismatch:')) return 'Kiểm tra ảnh truyền vào và luồng album Instagram; postType không khớp scenario.';
  return 'Xem JSON report và screenshot gần nhất để phân loại lỗi trước khi chạy lại.';
}

function normalizeReason(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function markdownCell(value = '') {
  return ` ${String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} `;
}

function parseList(value = '') {
  if (Array.isArray(value)) return value.flatMap((item) => parseList(item));
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanOption(value) {
  if (Array.isArray(value)) return parseBooleanOption(value.at(-1));
  if (value === true) return true;
  if (value === false || value === undefined || value === null || value === '') return false;
  return /^(1|true|yes|y|on)$/i.test(String(value).trim());
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=');
    const nextValue = args[index + 1];
    const hasSeparateValue = inlineValue === undefined && nextValue !== undefined && !nextValue.startsWith('--');
    const value = inlineValue ?? (hasSeparateValue ? nextValue : true);
    if (parsed[key] === undefined) parsed[key] = value;
    else parsed[key] = Array.isArray(parsed[key]) ? [...parsed[key], value] : [parsed[key], value];
    if (hasSeparateValue) index += 1;
  }
  return parsed;
}

function imageMimeTypeFromPath(value) {
  const extension = path.extname(String(value)).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  }[extension] || 'image/jpeg';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
