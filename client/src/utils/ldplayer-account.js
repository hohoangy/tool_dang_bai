export const activeLdPlayerSlots = [1, 2, 3];

export const defaultLoginSteps = {
  usernameTap: { x: 540, y: 760 },
  passwordTap: { x: 540, y: 900 },
  submitTap: { x: 540, y: 1060 }
};

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

export function createDefaultMobileAccount(platform, index = 1) {
  const platformLabel = platform === 'instagram' ? 'Instagram' : 'Facebook';
  const appPackage = platform === 'instagram' ? 'com.instagram.android' : 'com.facebook.katana';
  const instanceName = index === 1 ? 'LDPlayer' : `LDPlayer-${index - 1}`;
  return {
    platform,
    displayName: `${platformLabel} Account ${String(index).padStart(2, '0')}`,
    accountHandle: '',
    instanceName,
    adbHost: '',
    deviceId: `emulator-${5554 + ((index - 1) * 2)}`,
    status: 'ready',
    notes: `Default LDPlayer profile ${index} for direct ${platformLabel} posting tests.`,
    metadata: {
      appPackage,
      username: '',
      password: '',
      loginSteps: defaultLoginSteps
    }
  };
}

export function createDefaultMobileAccounts() {
  return {
    facebook: activeLdPlayerSlots.map((index) => createDefaultMobileAccount('facebook', index)),
    instagram: activeLdPlayerSlots.map((index) => createDefaultMobileAccount('instagram', index))
  };
}

export function formatInstanceLabel(account) {
  const target = account?.deviceId || '';
  const emulatorIndex = Number(target.match(/^emulator-(\d+)$/)?.[1]);
  if (Number.isInteger(emulatorIndex) && emulatorIndex >= 5554) {
    return `LDPlayer ${String(((emulatorIndex - 5554) / 2) + 1).padStart(2, '0')}`;
  }
  const instanceNumber = Number(account?.instanceName?.match(/-(\d+)$/)?.[1]);
  if (Number.isInteger(instanceNumber)) return `LDPlayer ${String(instanceNumber + 1).padStart(2, '0')}`;
  return account?.instanceName === 'LDPlayer' ? 'LDPlayer 01' : (account?.instanceName || 'LDPlayer');
}

export function getAccountOrder(account) {
  return getLdPlayerSlot(account);
}

export function formatAccountDisplayName(account) {
  const displayName = String(account?.displayName || '').trim();
  if (account?.platform === 'instagram') {
    return displayName || `Instagram Account ${String(getAccountOrder(account)).padStart(2, '0')}`;
  }
  if (account?.platform !== 'facebook') return displayName || 'Profile chưa đặt tên';

  const accountNumber = displayName.match(/facebook\s*(?:account)?\s*0*(\d+)/i)?.[1]
    || String(getAccountOrder(account));
  if (/^facebook\s*(?:account)?\s*0*\d+$/i.test(displayName) && /^\d+$/.test(accountNumber)) {
    return `Facebook Account ${String(Number(accountNumber)).padStart(2, '0')}`;
  }
  return displayName || `Facebook Account ${String(getAccountOrder(account)).padStart(2, '0')}`;
}

export function formatAccountLabel(account) {
  return `${formatAccountDisplayName(account)} · ${formatInstanceLabel(account)}`;
}
