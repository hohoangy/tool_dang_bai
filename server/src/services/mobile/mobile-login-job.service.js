import { randomUUID } from 'crypto';
import { MobileAccount } from '../../models/mobile-account.model.js';
import { captureScreenshot } from './device-automation.service.js';
import { runMobileLogin } from './automation-engine.service.js';
import { sanitizeAccount } from './mobile-account.service.js';
import { writeMobileLog } from './mobile-log.service.js';

const jobs = new Map();

export function createMobileLoginJob({ userId, accountIds, override = {}, retries = 1 }) {
  const id = randomUUID();
  const job = {
    id,
    userId,
    accountIds,
    override,
    retries,
    status: 'queued',
    currentAccountId: null,
    total: accountIds.length,
    completed: 0,
    failed: 0,
    results: [],
    cancelRequested: false,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(id, job);
  void runJob(job);
  return serializeJob(job);
}

export function getMobileLoginJob(id, userId) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  return serializeJob(job);
}

export function cancelMobileLoginJob(id, userId) {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  if (['queued', 'running'].includes(job.status)) {
    job.cancelRequested = true;
    job.status = 'canceling';
    touchJob(job);
  }
  return serializeJob(job);
}

async function runJob(job) {
  job.status = 'running';
  touchJob(job);

  for (const accountId of job.accountIds) {
    if (job.cancelRequested) {
      job.status = 'canceled';
      touchJob(job);
      return;
    }

    job.currentAccountId = accountId;
    touchJob(job);
    const account = await MobileAccount.findOne({ _id: accountId, userId: job.userId });
    if (!account) {
      job.failed += 1;
      job.results.push({ accountId, ok: false, error: 'Account not found.' });
      touchJob(job);
      continue;
    }

    let lastError = null;
    for (let attempt = 1; attempt <= job.retries + 1; attempt += 1) {
      if (job.cancelRequested) break;
      try {
        await writeMobileLog(job.userId, account._id, 'info', 'job_attempt', `Chạy đăng nhập lần ${attempt}.`, {
          jobId: job.id,
          attempt
        });
        const result = await runMobileLogin(account, job.userId, job.override);
        job.completed += 1;
        job.results.push({ accountId, ok: true, attempt, account: sanitizeAccount(result.account) });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await captureScreenshot(account, job.userId, `failed_attempt_${attempt}`);
        await writeMobileLog(job.userId, account._id, 'error', 'job_attempt_failed', error.message, {
          jobId: job.id,
          attempt
        });
        if (attempt <= job.retries) await delay(1500);
      }
    }

    if (lastError) {
      account.status = 'error';
      await account.save();
      job.failed += 1;
      job.results.push({ accountId, ok: false, error: lastError.message });
    }
    touchJob(job);
  }

  job.currentAccountId = null;
  job.status = job.failed > 0 ? 'completed_with_errors' : 'completed';
  touchJob(job);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function touchJob(job) {
  job.updatedAt = new Date().toISOString();
}

function serializeJob(job) {
  return {
    id: job.id,
    status: job.status,
    currentAccountId: job.currentAccountId,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    results: job.results,
    cancelRequested: job.cancelRequested,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}
