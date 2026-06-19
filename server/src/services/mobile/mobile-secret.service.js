import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../../config/env.js';

export function encryptSecret(value = '') {
  if (!value) return '';
  if (String(value).startsWith('enc:v1:')) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

export function decryptSecret(value = '') {
  if (!value) return '';
  if (!String(value).startsWith('enc:v1:')) return value;
  const payload = Buffer.from(String(value).slice('enc:v1:'.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function getSecretKey() {
  return createHash('sha256').update(env.mobileAutomation.secret).digest();
}
