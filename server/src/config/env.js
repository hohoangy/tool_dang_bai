import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE || '../.env' });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  noDb: process.env.NO_DB === 'true',
  databaseUrl: process.env.DATABASE_URL || 'mysql://root:@localhost:3306/ai_social_automation',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  tokenEncryptionSecret: process.env.TOKEN_ENCRYPTION_SECRET || process.env.MOBILE_AUTOMATION_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me',
  aiProvider: process.env.AI_PROVIDER || 'demo',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    redirectUri: process.env.META_REDIRECT_URI || '',
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0'
  },
  x: {
    clientId: process.env.X_CLIENT_ID || '',
    clientSecret: process.env.X_CLIENT_SECRET || '',
    redirectUri: process.env.X_REDIRECT_URI || ''
  },
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || ''
  },
  mobileAutomation: {
    ldconsolePath: process.env.LDCONSOLE_PATH || 'ldconsole',
    adbPath: process.env.ADB_PATH || 'adb',
    secret: process.env.MOBILE_AUTOMATION_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me',
    launchWaitMs: Number(process.env.MOBILE_LAUNCH_WAIT_MS || 8000),
    stepDelayMs: Number(process.env.MOBILE_STEP_DELAY_MS || 900)
  }
};
