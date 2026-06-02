import axios from 'axios';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';

export const facebookService = {
  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: env.meta.appId,
      redirect_uri: env.meta.redirectUri,
      state,
      scope: 'pages_manage_posts,pages_read_engagement,pages_show_list',
      response_type: 'code'
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  },

  async exchangeCode(code) {
    if (!env.meta.appId || !env.meta.appSecret) throw new ApiError(400, 'Meta OAuth is not configured.');
    const { data } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        redirect_uri: env.meta.redirectUri,
        code
      }
    });
    return data;
  },

  async getPages(userAccessToken) {
    const { data } = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: {
        fields: 'id,name,access_token,tasks',
        access_token: userAccessToken
      }
    });
    return data.data || [];
  },

  async refreshToken(account) {
    const { data } = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        fb_exchange_token: account.accessToken
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
      ? { url: imageUrl, caption: message, access_token: account.accessToken }
      : { message, access_token: account.accessToken };

    const { data } = await axios.post(`https://graph.facebook.com/v21.0/${pageId}/${endpoint}`, payload);
    return { externalPostId: data.id, raw: data };
  }
};

function buildMessage(post) {
  return [
    post.content.hook,
    post.content.caption,
    (post.content.hashtags || []).join(' '),
    post.content.cta
  ].filter(Boolean).join('\n\n');
}
