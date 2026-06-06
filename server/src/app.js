import express from 'express';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { contentRoutes } from './modules/content/content.routes.js';
import { postRoutes } from './modules/posts/post.routes.js';
import { scheduleRoutes } from './modules/schedules/schedule.routes.js';
import { socialRoutes } from './modules/social/social.routes.js';
import { mobileRoutes } from './modules/mobile/mobile.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { uploadsDir } from './utils/media-file.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 60_000, limit: 240 }));

app.get('/health', (_req, res) => res.json({ ok: true }));
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir, {
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api', mediaRoutes);
app.use('/api', contentRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', postRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', dashboardRoutes);

app.use(errorHandler);
