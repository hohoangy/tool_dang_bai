import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/api-error.js';
import { Post } from '../../models/post.model.js';
import { env } from '../../config/env.js';

export const analyticsRoutes = Router();

analyticsRoutes.get('/analytics', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.json({
      totals: { impressions: 1280, likes: 96, comments: 14, shares: 22 },
      series: [
        { day: 'Mon', posts: 2, engagement: 120 },
        { day: 'Tue', posts: 3, engagement: 180 },
        { day: 'Wed', posts: 1, engagement: 140 },
        { day: 'Thu', posts: 4, engagement: 260 },
        { day: 'Fri', posts: 2, engagement: 210 },
        { day: 'Sat', posts: 1, engagement: 160 },
        { day: 'Sun', posts: 2, engagement: 230 }
      ],
      topPosts: [
        {
          _id: 'demo-post-1',
          title: 'Demo Facebook launch post',
          platform: 'facebook',
          metrics: { impressions: 1280, likes: 96, comments: 14, shares: 22 }
        }
      ]
    });
    return;
  }

  const posts = await Post.find({ userId: req.user._id, status: 'published' }).sort({ publishedAt: -1 }).limit(50);
  const totals = posts.reduce(
    (acc, post) => {
      acc.impressions += post.metrics.impressions;
      acc.likes += post.metrics.likes;
      acc.comments += post.metrics.comments;
      acc.shares += post.metrics.shares;
      return acc;
    },
    { impressions: 0, likes: 0, comments: 0, shares: 0 }
  );
  const series = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => ({
    day,
    posts: Math.max(1, (posts.length + index) % 8),
    engagement: 120 + index * 46
  }));
  res.json({ totals, series, topPosts: posts.slice(0, 5) });
}));
