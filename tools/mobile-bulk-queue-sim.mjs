const options = parseArgs(process.argv.slice(2));
const stressIterations = Math.max(0, Number(options.iterations || 0));

const scenarios = [
  {
    name: 'all_success_keeps_selected_order',
    accounts: ['LD1', 'LD2', 'LD3'],
    plan: {
      LD1: [{ type: 'success' }],
      LD2: [{ type: 'success' }],
      LD3: [{ type: 'success' }]
    },
    expect: {
      statuses: { LD1: 'done', LD2: 'done', LD3: 'done' },
      attempts: { LD1: 1, LD2: 1, LD3: 1 },
      order: ['LD1', 'LD2', 'LD3'],
      closes: 3
    }
  },
  {
    name: 'transient_error_retries_clean_then_success',
    accounts: ['LD1', 'LD2'],
    plan: {
      LD1: [
        { type: 'error', message: 'ADB offline', retryable: true },
        { type: 'success' }
      ],
      LD2: [{ type: 'success' }]
    },
    expect: {
      statuses: { LD1: 'done', LD2: 'done' },
      attempts: { LD1: 2, LD2: 1 },
      retryCleanups: 1,
      closes: 3
    }
  },
  {
    name: 'review_does_not_stop_following_profiles',
    accounts: ['LD1', 'LD2', 'LD3'],
    plan: {
      LD1: [{ type: 'review', composerPending: true }],
      LD2: [{ type: 'success' }],
      LD3: [{ type: 'success' }]
    },
    expect: {
      statuses: { LD1: 'review', LD2: 'done', LD3: 'done' },
      attempts: { LD1: 1, LD2: 1, LD3: 1 },
      closes: 3
    }
  },
  {
    name: 'bulk_review_all_accounts_close_and_keep_screenshots',
    accounts: ['LD1', 'LD2', 'LD3'],
    plan: {
      LD1: [{ type: 'review', composerPending: false, screenshot: true }],
      LD2: [{ type: 'review', composerPending: false, screenshot: true }],
      LD3: [{ type: 'review', composerPending: false, screenshot: true }]
    },
    expect: {
      statuses: { LD1: 'review', LD2: 'review', LD3: 'review' },
      attempts: { LD1: 1, LD2: 1, LD3: 1 },
      screenshots: 3,
      closes: 3
    }
  },
  {
    name: 'permanent_error_continues_next_profile',
    accounts: ['LD1', 'LD2'],
    plan: {
      LD1: [{ type: 'error', message: 'Facebook checkpoint', retryable: false }],
      LD2: [{ type: 'success' }]
    },
    expect: {
      statuses: { LD1: 'failed', LD2: 'done' },
      attempts: { LD1: 1, LD2: 1 },
      closes: 2
    }
  },
  {
    name: 'retry_limit_exhausted_marks_failed_and_continues',
    accounts: ['LD1', 'LD2'],
    plan: {
      LD1: [
        { type: 'error', message: 'System UI is not responding', retryable: true },
        { type: 'error', message: 'System UI is not responding', retryable: true }
      ],
      LD2: [{ type: 'success' }]
    },
    expect: {
      statuses: { LD1: 'failed', LD2: 'done' },
      attempts: { LD1: 2, LD2: 1 },
      retryCleanups: 1,
      closes: 3
    }
  },
  {
    name: 'inter_account_delay_marks_next_waiting',
    accounts: ['LD1', 'LD2'],
    delaySeconds: 5,
    plan: {
      LD1: [{ type: 'success' }],
      LD2: [{ type: 'success' }]
    },
    expect: {
      statuses: { LD1: 'done', LD2: 'done' },
      waitingEvents: 1,
      closes: 2
    }
  },
  {
    name: 'prepare_failure_marks_pending_failed',
    accounts: ['LD1', 'LD2'],
    prepareError: 'Chưa tắt hoàn toàn LDPlayer cũ',
    plan: {
      LD1: [{ type: 'success' }],
      LD2: [{ type: 'success' }]
    },
    expect: {
      statuses: { LD1: 'failed', LD2: 'failed' },
      preparesFailed: 1,
      closes: 0
    }
  }
];

