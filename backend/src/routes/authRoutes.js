import express from 'express';
import { databaseReady } from '../config/db.js';
import { authUnavailable, completeProfile, googleAuth, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

export function requireAuthService(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!process.env.JWT_SECRET?.trim() || !databaseReady()) return authUnavailable(res);
  return next();
}

router.post('/google', requireAuthService, googleAuth);
router.get('/me', requireAuthService, protect, getMe);
router.patch('/me', requireAuthService, protect, completeProfile);

export default router;
