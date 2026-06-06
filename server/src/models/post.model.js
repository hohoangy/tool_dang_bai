import { createModel, parseJson, toMysqlDate } from './mysql-model.js';

const defaultMetrics = { impressions: 0, likes: 0, comments: 0, shares: 0 };

export const Post = createModel({
  table: 'posts',
  fieldMap: {
    _id: 'id',
    userId: 'user_id',
    scheduledAt: 'scheduled_at',
    publishedAt: 'published_at',
    externalPostId: 'external_post_id',
    errorMessage: 'error_message',
    socialAccountId: 'social_account_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  normalize(data) {
    return {
      id: data._id,
      user_id: data.userId,
      title: data.title,
      topic: data.topic,
      tone: data.tone,
      platform: data.platform,
      social_account_id: data.socialAccountId || null,
      content: JSON.stringify(data.content || {}),
      status: data.status || 'draft',
      scheduled_at: toMysqlDate(data.scheduledAt),
      published_at: toMysqlDate(data.publishedAt),
      external_post_id: data.externalPostId || null,
      error_message: data.errorMessage || null,
      media: JSON.stringify(data.media || {}),
      metrics: JSON.stringify(data.metrics || defaultMetrics),
      created_at: data.createdAt,
      updated_at: data.updatedAt
    };
  },
  hydrate(row) {
    return {
      _id: row.id,
      id: row.id,
      userId: row.user_id,
      title: row.title,
      topic: row.topic,
      tone: row.tone,
      platform: row.platform,
      socialAccountId: row.social_account_id,
      content: parseJson(row.content, {}),
      status: row.status,
      scheduledAt: row.scheduled_at,
      publishedAt: row.published_at,
      externalPostId: row.external_post_id,
      errorMessage: row.error_message,
      media: parseJson(row.media, {}),
      metrics: parseJson(row.metrics, defaultMetrics),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
});
