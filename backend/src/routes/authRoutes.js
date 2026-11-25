import express from 'express';
import { databaseReady } from '../config/db.js';
import { authUnavailable, googleAuth, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

function requireAuthService(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!process.env.JWT_SECRET?.trim() || !databaseReady()) return authUnavailable(res);
  return next();
}

router.post('/google', requireAuthService, googleAuth);
router.get('/me', requireAuthService, protect, getMe);

export default router;
