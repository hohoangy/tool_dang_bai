import bcrypt from 'bcryptjs';
import { connectDb } from '../config/db.js';
import { User } from '../models/user.model.js';
import { Post } from '../models/post.model.js';
import { SocialAccount } from '../models/social-account.model.js';
import { Schedule } from '../models/schedule.model.js';
import { Log } from '../models/log.model.js';

await connectDb();

await Promise.all([Log.deleteMany({}), Schedule.deleteMany({}), SocialAccount.deleteMany({}), Post.deleteMany({})]);
await User.deleteMany({});

const user = await User.create({
  name: 'Demo Creator',
  email: 'creator@example.com',
  passwordHash: await bcrypt.hash('password123', 12),
  plan: 'pro'
});

await SocialAccount.insertMany([
  { userId: user._id, platform: 'facebook', accountName: 'Creator Facebook Page', externalAccountId: 'page_demo', status: 'connected', accessToken: 'demo' },
  { userId: user._id, platform: 'x', accountName: '@creatorai', externalAccountId: 'x_demo', status: 'connected', accessToken: 'demo' },
  { userId: user._id, platform: 'youtube', accountName: 'Creator Studio', externalAccountId: 'yt_demo', status: 'connected', accessToken: 'demo' },
  { userId: user._id, platform: 'tiktok', accountName: 'TikTok module', externalAccountId: 'tt_demo', status: 'designed' }
]);

const baseContent = {
  hook: 'Your next post does not need to start from a blank page.',
  caption: 'Pick one idea, turn it into a hook, add a clear takeaway, and schedule it while the idea is still fresh.',
  hashtags: ['#AIContent', '#CreatorWorkflow', '#SocialAutomation'],
  cta: 'Save this workflow for your next batch session.',
  outline: ['Idea', 'Hook', 'Takeaway', 'CTA']
};

await Post.insertMany([
  { userId: user._id, title: 'Batch content workflow', topic: 'content batching', tone: 'viral', platform: 'facebook', content: baseContent, media: { imageUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643', altText: 'Workspace with laptop and notebook' }, status: 'published', publishedAt: new Date(), metrics: { impressions: 3400, likes: 220, comments: 31, shares: 18 } },
  { userId: user._id, title: 'AI hooks for creators', topic: 'AI hooks', tone: 'storytelling', platform: 'x', content: baseContent, status: 'scheduled', scheduledAt: new Date(Date.now() + 3600_000) },
  { userId: user._id, title: 'Short video outline', topic: 'short video', tone: 'inspirational', platform: 'youtube', content: baseContent, status: 'draft' },
  { userId: user._id, title: 'Repurpose one idea', topic: 'repurposing', tone: 'professional', platform: 'tiktok', content: baseContent, status: 'failed', errorMessage: 'TikTok module is designed but not connected.' }
]);

const scheduled = await Post.findOne({ userId: user._id, status: 'scheduled' });
await Schedule.create({ userId: user._id, postId: scheduled._id, platform: scheduled.platform, runAt: scheduled.scheduledAt });

console.log('Demo data seeded.');
process.exit(0);
