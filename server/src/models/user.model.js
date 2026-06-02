import { createModel, parseJson } from './mysql-model.js';

export const User = createModel({
  table: 'users',
  fieldMap: {
    _id: 'id',
    passwordHash: 'password_hash',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  normalize(data) {
    return {
      id: data._id,
      name: data.name,
      email: data.email?.toLowerCase(),
      password_hash: data.passwordHash,
      plan: data.plan || 'starter',
      preferences: JSON.stringify(data.preferences || { darkMode: false, defaultTone: 'viral', timezone: 'Asia/Saigon' }),
      created_at: data.createdAt,
      updated_at: data.updatedAt
    };
  },
  hydrate(row) {
    return {
      _id: row.id,
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      plan: row.plan,
      preferences: parseJson(row.preferences, { darkMode: false, defaultTone: 'viral', timezone: 'Asia/Saigon' }),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
});
