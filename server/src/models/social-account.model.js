import { createModel, parseJson, toMysqlDate } from './mysql-model.js';
import { decryptSecret, encryptSecret } from '../utils/secret.js';

export const SocialAccount = createModel({
  table: 'social_accounts',
  fieldMap: {
    _id: 'id',
    userId: 'user_id',
    accountName: 'account_name',
    externalAccountId: 'external_account_id',
    accessToken: 'access_token',
    refreshToken: 'refresh_token',
    tokenExpiresAt: 'token_expires_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  normalize(data) {
    return {
      id: data._id,
      user_id: data.userId,
      platform: data.platform,
      account_name: data.accountName,
      external_account_id: data.externalAccountId || null,
      access_token: data.accessToken ? encryptSecret(data.accessToken) : null,
      refresh_token: data.refreshToken ? encryptSecret(data.refreshToken) : null,
      token_expires_at: toMysqlDate(data.tokenExpiresAt),
      scopes: JSON.stringify(data.scopes || []),
      status: data.status || 'connected',
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
      platform: row.platform,
      accountName: row.account_name,
      externalAccountId: row.external_account_id,
      accessToken: decryptSecret(row.access_token),
      refreshToken: decryptSecret(row.refresh_token),
      tokenExpiresAt: row.token_expires_at,
      scopes: parseJson(row.scopes, []),
      status: row.status,
      metadata: parseJson(row.metadata, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
});
