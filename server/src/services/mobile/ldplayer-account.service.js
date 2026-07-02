export const activeLdPlayerSlots = [1, 2, 3];

export function getLdPlayerSlot(account) {
  const deviceMatch = String(account?.deviceId || '').match(/^emulator-(\d+)$/);
  if (deviceMatch) {
    const port = Number(deviceMatch[1]);
    if (Number.isInteger(port) && port >= 5554) return ((port - 5554) / 2) + 1;
  }

  const instanceName = String(account?.instanceName || '');
  if (instanceName === 'LDPlayer') return 1;

  const instanceMatch = instanceName.match(/-(\d+)$/);
  if (instanceMatch) return Number(instanceMatch[1]) + 1;

  return Number.MAX_SAFE_INTEGER;
}

export function isActiveLdPlayerAccount(account) {
  if (!['facebook', 'instagram'].includes(account?.platform)) return true;
  return activeLdPlayerSlots.includes(getLdPlayerSlot(account));
}
