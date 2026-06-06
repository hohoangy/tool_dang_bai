import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { ApiError, asyncHandler } from '../../utils/api-error.js';
import { postRepository } from '../../repositories/post.repository.js';
import { publishPostToPlatform } from '../../services/social/publisher.service.js';
import { env } from '../../config/env.js';

export const postRoutes = Router();

const demoPosts = [
  {
    _id: 'demo-post-1',
    title: 'Bài ra mắt trên Facebook',
    topic: 'Ra mắt kênh mạng xã hội',
    tone: 'viral',
    platform: 'facebook',
    status: 'published',
    scheduledAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    content: {
      hook: 'Bạn vẫn có thể bắt đầu quy trình nội dung trước khi có database.',
      caption: 'Bài viết mẫu có thể chỉnh sửa khi database đang tắt.',
      hashtags: ['#social', '#automation'],
      cta: 'Thử bảng điều khiển ngay hôm nay.',
      outline: []
    },
    media: {},
    metrics: { impressions: 1280, likes: 96, comments: 14, shares: 22 }
  },
  {
    _id: 'demo-post-2',
    title: 'Chuỗi bài X sắp đăng',
    topic: 'Vận hành nội dung',
    tone: 'educational',
    platform: 'x',
    status: 'scheduled',
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    content: {
      hook: 'Một hàng chờ gọn nhẹ giúp nội dung luôn được triển khai.',
      caption: 'Nội dung nháp để xem trước hàng chờ.',
      hashtags: ['#content'],
      cta: 'Lên lịch cho bài viết tiếp theo.',
      outline: []
    },
    media: {},
    metrics: { impressions: 0, likes: 0, comments: 0, shares: 0 }
  }
];

postRoutes.get('/posts', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb) {
    const status = req.query.status;
    const posts = status ? demoPosts.filter((post) => post.status === status) : demoPosts;
    res.json({ posts });
    return;
  }

  const status = req.query.status;
  const filters = status ? { status } : {};
  const posts = await postRepository.findByUser(req.user._id, filters);
  res.json({ posts });
}));

postRoutes.patch('/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({
    title: z.string().optional(),
    content: z.object({
      hook: z.string().optional(),
      caption: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      cta: z.string().optional(),
      outline: z.array(z.string()).optional()
    }).optional(),
    status: z.enum(['draft', 'queued', 'scheduled', 'published', 'failed']).optional(),
    socialAccountId: z.string().optional().or(z.literal('')),
    scheduledAt: z.string().datetime().optional(),
    media: z.object({
      imageUrl: z.string().url().optional().or(z.literal('')),
      altText: z.string().optional(),
      images: z.array(z.object({
        url: z.string().url(),
        mimeType: z.string().startsWith('image/').optional(),
        name: z.string().optional(),
        size: z.number().int().positive().max(5 * 1024 * 1024).optional(),
        altText: z.string().max(1000).optional()
      })).max(4).optional()
    }).optional()
  });
  const input = schema.parse(req.body);
  if (env.noDb) {
    const post = demoPosts.find((item) => item._id === req.params.id);
    if (!post) throw new ApiError(404, 'Post not found.');
    res.json({ post: { ...post, ...input } });
    return;
  }

  const post = await postRepository.findByIdForUser(req.params.id, req.user._id);
  if (!post) throw new ApiError(404, 'Post not found.');
  Object.assign(post, input);
  await post.save();
  res.json({ post });
}));

postRoutes.delete('/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.status(204).send();
    return;
  }

  const post = await postRepository.findByIdForUser(req.params.id, req.user._id);
  if (!post) throw new ApiError(404, 'Post not found.');
  await post.deleteOne();
  res.status(204).send();
}));

postRoutes.post('/publish-post', requireAuth, asyncHandler(async (req, res) => {
  const { postId } = z.object({ postId: z.string() }).parse(req.body);
  if (env.noDb) {
    const post = demoPosts.find((item) => item._id === postId);
    const publishedPost = post || {
      _id: postId,
      title: 'Bài viết demo',
      platform: 'facebook',
      status: 'scheduled',
      content: {
        hook: 'Bài viết đang được đăng ở chế độ demo.',
        caption: 'Khi kết nối Trang Facebook thật, nội dung sẽ được gửi qua Meta Graph API.',
        hashtags: ['#demo'],
        cta: 'Kiểm tra lại cấu hình Meta trước khi đăng thật.'
      }
    };
    res.json({
      post: { ...publishedPost, status: 'published', publishedAt: new Date().toISOString() },
      result: { externalPostId: `demo-${Date.now()}` }
    });
    return;
  }

  const post = await postRepository.findByIdForUser(postId, req.user._id);
  if (!post) throw new ApiError(404, 'Post not found.');

  try {
    const result = await publishPostToPlatform(req.user._id, post);
    post.status = 'published';
    post.publishedAt = new Date();
    post.externalPostId = result.externalPostId;
    post.errorMessage = null;
    await post.save();

    res.json({ post, result });
  } catch (error) {
    post.status = 'failed';
    post.errorMessage = error.message;
    await post.save();
    throw error;
  }
}));
