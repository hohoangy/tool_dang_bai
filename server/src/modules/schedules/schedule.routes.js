import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/api-error.js';
import { Post } from '../../models/post.model.js';
import { Schedule } from '../../models/schedule.model.js';
import { env } from '../../config/env.js';

export const scheduleRoutes = Router();

const scheduleSchema = z.object({
  title: z.string().min(2),
  topic: z.string().min(2),
  tone: z.string(),
  platform: z.enum(['facebook', 'x', 'youtube', 'tiktok']),
  scheduledAt: z.string().datetime(),
  content: z.object({
    hook: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
    cta: z.string(),
    outline: z.array(z.string()).default([])
  }),
  media: z.object({
    imageUrl: z.string().url().optional().or(z.literal('')),
    altText: z.string().optional()
  }).optional()
});

scheduleRoutes.post('/schedule-post', requireAuth, asyncHandler(async (req, res) => {
  const input = scheduleSchema.parse(req.body);
  if (env.noDb) {
    const post = {
      _id: `demo-post-${Date.now()}`,
      ...input,
      userId: req.user._id,
      scheduledAt: input.scheduledAt,
      status: 'scheduled'
    };
    const schedule = {
      _id: `demo-schedule-${Date.now()}`,
      userId: req.user._id,
      postId: post._id,
      platform: post.platform,
      runAt: post.scheduledAt,
      status: 'queued'
    };
    res.status(201).json({ post, schedule });
    return;
  }

  const post = await Post.create({
    ...input,
    media: normalizeMedia(input.media),
    userId: req.user._id,
    scheduledAt: new Date(input.scheduledAt),
    status: 'scheduled'
  });
  const schedule = await Schedule.create({
    userId: req.user._id,
    postId: post._id,
    platform: post.platform,
    runAt: post.scheduledAt,
    status: 'queued'
  });
  res.status(201).json({ post, schedule });
}));

function normalizeMedia(media) {
  if (!media?.imageUrl) return {};
  return {
    imageUrl: media.imageUrl.trim(),
    altText: media.altText?.trim() || ''
  };
}

scheduleRoutes.get('/schedules', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.json({
      schedules: [
        {
          _id: 'demo-schedule-1',
          userId: req.user._id,
          postId: {
            _id: 'demo-post-2',
            title: 'Upcoming X thread',
            platform: 'x',
            status: 'scheduled'
          },
          platform: 'x',
          runAt: new Date(Date.now() + 86_400_000).toISOString(),
          status: 'queued'
        }
      ]
    });
    return;
  }

  const schedules = await Schedule.find({ userId: req.user._id }).populate('postId').sort({ runAt: 1 });
  res.json({ schedules });
}));
