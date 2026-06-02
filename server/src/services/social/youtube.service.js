import axios from 'axios';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';

export const youtubeService = {
  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: env.youtube.clientId,
      redirect_uri: env.youtube.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async exchangeCode(code) {
    if (!env.youtube.clientId || !env.youtube.clientSecret) throw new ApiError(400, 'YouTube OAuth is not configured.');
    const { data } = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: env.youtube.clientId,
      client_secret: env.youtube.clientSecret,
      redirect_uri: env.youtube.redirectUri,
      grant_type: 'authorization_code'
    });
    return data;
  },

  async refreshToken(account) {
    const { data } = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: env.youtube.clientId,
      client_secret: env.youtube.clientSecret,
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token'
    });
    return data;
  },

  async publish(account, post) {
    if (account?.accessToken?.startsWith('demo')) {
      return { externalPostId: `yt_demo_${Date.now()}`, raw: { demo: true, note: 'Metadata-only demo publish' } };
    }
    throw new ApiError(
      501,
      `YouTube publishing for "${post.title}" requires video media upload. Metadata generation is ready; upload flow is intentionally explicit.`
    );
  }
};
