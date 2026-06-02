import { Router } from 'express';
import dayjs from 'dayjs';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/api-error.js';
import { Post } from '../../models/post.model.js';
import { env } from '../../config/env.js';

export const dashboardRoutes = Router();

dashboardRoutes.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.json({
      stats: { totalPosts: 3, queuedPosts: 1, failedPosts: 0, publishedToday: 1 },
      recentPosts: [
        {
          _id: 'demo-post-1',
          title: 'Bài ra mắt trên Facebook',
          platform: 'facebook',
          status: 'published',
          scheduledAt: new Date().toISOString(),
          content: {
            caption: 'Bài viết mẫu có thể chỉnh sửa khi database đang tắt.',
            hashtags: ['#social', '#automation']
          }
        },
        {
          _id: 'demo-post-2',
          title: 'Chuỗi bài X sắp đăng',
          platform: 'x',
          status: 'scheduled',
          scheduledAt: dayjs().add(1, 'day').toISOString(),
          content: {
            caption: 'Nội dung nháp để xem trước hàng chờ.',
            hashtags: ['#content']
          }
        }
      ]
    });
    return;
  }

  const todayStart = dayjs().startOf('day').toDate();
  const todayEnd = dayjs().endOf('day').toDate();
  const [total, queued, failed, publishedToday, recentPosts] = await Promise.all([
    Post.countDocuments({ userId: req.user._id }),
    Post.countDocuments({ userId: req.user._id, status: { $in: ['queued', 'scheduled'] } }),
    Post.countDocuments({ userId: req.user._id, status: 'failed' }),
    Post.countDocuments({ userId: req.user._id, publishedAt: { $gte: todayStart, $lte: todayEnd } }),
    Post.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(6)
  ]);
  res.json({
    stats: { totalPosts: total, queuedPosts: queued, failedPosts: failed, publishedToday },
    recentPosts
  });
}));
