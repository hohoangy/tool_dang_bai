import { SocialAccount } from '../../models/social-account.model.js';
import { Log } from '../../models/log.model.js';
import { ApiError } from '../../utils/api-error.js';
import { facebookService } from './facebook.service.js';
import { xService } from './x.service.js';
import { youtubeService } from './youtube.service.js';
import { tiktokService } from './tiktok.service.js';

const providers = {
  facebook: facebookService,
  x: xService,
  youtube: youtubeService,
  tiktok: tiktokService
};

async function refreshIfNeeded(provider, account) {
  if (!account?.tokenExpiresAt || account.tokenExpiresAt > new Date() || !provider.refreshToken) return account;
  const token = await provider.refreshToken(account);
  account.accessToken = token.access_token || account.accessToken;
  account.refreshToken = token.refresh_token || account.refreshToken;
  account.tokenExpiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : account.tokenExpiresAt;
  account.status = 'connected';
  await account.save();
  return account;
}

export async function publishPostToPlatform(userId, post) {
  const provider = providers[post.platform];
  if (!provider) throw new ApiError(400, 'Unsupported platform.');

  const accountFilter = post.socialAccountId
    ? { _id: post.socialAccountId, userId, platform: post.platform, status: { $in: ['connected', 'designed'] } }
    : { userId, platform: post.platform, status: { $in: ['connected', 'designed'] } };
  let account = await SocialAccount.findOne(accountFilter);
  if (!account) throw new ApiError(400, `No connected ${post.platform} account is available for this post.`);
  account = await refreshIfNeeded(provider, account);
  const result = await provider.publish(account, post);

  await Log.create({
    userId,
    postId: post._id,
    action: 'publish_post',
    message: `Published to ${post.platform}`,
    metadata: result
  });

  return result;
}
