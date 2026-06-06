import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../../utils/api-error.js';
import { MobileAccount } from '../../models/mobile-account.model.js';
import { MobileAccountLog } from '../../models/mobile-account-log.model.js';
import {
  cancelMobileLoginJob,
  captureScreenshot,
  createMobileLoginJob,
  encryptSecret,
  getMobileLoginJob,
  openAccountApp,
  openLdPlayer,
  publishFacebookPostViaMobile,
  probeDevice,
  remoteKey,
  remoteSwipe,
  remoteTap,
  remoteText,
  runMobileLogin,
  sanitizeAccount
} from '../../services/mobile/automation.service.js';

export const mobileRoutes = Router();

const accountSchema = z.object({
  platform: z.enum(['facebook', 'x', 'youtube', 'tiktok', 'other']).default('other'),
  displayName: z.string().min(2),
  accountHandle: z.string().optional().or(z.literal('')),
  instanceName: z.string().min(1),
  adbHost: z.string().optional().or(z.literal('')),
  deviceId: z.string().optional().or(z.literal('')),
  status: z.enum(['ready', 'login_required', 'logging_in', 'connected', 'checkpoint', 'error', 'paused']).default('ready'),
  notes: z.string().optional().or(z.literal('')),
  metadata: z.object({
    appPackage: z.string().optional().or(z.literal('')),
    username: z.string().optional().or(z.literal('')),
    password: z.string().optional().or(z.literal('')),
    loginSteps: z.object({
      usernameTap: z.object({ x: z.number(), y: z.number() }).optional(),
      passwordTap: z.object({ x: z.number(), y: z.number() }).optional(),
      submitTap: z.object({ x: z.number(), y: z.number() }).optional()
    }).optional()
  }).optional()
});

const runSchema = z.object({
  accountIds: z.array(z.string()).min(1).max(20).optional(),
  appPackage: z.string().optional().or(z.literal('')),
  username: z.string().optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
  loginSteps: z.object({
    usernameTap: z.object({ x: z.number(), y: z.number() }).optional(),
    passwordTap: z.object({ x: z.number(), y: z.number() }).optional(),
    submitTap: z.object({ x: z.number(), y: z.number() }).optional()
  }).optional()
});

const batchRunSchema = runSchema.extend({
  accountIds: z.array(z.string()).min(1).max(20),
  retries: z.number().int().min(0).max(3).default(1)
});

const tapSchema = z.object({ x: z.number(), y: z.number() });
const swipeSchema = z.object({
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number(),
  toY: z.number(),
  duration: z.number().int().min(50).max(3000).default(350)
});
const textSchema = z.object({ text: z.string().min(1).max(500) });
const keySchema = z.object({ key: z.enum(['back', 'home', 'enter', 'recent', 'power']) });
const openAppSchema = z.object({ appPackage: z.string().optional().or(z.literal('')) });
const facebookPostSchema = z.object({
  text: z.string().min(1).max(5000),
  appPackage: z.string().optional().or(z.literal('')),
  autoSubmit: z.boolean().default(false),
  images: z.array(z.object({
    url: z.string().url(),
    name: z.string().optional(),
    mimeType: z.string().startsWith('image/').optional(),
    size: z.number().int().positive().max(5 * 1024 * 1024).optional()
  })).max(4).default([]),
  composerTap: z.object({ x: z.number(), y: z.number() }).optional(),
  submitTap: z.object({ x: z.number(), y: z.number() }).optional()
});

mobileRoutes.get('/accounts', requireAuth, asyncHandler(async (req, res) => {
  const accounts = await MobileAccount.find({ userId: req.user._id }).sort({ updatedAt: -1 });
  const logs = await MobileAccountLog.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(80);
  res.json({ accounts: accounts.map(sanitizeAccount), logs });
}));

mobileRoutes.post('/accounts', requireAuth, asyncHandler(async (req, res) => {
  const input = accountSchema.parse(req.body);
  const metadata = normalizeMetadata(input.metadata);
  const account = await MobileAccount.create({
    ...input,
    metadata,
    userId: req.user._id,
    accountHandle: input.accountHandle?.trim() || null,
    adbHost: input.adbHost?.trim() || null,
    deviceId: input.deviceId?.trim() || null,
    notes: input.notes?.trim() || null
  });
  await writeLog(req.user._id, account._id, 'info', 'create_account', `Đã thêm nick ${account.displayName}.`, {
    platform: account.platform,
    instanceName: account.instanceName
  });
  res.status(201).json({ account: sanitizeAccount(account) });
}));

