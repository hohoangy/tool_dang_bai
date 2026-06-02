import { createModel, parseJson } from './mysql-model.js';

export const Log = createModel({
  table: 'logs',
  fieldMap: {
    _id: 'id',
    userId: 'user_id',
    postId: 'post_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  normalize(data) {
    return {
      id: data._id,
      user_id: data.userId || null,
      post_id: data.postId || null,
      level: data.level || 'info',
      action: data.action,
      message: data.message,
      metadata: JSON.stringify(data.metadata || {}),
      created_at: data.createdAt,
      updated_at: data.updatedAt
    };
  },
  hydrate(row) {
    return {
      _id: row.id,
      id: row.id,
      userId: row.user_id,
      postId: row.post_id,
      level: row.level,
      action: row.action,
      message: row.message,
      metadata: parseJson(row.metadata, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
});
