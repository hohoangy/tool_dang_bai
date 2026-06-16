import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import express, { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../../utils/api-error.js';
import { uploadsDir } from '../../utils/media-file.js';

const allowedImageTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/bmp', '.bmp'],
  ['image/tiff', '.tiff']
]);
const allowedVideoTypes = new Map([
  ['video/mp4', '.mp4'],
  ['video/quicktime', '.mov'],
  ['video/webm', '.webm'],
  ['video/3gpp', '.3gp']
]);

export const mediaRoutes = Router();

mediaRoutes.post(
  '/media/images',
  requireAuth,
  express.raw({ type: 'image/*', limit: '5mb' }),
  asyncHandler(async (req, res) => {
    const mimeType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const extension = allowedImageTypes.get(mimeType);
    if (!extension) throw new ApiError(400, 'Only JPG, PNG, WebP, BMP, and TIFF images are supported.');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ApiError(400, 'Image file is empty.');

    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${crypto.randomUUID()}${extension}`;
    await fs.writeFile(path.join(uploadsDir, filename), req.body);

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol;
    const url = `${protocol}://${req.get('host')}/uploads/${filename}`;

    res.status(201).json({
      image: {
        url,
        mimeType,
        name: sanitizeFilename(req.headers['x-file-name']) || filename,
        size: req.body.length
      }
    });
  })
);

mediaRoutes.post(
  '/media/videos',
  requireAuth,
  express.raw({ type: 'video/*', limit: '100mb' }),
  asyncHandler(async (req, res) => {
    const mimeType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const extension = allowedVideoTypes.get(mimeType);
    if (!extension) throw new ApiError(400, 'Only MP4, MOV, WebM, and 3GP videos are supported.');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ApiError(400, 'Video file is empty.');

    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${crypto.randomUUID()}${extension}`;
    await fs.writeFile(path.join(uploadsDir, filename), req.body);

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol;
    const url = `${protocol}://${req.get('host')}/uploads/${filename}`;

    res.status(201).json({
      video: {
        url,
        mimeType,
        name: sanitizeFilename(req.headers['x-file-name']) || filename,
        size: req.body.length
      }
    });
  })
);

function sanitizeFilename(value = '') {
  return path.basename(decodeURIComponent(String(value))).replace(/[^\w.\- ()]/g, '').slice(0, 180);
}
