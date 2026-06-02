import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/api-error.js';
import { SocialAccount } from '../../models/social-account.model.js';
import { facebookService } from '../../services/social/facebook.service.js';
import { xService } from '../../services/social/x.service.js';
import { youtubeService } from '../../services/social/youtube.service.js';
import { env } from '../../config/env.js';

export const socialRoutes = Router();

socialRoutes.get('/accounts', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.json({
      accounts: [
        {
          _id: 'demo-social-facebook',
          userId: req.user._id,
          platform: 'facebook',
          accountName: 'Facebook demo account',
          status: 'connected'
        }
      ]
    });
    return;
  }

  const accounts = await SocialAccount.find({ userId: req.user._id }).select('-accessToken -refreshToken');
  res.json({ accounts });
}));

socialRoutes.get('/connect-facebook', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb || !env.meta.appId || !env.meta.appSecret) {
    res.json({ demo: true });
    return;
  }

  res.json({ url: facebookService.getAuthUrl(req.user._id.toString()) });
}));

socialRoutes.get('/connect-x', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb || !env.x.clientId || !env.x.clientSecret) {
    res.json({ demo: true });
    return;
  }

  res.json({ url: xService.getAuthUrl(req.user._id.toString()) });
}));

socialRoutes.get('/connect-youtube', requireAuth, asyncHandler(async (req, res) => {
  if (env.noDb || !env.youtube.clientId || !env.youtube.clientSecret) {
    res.json({ demo: true });
    return;
  }

  res.json({ url: youtubeService.getAuthUrl(req.user._id.toString()) });
}));

socialRoutes.get('/connect-facebook/callback', asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.redirect('/');
    return;
  }

  const token = await facebookService.exchangeCode(req.query.code);
  const pages = await facebookService.getPages(token.access_token);
  const page = pages[0];
  if (!page?.access_token) {
    res.redirect(`${env.clientUrl}/platforms?facebook=missing-page`);
    return;
  }

  await SocialAccount.create({
    userId: req.query.state,
    platform: 'facebook',
    accountName: page.name,
    externalAccountId: page.id,
    accessToken: page.access_token,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined,
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
    metadata: { tasks: page.tasks || [] },
    status: 'connected'
  });
  res.redirect(`${env.clientUrl}/platforms?facebook=connected`);
}));

socialRoutes.get('/connect-x/callback', asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.redirect(`${env.clientUrl}/platforms?x=demo`);
    return;
  }

  const oauthState = xService.verifyState(req.query.state);
  const token = await xService.exchangeCode(req.query.code, oauthState.codeVerifier);
  const profile = await xService.getMe(token.access_token);

  await SocialAccount.deleteMany({ userId: oauthState.userId, platform: 'x' });
  await SocialAccount.create({
    userId: oauthState.userId,
    platform: 'x',
    accountName: profile?.username ? `@${profile.username}` : 'X account',
    externalAccountId: profile?.id,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    metadata: { profile },
    status: 'connected'
  });
  res.redirect(`${env.clientUrl}/platforms?x=connected`);
}));

socialRoutes.get('/connect-youtube/callback', asyncHandler(async (req, res) => {
  if (env.noDb) {
    res.redirect('/');
    return;
  }

  const token = await youtubeService.exchangeCode(req.query.code);
  await SocialAccount.create({
    userId: req.query.state,
    platform: 'youtube',
    accountName: 'YouTube channel',
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined,
    status: 'connected'
  });
  res.redirect('/');
}));

socialRoutes.post('/mock-connect', requireAuth, asyncHandler(async (req, res) => {
  const { platform } = req.body;
  if (env.noDb) {
    res.status(201).json({
      account: {
        _id: `demo-social-${platform}`,
        userId: req.user._id,
        platform,
        accountName: `${platform} demo account`,
        externalAccountId: `${platform}_demo_id`,
        status: platform === 'tiktok' ? 'designed' : 'connected'
      }
    });
    return;
  }

  const account = await SocialAccount.create({
    userId: req.user._id,
    platform,
    accountName: `${platform} demo account`,
    externalAccountId: `${platform}_demo_id`,
    accessToken: 'demo-token',
    refreshToken: 'demo-refresh',
    status: platform === 'tiktok' ? 'designed' : 'connected'
  });
  res.status(201).json({ account });
}));
