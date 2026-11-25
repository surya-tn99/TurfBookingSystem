import express from 'express';
import { googleAuth, devLogin, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/google', googleAuth);
router.post('/dev-login', devLogin);
router.get('/me', protect, getMe);

export default router;