mobileRoutes.patch('/accounts/:id', requireAuth, asyncHandler(async (req, res) => {
  const input = accountSchema.partial().parse(req.body);
  const account = await findAccount(req.params.id, req.user._id);
  const nextMetadata = input.metadata ? { ...(account.metadata || {}), ...normalizeMetadata(input.metadata) } : account.metadata;
  Object.assign(account, {
    ...input,
    metadata: nextMetadata,
    accountHandle: input.accountHandle === '' ? null : input.accountHandle ?? account.accountHandle,
    adbHost: input.adbHost === '' ? null : input.adbHost ?? account.adbHost,
    deviceId: input.deviceId === '' ? null : input.deviceId ?? account.deviceId,
    notes: input.notes === '' ? null : input.notes ?? account.notes
  });
  await account.save();
  await writeLog(req.user._id, account._id, 'info', 'update_account', `Đã cập nhật nick ${account.displayName}.`);
  res.json({ account: sanitizeAccount(account) });
}));

mobileRoutes.delete('/accounts/:id', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  await writeLog(req.user._id, account._id, 'warn', 'delete_account', `Đã xóa nick ${account.displayName}.`);
  await account.deleteOne();
  res.status(204).send();
}));

mobileRoutes.post('/accounts/:id/probe', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const result = await probeDevice(account, req.user._id);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.post('/accounts/:id/remote/launch', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const result = await openLdPlayer(account, req.user._id);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.post('/accounts/:id/remote/open-app', requireAuth, asyncHandler(async (req, res) => {
  const input = openAppSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await openAccountApp(account, req.user._id, input.appPackage);
  res.json({ account: sanitizeAccount(account), result });
}));

mobileRoutes.get('/accounts/:id/remote/screenshot', requireAuth, asyncHandler(async (req, res) => {
  const account = await findAccount(req.params.id, req.user._id);
  const screenshot = await captureScreenshot(account, req.user._id, 'remote_view');
  res.json({ screenshot });
}));

mobileRoutes.post('/accounts/:id/remote/tap', requireAuth, asyncHandler(async (req, res) => {
  const input = tapSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteTap(account, req.user._id, input.x, input.y);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/remote/swipe', requireAuth, asyncHandler(async (req, res) => {
  const input = swipeSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteSwipe(account, req.user._id, input.fromX, input.fromY, input.toX, input.toY, input.duration);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/remote/text', requireAuth, asyncHandler(async (req, res) => {
  const input = textSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteText(account, req.user._id, input.text);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/remote/key', requireAuth, asyncHandler(async (req, res) => {
  const input = keySchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  const result = await remoteKey(account, req.user._id, input.key);
  res.json({ result });
}));

mobileRoutes.post('/accounts/:id/facebook/post', requireAuth, asyncHandler(async (req, res) => {
  const input = facebookPostSchema.parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  try {
    const result = await publishFacebookPostViaMobile(account, req.user._id, input);
    res.json({ result });
  } catch (error) {
    throw new ApiError(400, error.message);
  }
}));

mobileRoutes.post('/accounts/:id/run-login', requireAuth, asyncHandler(async (req, res) => {
  const input = runSchema.omit({ accountIds: true }).parse(req.body || {});
  const account = await findAccount(req.params.id, req.user._id);
  try {
    const result = await runMobileLogin(account, req.user._id, normalizeMetadata(input));
    res.json({ account: sanitizeAccount(result.account), steps: result.steps });
  } catch (error) {
    account.status = 'error';
    await account.save();
    await writeLog(req.user._id, account._id, 'error', 'login_failed', error.message);
    throw new ApiError(400, error.message);
  }
}));

mobileRoutes.post('/batch/run-login', requireAuth, asyncHandler(async (req, res) => {
  const input = batchRunSchema.parse(req.body || {});
  const job = createMobileLoginJob({
    userId: req.user._id,
    accountIds: input.accountIds,
    override: normalizeMetadata(input),
    retries: input.retries
  });
  res.status(202).json({ job });
}));

mobileRoutes.get('/jobs/:id', requireAuth, asyncHandler(async (req, res) => {
  const job = getMobileLoginJob(req.params.id, req.user._id);
  if (!job) throw new ApiError(404, 'Job not found.');
  res.json({ job });
}));

mobileRoutes.post('/jobs/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const job = cancelMobileLoginJob(req.params.id, req.user._id);
  if (!job) throw new ApiError(404, 'Job not found.');
  res.json({ job });
}));

async function findAccount(id, userId) {
  const account = await MobileAccount.findOne({ _id: id, userId });
  if (!account) throw new ApiError(404, 'Mobile account not found.');
  return account;
}

function normalizeMetadata(metadata = {}) {
  const output = {};
  if (metadata.appPackage) output.appPackage = metadata.appPackage.trim();
  if (metadata.username) output.username = metadata.username.trim();
  if (metadata.password) output.password = encryptSecret(metadata.password);
  if (metadata.loginSteps) output.loginSteps = metadata.loginSteps;
  return output;
}

function writeLog(userId, accountId, level, action, message, metadata = {}) {
  return MobileAccountLog.create({ userId, accountId, level, action, message, metadata });
}
