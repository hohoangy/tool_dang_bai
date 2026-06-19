import { MobileAccountLog } from '../../models/mobile-account-log.model.js';

export function writeMobileLog(userId, accountId, level, action, message, metadata = {}) {
  return MobileAccountLog.create({ userId, accountId, level, action, message, metadata });
}
