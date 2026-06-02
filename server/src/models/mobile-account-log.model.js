import { createModel, parseJson } from './mysql-model.js';

export const MobileAccountLog = createModel({
  table: 'mobile_account_logs',
  fieldMap: {
    _id: 'id',
    userId: 'user_id',
    accountId: 'account_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  normalize(data) {
    return {
      id: data._id,
      user_id: data.userId,
      account_id: data.accountId,
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
      accountId: row.account_id,
      level: row.level,
      action: row.action,
      message: row.message,
      metadata: parseJson(row.metadata, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
});
