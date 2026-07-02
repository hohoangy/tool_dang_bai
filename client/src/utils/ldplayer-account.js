export const activeLdPlayerSlots = [1, 2, 3];

export function getLdPlayerSlot(account) {
  const deviceMatch = String(account?.deviceId || '').match(/^emulator-(\d+)$/);
  if (deviceMatch) {
    const port = Number(deviceMatch[1]);
    if (Number.isInteger(port) && port >= 5554) return ((port - 5554) / 2) + 1;
  }

  if (account?.instanceName === 'LDPlayer') return 1;

  const instanceNumber = Number(account?.instanceName?.match(/-(\d+)$/)?.[1]);
  return Number.isInteger(instanceNumber) ? instanceNumber + 1 : Number.MAX_SAFE_INTEGER;
}

export function isActiveLdPlayerAccount(account) {
  if (!['facebook', 'instagram'].includes(account?.platform)) return true;
  return activeLdPlayerSlots.includes(getLdPlayerSlot(account));
}

export function getLdPlayerAccountKey(account) {
  if (!['facebook', 'instagram'].includes(account?.platform)) return account?._id || account?.id || '';
  return `${account.platform}:${getLdPlayerSlot(account)}`;
}

export function uniqueActiveLdPlayerAccounts(accounts = []) {
  const output = [];
  const seen = new Set();

  for (const account of accounts) {
    if (!isActiveLdPlayerAccount(account)) continue;
    const key = getLdPlayerAccountKey(account);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(account);
  }

  return output;
}
