import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';

export const facebookService = {
  getAuthUrl(userId) {
    const state = jwt.sign({ userId, provider: 'facebook' }, env.jwtSecret, { expiresIn: '15m' });
    const params = new URLSearchParams({
      client_id: env.meta.appId,
      redirect_uri: env.meta.redirectUri,
      state,
      scope: 'pages_manage_posts,pages_read_engagement,pages_show_list',
      response_type: 'code'
    });
    return `https://www.facebook.com/${env.meta.graphVersion}/dialog/oauth?${params.toString()}`;
  },

  verifyState(state) {
    try {
      const payload = jwt.verify(state, env.jwtSecret);
      if (payload.provider !== 'facebook' || !payload.userId) throw new Error('Invalid state payload.');
      return payload;
    } catch {
      throw new ApiError(400, 'Facebook OAuth state is invalid or expired. Please connect again.');
    }
  },

  async exchangeCode(code) {
    if (!env.meta.appId || !env.meta.appSecret) throw new ApiError(400, 'Meta OAuth is not configured.');
    const { data } = await axios.get(graphUrl('oauth/access_token'), {
      params: {
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        redirect_uri: env.meta.redirectUri,
        code
      }
    });
    return data;
  },

  async exchangeLongLivedUserToken(shortLivedAccessToken) {
    if (!env.meta.appId || !env.meta.appSecret) throw new ApiError(400, 'Meta OAuth is not configured.');
    const { data } = await axios.get(graphUrl('oauth/access_token'), {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        fb_exchange_token: shortLivedAccessToken
      }
    });
    return data;
  },

  async getPages(userAccessToken) {
    const { data } = await axios.get(graphUrl('me/accounts'), {
      params: {
        fields: 'id,name,access_token,tasks',
        access_token: userAccessToken,
        appsecret_proof: appSecretProof(userAccessToken)
      }
    });
    return data.data || [];
  },

  async refreshToken(account) {
    const exchangeToken = account.refreshToken || account.accessToken;
    const { data } = await axios.get(graphUrl('oauth/access_token'), {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        fb_exchange_token: exchangeToken
      }
    });
    return data;
  },

  async publish(account, post) {
    if (!account?.accessToken) throw new ApiError(400, 'Facebook Page is not connected.');
    if (account.accessToken.startsWith('demo')) {
      return { externalPostId: `fb_demo_${Date.now()}`, raw: { demo: true } };
    }
    const pageId = account.externalAccountId;
    if (!pageId) throw new ApiError(400, 'Facebook Page ID is missing. Please reconnect your Page.');
    const message = buildMessage(post);
    const imageUrl = post.media?.imageUrl;
    const endpoint = imageUrl ? 'photos' : 'feed';
    const payload = imageUrl
      ? { url: imageUrl, caption: message, access_token: account.accessToken, appsecret_proof: appSecretProof(account.accessToken) }
      : { message, access_token: account.accessToken, appsecret_proof: appSecretProof(account.accessToken) };

    const { data } = await axios.post(graphUrl(`${pageId}/${endpoint}`), payload);
    return { externalPostId: data.id, raw: data };
  }
};

function graphUrl(path) {
  return `https://graph.facebook.com/${env.meta.graphVersion}/${path}`;
}

function appSecretProof(accessToken) {
  if (!env.meta.appSecret || !accessToken || accessToken.startsWith('demo')) return undefined;
  return crypto.createHmac('sha256', env.meta.appSecret).update(accessToken).digest('hex');
}

function buildMessage(post) {
  return [
    post.content.hook,
    post.content.caption,
    (post.content.hashtags || []).join(' '),
    post.content.cta
  ].filter(Boolean).join('\n\n');
}
