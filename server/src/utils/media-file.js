import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { ApiError } from './api-error.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const uploadsDir = path.join(serverRoot, 'uploads');

export async function loadImage(media) {
  const url = media?.url || media?.imageUrl;
  if (!url) throw new ApiError(400, 'Image URL is missing.');

  const localPath = getLocalUploadPath(url);
  if (localPath) {
    const buffer = await fs.readFile(localPath);
    return { buffer, mimeType: media.mimeType || mimeTypeFromPath(localPath) };
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20_000,
      maxContentLength: 5 * 1024 * 1024,
      maxBodyLength: 5 * 1024 * 1024
    });
    const buffer = Buffer.from(response.data);
    if (buffer.length > 5 * 1024 * 1024) throw new ApiError(400, 'X images must be 5 MB or smaller.');
    return {
      buffer,
      mimeType: normalizeMimeType(response.headers['content-type']) || media.mimeType || mimeTypeFromPath(url)
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Could not load the selected image.', error.message);
  }
}

export function getLocalUploadPath(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  if (!pathname.startsWith('/uploads/')) return null;
  const filename = path.basename(decodeURIComponent(pathname));
  const resolved = path.resolve(uploadsDir, filename);
  if (!resolved.startsWith(`${path.resolve(uploadsDir)}${path.sep}`)) {
    throw new ApiError(400, 'Invalid upload path.');
  }
  return resolved;
}

function normalizeMimeType(value = '') {
  return String(value).split(';')[0].trim().toLowerCase();
}

function mimeTypeFromPath(value = '') {
  const extension = path.extname(String(value)).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff'
  };
  return types[extension] || '';
}
