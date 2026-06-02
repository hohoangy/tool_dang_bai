import { ApiError } from '../../utils/api-error.js';

export const tiktokService = {
  getAuthUrl() {
    return null;
  },
  async publish(account) {
    if (account?.accessToken?.startsWith('demo')) {
      return { externalPostId: `tt_demo_${Date.now()}`, raw: { demo: true, note: 'TikTok module demo publish' } };
    }
    throw new ApiError(501, 'TikTok module is designed and ready for OAuth/API implementation.');
  }
};
