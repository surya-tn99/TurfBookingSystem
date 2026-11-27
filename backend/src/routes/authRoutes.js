import express from 'express';
import { databaseReady } from '../config/db.js';
import { authUnavailable, completeProfile, deleteAccount, googleAuth, getMe, updateProfile } from '../controllers/authController.js';
import { authorize, protect } from '../middleware/authMiddleware.js';

const router = express.Router();

export function requireAuthService(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!process.env.JWT_SECRET?.trim() || !databaseReady()) return authUnavailable(res);
  return next();
}

router.post('/google', requireAuthService, googleAuth);
router.get('/me', requireAuthService, protect, getMe);
const canEditProfile = [requireAuthService, protect, authorize('customer', 'owner')];
router.patch('/me', canEditProfile, completeProfile);
router.patch('/me/profile', canEditProfile, updateProfile);
router.delete('/me', canEditProfile, deleteAccount);

export default router;
