import { platformDraftStoragePrefix } from '../config/mobile-lab';

export function getPlatformDraftStorageKey(platformId = 'facebook') {
  return `${platformDraftStoragePrefix}${platformId}`;
}

export function getDraftContentType(draft = {}) {
  if (draft.facebookPostType === 'video') return 'video';
  return Array.isArray(draft.media) && draft.media.some((item) => item?.type === 'video')
    ? 'video'
    : 'imageText';
}

export function getDraftMediaSummary(draft = {}) {
  const media = Array.isArray(draft.media) ? draft.media : [];
  const videoCount = media.filter((item) => item?.type === 'video').length;
  const photoCount = media.filter((item) => item?.type !== 'video').length;
  if (videoCount) return `${videoCount} video`;
  if (photoCount) return `${photoCount} ảnh`;
  return 'Chỉ nội dung';
}

export function defaultScheduleDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
  return toDateTimeLocal(date);
}

export function toDateTimeLocal(date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function parseHashtags(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const normalized = raw
    .split(/[\s,;]+/)
    .map((tag) => tag.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  return Array.from(new Map(normalized.map((tag) => [tag.toLocaleLowerCase(), tag])).values());
}

export function buildDraftFingerprint(draft = {}) {
  const media = (Array.isArray(draft.media) ? draft.media : [])
    .map((item) => `${item.type || 'photo'}:${item.uploadedUrl || item.url || ''}`)
    .filter((item) => !item.endsWith(':'))
    .sort();
  return JSON.stringify({
    platform: draft.platform || 'facebook',
    facebookPostType: draft.facebookPostType || 'imageText',
    text: normalizeTextFormatArtifacts(draft.text || '').trim(),
    media
  });
}

export function normalizeTextFormatArtifacts(value = '') {
  return (value == null ? '' : String(value))
    .replace(/\u0332{2,}/g, '\u0332')
    .replace(/([^\s])\u0332(?=\u0332)/g, '$1\u0332');
}

export function hashSnapshotText(value = '') {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
