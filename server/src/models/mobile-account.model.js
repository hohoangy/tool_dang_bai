import { createModel, parseJson } from './mysql-model.js';

export const MobileAccount = createModel({
  table: 'mobile_accounts',
  fieldMap: {
    _id: 'id',
    userId: 'user_id',
    displayName: 'display_name',
    accountHandle: 'account_handle',
    instanceName: 'instance_name',
    adbHost: 'adb_host',
    deviceId: 'device_id',
    lastLoginAt: 'last_login_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  normalize(data) {
    return {
      id: data._id,
      user_id: data.userId,
      platform: data.platform,
      display_name: data.displayName,
      account_handle: data.accountHandle || null,
      instance_name: data.instanceName,
      adb_host: data.adbHost || null,
      device_id: data.deviceId || null,
      status: data.status || 'ready',
      notes: data.notes || null,
      metadata: JSON.stringify(data.metadata || {}),
      last_login_at: data.lastLoginAt || null,
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
      displayName: row.display_name,
      accountHandle: row.account_handle,
      instanceName: row.instance_name,
      adbHost: row.adb_host,
      deviceId: row.device_id,
      status: row.status,
      notes: row.notes,
      metadata: parseJson(row.metadata, {}),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
});
