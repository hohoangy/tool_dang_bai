import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/api-error.js';
import { generateContent } from '../../services/ai/content-generator.service.js';

export const contentRoutes = Router();

const generateSchema = z.object({
  topic: z.string().min(2),
  tone: z.string().default('viral'),
  platform: z.enum(['facebook', 'x', 'youtube', 'tiktok']),
  count: z.number().int().min(1).max(10).default(1)
});

contentRoutes.post('/generate-content', requireAuth, asyncHandler(async (req, res) => {
  const input = generateSchema.parse(req.body);
  const items = await generateContent(input);
  res.json({ items });
}));
