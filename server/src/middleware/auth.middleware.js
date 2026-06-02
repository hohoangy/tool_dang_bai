import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';
import { User } from '../models/user.model.js';

const demoUser = {
  _id: 'demo-user',
  id: 'demo-user',
  name: 'Demo Creator',
  email: 'creator@example.com',
  preferences: {
    tone: 'viral',
    defaultPlatforms: ['facebook', 'x']
  }
};

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required.');

    const payload = jwt.verify(token, env.jwtSecret);
    if (env.noDb) {
      req.user = { ...demoUser, _id: payload.sub || demoUser._id };
      next();
      return;
    }

    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) throw new ApiError(401, 'Invalid session.');

    req.user = user;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, 'Invalid session.'));
  }
}
