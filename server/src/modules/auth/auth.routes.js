import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../../models/user.model.js';
import { env } from '../../config/env.js';
import { ApiError, asyncHandler } from '../../utils/api-error.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

export const authRoutes = Router();

const authSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email(),
  password: z.string().min(8)
});

const demoUser = {
  id: 'demo-user',
  _id: 'demo-user',
  name: 'Demo Creator',
  email: 'creator@example.com',
  preferences: {
    tone: 'viral',
    defaultPlatforms: ['facebook', 'x']
  }
};

function sign(user) {
  return jwt.sign({ sub: user._id.toString() }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

authRoutes.post('/register', asyncHandler(async (req, res) => {
  const input = authSchema.extend({ name: z.string().min(2) }).parse(req.body);
  if (env.noDb) {
    const user = { ...demoUser, name: input.name, email: input.email };
    res.status(201).json({ token: sign(user), user });
    return;
  }

  const exists = await User.findOne({ email: input.email });
  if (exists) throw new ApiError(409, 'Email is already registered.');

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12)
  });

  res.status(201).json({ token: sign(user), user: { id: user._id, name: user.name, email: user.email } });
}));

authRoutes.post('/login', asyncHandler(async (req, res) => {
  const input = authSchema.omit({ name: true }).parse(req.body);
  if (env.noDb) {
    res.json({ token: sign(demoUser), user: demoUser });
    return;
  }

  const user = await User.findOne({ email: input.email });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  res.json({ token: sign(user), user: { id: user._id, name: user.name, email: user.email, preferences: user.preferences } });
}));

authRoutes.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));