const results = scenarios.map(runScenario);
if (stressIterations > 0) {
  results.push(runStress(stressIterations, Number(options.seed || 20260720)));
}
const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
  if (!result.ok) console.log(JSON.stringify(result, null, 2));
}

const summary = {
  total: results.length,
  pass: results.length - failed.length,
  fail: failed.length
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;

function runScenario(scenario) {
  const state = runQueueSimulation(scenario);
  const errors = [];
  for (const [id, status] of Object.entries(scenario.expect.statuses || {})) {
    if (state.items[id]?.status !== status) {
      errors.push(`status:${id}:expected=${status}:actual=${state.items[id]?.status}`);
    }
  }
  for (const [id, attempts] of Object.entries(scenario.expect.attempts || {})) {
    if (state.attempts[id] !== attempts) {
      errors.push(`attempts:${id}:expected=${attempts}:actual=${state.attempts[id] || 0}`);
    }
  }
  if (scenario.expect.order && scenario.expect.order.join('|') !== state.order.join('|')) {
    errors.push(`order:expected=${scenario.expect.order.join(',')}:actual=${state.order.join(',')}`);
  }
  assertCount(errors, 'closes', state.events, scenario.expect.closes);
  assertCount(errors, 'retry_cleanup', state.events, scenario.expect.retryCleanups);
  assertCount(errors, 'waiting', state.events, scenario.expect.waitingEvents);
  assertCount(errors, 'prepare_failed', state.events, scenario.expect.preparesFailed);
  if (scenario.expect.screenshots !== undefined) {
    const actual = Object.values(state.items).filter((item) => item.result?.screenshot).length;
    if (actual !== scenario.expect.screenshots) errors.push(`screenshots:expected=${scenario.expect.screenshots}:actual=${actual}`);
  }
  return {
    name: scenario.name,
    ok: errors.length === 0,
    errors,
    state
  };
}

function runStress(iterations, seed) {
  let random = createRandom(seed);
  const errors = [];
  const counters = {
    done: 0,
    review: 0,
    failed: 0,
    retryCleanup: 0,
    prepareFailed: 0,
    close: 0
  };

  for (let index = 0; index < iterations; index += 1) {
    const scenario = randomScenario(index, random);
    const state = runQueueSimulation(scenario);
    const finalStatuses = Object.values(state.items).map((item) => item.status);
    if (!finalStatuses.every((status) => ['done', 'review', 'failed'].includes(status))) {
      errors.push(`iteration:${index}:non_terminal_status:${finalStatuses.join(',')}`);
    }
    if (!scenario.prepareError && state.order.join('|') !== scenario.accounts.join('|')) {
      errors.push(`iteration:${index}:order:${state.order.join(',')}`);
    }
    for (const [id, attempts] of Object.entries(state.attempts)) {
      if (attempts < 1 || attempts > 2) errors.push(`iteration:${index}:attempts:${id}:${attempts}`);
    }
    counters.done += finalStatuses.filter((status) => status === 'done').length;
    counters.review += finalStatuses.filter((status) => status === 'review').length;
    counters.failed += finalStatuses.filter((status) => status === 'failed').length;
    counters.retryCleanup += state.events.filter((event) => event.type === 'retry_cleanup').length;
    counters.prepareFailed += state.events.filter((event) => event.type === 'prepare_failed').length;
    counters.close += state.events.filter((event) => event.type === 'closes').length;
    if (errors.length >= 20) break;
    random = state.nextRandom || random;
  }

  return {
    name: `stress_${iterations}_iterations`,
    ok: errors.length === 0,
    errors,
    state: {
      iterations,
      seed,
      counters
    }
  };
}

function randomScenario(index, random) {
  const accountCount = 1 + Math.floor(random() * 6);
  const accounts = Array.from({ length: accountCount }, (_, accountIndex) => `LD${accountIndex + 1}`);
  const plan = {};
  for (const account of accounts) {
    const roll = random();
    if (roll < 0.46) {
      plan[account] = [{ type: 'success' }];
    } else if (roll < 0.62) {
      plan[account] = [{ type: 'review', composerPending: random() < 0.5 }];
    } else if (roll < 0.78) {
      plan[account] = [{ type: 'error', message: 'Facebook checkpoint', retryable: false }];
    } else if (roll < 0.91) {
      plan[account] = [
        { type: 'error', message: 'ADB offline', retryable: true },
        { type: 'success' }
      ];
    } else {
      plan[account] = [
        { type: 'error', message: 'System UI is not responding', retryable: true },
        { type: 'error', message: 'System UI is not responding', retryable: true }
      ];
    }
  }
  return {
    name: `random_${index}`,
    accounts,
    delaySeconds: random() < 0.25 ? Math.floor(random() * 10) + 1 : 0,
    prepareError: random() < 0.03 ? 'Chưa tắt hoàn toàn LDPlayer cũ' : '',
    plan
  };
}

function assertCount(errors, event, events, expected) {
  if (expected === undefined) return;
  const actual = events.filter((item) => item.type === event).length;
  if (actual !== expected) errors.push(`${event}:expected=${expected}:actual=${actual}`);
}

function runQueueSimulation(scenario) {
  const state = {
    items: Object.fromEntries(scenario.accounts.map((id) => [id, {
      status: 'pending',
      message: 'Đang chuẩn bị'
    }])),
    attempts: {},
    order: [],
    events: []
  };
  const retryLimit = Number.isInteger(scenario.retryLimit) ? scenario.retryLimit : 1;

  try {
    prepareQueueEnvironmentSimulation(scenario, state);
    for (let index = 0; index < scenario.accounts.length; index += 1) {
      const id = scenario.accounts[index];
      state.order.push(id);
      for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
        state.attempts[id] = attempt + 1;
        const action = (scenario.plan[id] || [])[attempt] || { type: 'success' };
        if (action.type === 'success') {
          state.items[id] = { status: 'done', message: 'Đã đăng và xác minh' };
          closeAccountSimulation(state, id, 'success');
          break;
        }
        if (action.type === 'review') {
          state.items[id] = {
            status: 'review',
            message: action.screenshot
              ? 'Đã chụp composer kiểm tra và đóng LDPlayer'
              : action.composerPending
                ? 'Chưa hoàn tất, đã lưu screenshot và đóng LDPlayer'
                : 'Chưa xác minh, đã lưu screenshot và đóng LDPlayer',
            result: action.screenshot ? {
              screenshot: { imageBase64: 'mock' },
              screenshotVerified: true
            } : null
          };
          closeAccountSimulation(state, id, 'review');
          break;
        }

        const retryable = action.retryable && attempt < retryLimit;
        state.items[id] = {
          status: retryable ? 'waiting' : 'failed',
          message: retryable
            ? `Lỗi tạm thời: ${action.message} · đang dọn LDPlayer để thử lại`
            : action.message
        };
        closeAccountSimulation(state, id, retryable ? 'retry' : 'failed');
        if (!retryable) break;
        state.events.push({ type: 'retry_cleanup', account: id, attempt: attempt + 1 });
      }

      if (index < scenario.accounts.length - 1 && Number(scenario.delaySeconds || 0) > 0) {
        state.items[scenario.accounts[index + 1]] = {
          ...state.items[scenario.accounts[index + 1]],
          status: 'waiting',
          message: `Nghỉ ${scenario.delaySeconds} giây trước lượt tiếp theo`
        };
        state.events.push({ type: 'waiting', account: scenario.accounts[index + 1] });
      }
    }
  } catch (error) {
    state.events.push({ type: 'prepare_failed', message: error.message });
    for (const id of scenario.accounts) {
      if (!['done', 'review', 'failed'].includes(state.items[id].status)) {
        state.items[id] = {
          status: 'failed',
          message: `Dừng hàng loạt: ${error.message}`
        };
      }
    }
  }
  return state;
}

function prepareQueueEnvironmentSimulation(scenario) {
  if (scenario.prepareError) throw new Error(scenario.prepareError);
}

function closeAccountSimulation(state, account, reason) {
  state.events.push({ type: 'closes', account, reason });
}

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
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
