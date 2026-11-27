import express from 'express';
import { isDatabaseUnavailable } from '../config/db.js';
import { authUnavailable } from '../controllers/authController.js';
import { authorize, protect } from '../middleware/authMiddleware.js';
import { Turf } from '../models/Turf.js';
import { replyToFeedback } from '../services/bookingFeedback.js';
import { recordWalkIn, staffSchedule } from '../services/staffBookings.js';
import { validBookingDate } from '../services/turfBookings.js';
import { requireAuthService } from './authRoutes.js';

const router = express.Router();
const assignment = (user) => ({ _id: user.assignedTurf, owner: user.createdBy, removedAt: null });
const invalidDate = (res) => res.status(400).json({ message: 'Choose a valid booking date.' });

function handle(handler) {
  return async (req, res, next) => {
    try { return await handler(req, res); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (isDatabaseUnavailable(error)) return authUnavailable(res);
      return next(error);
    }
  };
}

router.use(requireAuthService, protect, authorize('staff'), (req, res, next) => {
  if (req.user.assignedTurf && req.user.createdBy) return next();
  return res.status(403).json({ message: 'Your manager must assign you to an active turf before you can use the staff dashboard.' });
});

router.get('/schedule', handle(async (req, res) => {
  if (!validBookingDate(req.query.date)) return invalidDate(res);
  const turf = await Turf.findOne(assignment(req.user)).select('name timeSlots').lean();
  if (!turf) return res.status(404).json({ message: 'Assigned turf not found.' });
  return res.json(await staffSchedule(turf, req.query.date));
}));

router.post('/bookings', handle(async (req, res) => {
  if (!validBookingDate(req.body?.date)) return invalidDate(res);
  const turf = await Turf.findOne(assignment(req.user)).select('name timeSlots').lean();
  if (!turf) return res.status(404).json({ message: 'Assigned turf not found.' });
  const booking = await recordWalkIn(turf, req.user.id, req.body.date, req.body);
  return res.json({ id: booking._id });
}));

function feedbackPage(turf) {
  return { turf: { name: turf.name }, feedback: (turf.feedback ?? []).map(({ _id, name, rating, comment, reply, createdAt }) =>
    ({ id: _id, name, rating, comment, reply, createdAt })).reverse() };
}

router.get('/feedback', handle(async (req, res) => {
  const turf = await Turf.findOne(assignment(req.user)).select('name feedback').lean();
  if (!turf) return res.status(404).json({ message: 'Assigned turf not found.' });
  return res.json(feedbackPage(turf));
}));

router.put('/feedback/:id/reply', handle(async (req, res) =>
  res.json(feedbackPage(await replyToFeedback(assignment(req.user), req.params.id, req.body?.reply)))));

export default router;
