import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool;

function parseDatabaseUrl() {
  const url = new URL(env.databaseUrl);
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'ai_social_automation')
  };
}

export function getPool() {
  if (!pool) {
    const config = parseDatabaseUrl();
    pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      dateStrings: false
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function connectDb() {
  const config = parseDatabaseUrl();
  try {
    const connection = await mysql.createConnection(config);
    await connection.end();
  } catch (error) {
    if (error.code === 'AUTH_SWITCH_PLUGIN_ERROR' && error.message.includes('auth_gssapi_client')) {
      throw new Error(
        'MySQL user uses auth_gssapi_client, which mysql2 does not support. Create a dedicated user with mysql_native_password and update DATABASE_URL.'
      );
    }
    if (error.code !== 'ER_BAD_DB_ERROR') throw error;

    const bootstrap = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password
    });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await bootstrap.end();
  }

  await migrate();
  console.log(`MySQL connected: ${config.database}`);
}

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      plan ENUM('starter', 'pro', 'team') NOT NULL DEFAULT 'starter',
      preferences JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      topic VARCHAR(255) NOT NULL,
      tone VARCHAR(80) NOT NULL,
      platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok') NOT NULL,
      social_account_id CHAR(36) NULL,
      content JSON NOT NULL,
      status ENUM('draft', 'queued', 'scheduled', 'published', 'failed') NOT NULL DEFAULT 'draft',
      scheduled_at DATETIME NULL,
      published_at DATETIME NULL,
      external_post_id VARCHAR(255) NULL,
      error_message TEXT NULL,
      media JSON NULL,
      metrics JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_posts_user_id (user_id),
      INDEX idx_posts_social_account_id (social_account_id),
      INDEX idx_posts_status (status),
      INDEX idx_posts_scheduled_at (scheduled_at),
      CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await addColumnIfMissing('posts', 'media', 'JSON NULL');
  await addColumnIfMissing('posts', 'social_account_id', 'CHAR(36) NULL');
  await query("ALTER TABLE posts MODIFY platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok') NOT NULL");

  await query(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok') NOT NULL,
      account_name VARCHAR(255) NOT NULL,
      external_account_id VARCHAR(255) NULL,
      access_token TEXT NULL,
      refresh_token TEXT NULL,
      token_expires_at DATETIME NULL,
      scopes JSON NULL,
      status ENUM('connected', 'expired', 'error', 'designed') NOT NULL DEFAULT 'connected',
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_social_accounts_user_platform (user_id, platform),
      CONSTRAINT fk_social_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await query("ALTER TABLE social_accounts MODIFY platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok') NOT NULL");

  await query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      post_id CHAR(36) NOT NULL,
      platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok') NOT NULL,
      run_at DATETIME NOT NULL,
      status ENUM('queued', 'processing', 'done', 'failed') NOT NULL DEFAULT 'queued',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_schedules_user_id (user_id),
      INDEX idx_schedules_post_id (post_id),
      INDEX idx_schedules_run_at (run_at),
      INDEX idx_schedules_status (status),
      CONSTRAINT fk_schedules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_schedules_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);
  await query("ALTER TABLE schedules MODIFY platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok') NOT NULL");

  await query(`
    CREATE TABLE IF NOT EXISTS logs (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NULL,
      post_id CHAR(36) NULL,
      level ENUM('info', 'warn', 'error') NOT NULL DEFAULT 'info',
      action VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_logs_user_id (user_id),
      INDEX idx_logs_post_id (post_id),
      CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_logs_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS mobile_accounts (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok', 'other') NOT NULL DEFAULT 'other',
      display_name VARCHAR(180) NOT NULL,
      account_handle VARCHAR(180) NULL,
      instance_name VARCHAR(180) NOT NULL,
      adb_host VARCHAR(180) NULL,
      device_id VARCHAR(180) NULL,
      status ENUM('ready', 'login_required', 'logging_in', 'connected', 'checkpoint', 'error', 'paused') NOT NULL DEFAULT 'ready',
      notes TEXT NULL,
      metadata JSON NULL,
      last_login_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mobile_accounts_user_id (user_id),
      INDEX idx_mobile_accounts_status (status),
      INDEX idx_mobile_accounts_platform (platform),
      CONSTRAINT fk_mobile_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await query("ALTER TABLE mobile_accounts MODIFY platform ENUM('facebook', 'instagram', 'x', 'youtube', 'tiktok', 'other') NOT NULL DEFAULT 'other'");

  await query(`
    CREATE TABLE IF NOT EXISTS mobile_account_logs (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      account_id CHAR(36) NOT NULL,
      level ENUM('info', 'warn', 'error') NOT NULL DEFAULT 'info',
      action VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mobile_account_logs_user_id (user_id),
      INDEX idx_mobile_account_logs_account_id (account_id),
      INDEX idx_mobile_account_logs_created_at (created_at),
      CONSTRAINT fk_mobile_account_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_mobile_account_logs_account FOREIGN KEY (account_id) REFERENCES mobile_accounts(id) ON DELETE CASCADE
    )
  `);
}

async function addColumnIfMissing(table, column, definition) {
  const rows = await query(
    'SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  if (Number(rows[0]?.count || 0) === 0) {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
