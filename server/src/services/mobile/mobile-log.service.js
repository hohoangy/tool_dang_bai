import { MobileAccountLog } from '../../models/mobile-account-log.model.js';
import { env } from '../../config/env.js';

export function writeMobileLog(userId, accountId, level, action, message, metadata = {}) {
  if (process.env.MOBILE_LOG_STDOUT === 'true') {
    console.error(JSON.stringify({ level, action, message, metadata }));
  }

  if (env.noDb) {
    return Promise.resolve({
      _id: `no-db-${Date.now()}`,
      userId,
      accountId,
      level,
      action,
      message,
      metadata,
      createdAt: new Date()
    });
  }

  return MobileAccountLog.create({ userId, accountId, level, action, message, metadata });
}
