import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import publicTurfRoutes from './routes/publicTurfRoutes.js';
import { razorpayWebhook } from './routes/razorpayWebhook.js';
import turfRoutes from './routes/turfRoutes.js';
import { checkSupabaseConnection } from './services/storageService.js';

dotenv.config();

const app = express();

// Middlewares
app.post('/api/payments/razorpay/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);
app.use(express.json());
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    credentials: true,
  })
);

// Connect Database
connectDB();
checkSupabaseConnection();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/turfs', publicTurfRoutes);
app.use('/api/owner/turfs', turfRoutes);

// Root Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Turf Booking Backend API',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON request' });
  }
  console.error('[Server Error]:', err.stack);
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] TurfBookingSystem Backend running on port ${PORT}`);
});
