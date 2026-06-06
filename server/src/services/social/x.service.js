import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';
import { loadImage } from '../../utils/media-file.js';

const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

export const xService = {
  getAuthUrl(userId) {
    const codeVerifier = base64Url(crypto.randomBytes(32));
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = jwt.sign({ userId, codeVerifier }, env.jwtSecret, { expiresIn: '10m' });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.x.clientId,
      redirect_uri: env.x.redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    return `https://x.com/i/oauth2/authorize?${params.toString()}`;
  },

  verifyState(state) {
    try {
      return jwt.verify(state, env.jwtSecret);
    } catch {
      throw new ApiError(400, 'Invalid or expired X OAuth state.');
    }
  },

  async exchangeCode(code, codeVerifier) {
    if (!env.x.clientId || !env.x.clientSecret) throw new ApiError(400, 'X OAuth is not configured.');
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: env.x.clientId,
      redirect_uri: env.x.redirectUri,
      code_verifier: codeVerifier
    });
    try {
      const { data } = await axios.post('https://api.x.com/2/oauth2/token', body, {
        auth: { username: env.x.clientId, password: env.x.clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return data;
    } catch (error) {
      throw toXApiError(error, 'X token exchange failed.');
    }
  },

  async getMe(accessToken) {
    try {
      const { data } = await axios.get('https://api.x.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { 'user.fields': 'username,name,profile_image_url' }
      });
      return data.data;
    } catch (error) {
      throw toXApiError(error, 'X profile lookup failed.');
    }
  },

  async refreshToken(account) {
    const body = new URLSearchParams({
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token',
      client_id: env.x.clientId
    });
    const { data } = await axios.post('https://api.x.com/2/oauth2/token', body, {
      auth: { username: env.x.clientId, password: env.x.clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return data;
  },

  async publish(account, post) {
    if (!account?.accessToken) throw new ApiError(400, 'X account is not connected.');
    if (account.accessToken.startsWith('demo')) {
      return { externalPostId: `x_demo_${Date.now()}`, raw: { demo: true } };
    }
    const text = buildTweetText(post);
    const images = getPostImages(post);
    try {
      const mediaIds = [];
      for (const image of images) {
        mediaIds.push(await uploadImage(account.accessToken, image));
      }
      const payload = {};
      if (text) payload.text = text;
      if (mediaIds.length) payload.media = { media_ids: mediaIds };
      const { data } = await axios.post(
        'https://api.x.com/2/tweets',
        payload,
        { headers: { Authorization: `Bearer ${account.accessToken}` } }
      );
      return { externalPostId: data.data.id, raw: data };
    } catch (error) {
      if (isCreditsDepleted(error)) {
        throw new ApiError(
          402,
          'X API credits are depleted. The post was not published to X.',
          error.response?.data || error.message
        );
      }
      throw toXApiError(error, 'X publish failed.');
    }
  }
};

function buildTweetText(post) {
  const tags = (post.content.hashtags || []).join(' ');
  const base = [post.content.hook, post.content.caption, tags].filter(Boolean).join('\n\n');
  if (base.length <= 280) return base;
  return `${base.slice(0, 277).trimEnd()}...`;
}

function getPostImages(post) {
  if (Array.isArray(post.media?.images) && post.media.images.length) {
    return post.media.images.slice(0, 4);
  }
  return post.media?.imageUrl ? [{ url: post.media.imageUrl, altText: post.media.altText }] : [];
}

async function uploadImage(accessToken, image) {
  const { buffer, mimeType } = await loadImage(image);
  if (!mimeType?.startsWith('image/')) throw new ApiError(400, 'Selected media is not a supported image.');
  if (buffer.length > 5 * 1024 * 1024) throw new ApiError(400, 'X images must be 5 MB or smaller.');

  try {
    const { data } = await axios.post(
      'https://api.x.com/2/media/upload',
      {
        media: buffer.toString('base64'),
        media_category: 'tweet_image',
        media_type: mimeType,
        shared: false
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        maxBodyLength: 8 * 1024 * 1024
      }
    );
    const mediaId = data?.data?.id;
    if (!mediaId) throw new ApiError(502, 'X did not return a media ID.');
    if (image.altText?.trim()) {
      await axios.post(
        'https://api.x.com/2/media/metadata',
        {
          id: mediaId,
          metadata: {
            alt_text: { text: image.altText.trim().slice(0, 1000) }
          }
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }
    return mediaId;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isCreditsDepleted(error)) {
      throw new ApiError(
        402,
        'X API credits are depleted. The image and post were not published to X.',
        error.response?.data || error.message
      );
    }
    throw toXApiError(error, 'X image upload failed.');
  }
}

function toXApiError(error, fallbackMessage) {
  const details = error.response?.data || error.message;
  const status = error.response?.status || 502;
  console.error(fallbackMessage, details);
  return new ApiError(status >= 400 && status < 500 ? 400 : 502, fallbackMessage, details);
}

function isCreditsDepleted(error) {
  const details = error.response?.data;
  return details?.title === 'CreditsDepleted' || details?.type === 'https://api.twitter.com/2/problems/credits';
}

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
