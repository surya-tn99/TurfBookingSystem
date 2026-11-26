import express from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { databaseReady, isDatabaseUnavailable } from '../config/db.js';
import { authorize, protect } from '../middleware/authMiddleware.js';
import { Turf } from '../models/Turf.js';
import { pendingBookingFeedback, saveBookingFeedback } from '../services/bookingFeedback.js';
import { bookingDayKey, bookingSummary, customerBooking, dailySlots, pricedSlots, startBooking, validBookingDate } from '../services/turfBookings.js';
import { rentalOptions } from '../services/turfEquipment.js';
import { syncPendingVerifications } from '../services/turfVerificationService.js';
import { requireAuthService } from './authRoutes.js';

const router = express.Router();
const readyForListing = { removedAt: null, isConfigured: true };
const listingFields = 'name address.street address.area address.city address.state sports media.images feedback.rating timeSlots';
const venueFields = `${listingFields} policies.payAtVenue equipment facilities.venueType facilities.parking.available facilities.parking.twoWheelerCapacity facilities.parking.fourWheelerCapacity facilities.restrooms.available facilities.restrooms.changingRoomCount facilities.floodlights.available facilities.drinkingWater facilities.cafeteria facilities.seatingArea facilities.coveredRoof`;
const missing = (res) => res.status(404).json({ message: 'Turf not found.' });
const invalidDate = (res) => res.status(400).json({ message: 'Choose a valid booking date.' });

function unavailable(res) {
  return res.status(503).json({ message: 'Turf listings are temporarily unavailable.' });
}

function publicListing(turf) {
  const slots = pricedSlots(turf);
  if (!slots.length) return null;
  const ratings = (turf.feedback ?? []).map(({ rating }) => rating)
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

  return {
    id: String(turf._id),
    name: turf.name,
    street: turf.address?.street,
    area: turf.address?.area,
    city: turf.address?.city,
    state: turf.address?.state,
    sports: turf.sports,
    image: turf.media?.images?.[0] ?? null,
    rating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    slotCount: slots.length,
    startingPrice: Math.min(...slots.map(({ price }) => price)),
  };
}

function venueInformation(turf) {
  const facilities = turf.facilities ?? {};
  const { parking, restrooms, floodlights, venueType } = facilities;
  return {
    photos: turf.media?.images ?? [],
    venueType: venueType ?? null,
    payAtVenue: turf.policies?.payAtVenue === true,
    facilities: {
      parking: parking?.available === true ? {
        twoWheelerCapacity: parking.twoWheelerCapacity ?? 0, fourWheelerCapacity: parking.fourWheelerCapacity ?? 0,
      } : null,
      restrooms: restrooms?.available === true,
      changingRooms: restrooms?.available === true && restrooms.changingRoomCount > 0,
      floodlights: floodlights?.available === true,
      drinkingWater: facilities.drinkingWater === true,
      cafeteria: facilities.cafeteria === true,
      seating: facilities.seatingArea === true,
      coveredRoof: facilities.coveredRoof === true,
    },
    equipment: rentalOptions(turf),
  };
}

function handle(handler) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!databaseReady()) return unavailable(res);
    try { return await handler(req, res); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (isDatabaseUnavailable(error)) return unavailable(res);
      return next(error);
    }
  };
}

async function verifiedTurf(id) {
  const query = { ...readyForListing, _id: id };
  await syncPendingVerifications(query);
  return Turf.findOne({ ...query, verificationStatus: 'verified' }).select(venueFields).lean();
}

router.param('id', (req, res, next, id) => isObjectIdOrHexString(id) ? next() : missing(res));

router.get('/', handle(async (req, res) => {
  await syncPendingVerifications(readyForListing);
  const turfs = await Turf.find({ ...readyForListing, verificationStatus: 'verified' })
    .select(listingFields).sort({ createdAt: -1 }).lean();
  return res.json({ turfs: turfs.map(publicListing).filter(Boolean) });
}));

router.get('/:id', handle(async (req, res) => {
  const date = req.query.date;
  if (!validBookingDate(date)) return invalidDate(res);
  const turf = await verifiedTurf(req.params.id);
  const listing = turf && publicListing(turf);
  if (!listing) return missing(res);
  return res.json({ turf: { ...listing, ...venueInformation(turf) }, slots: await dailySlots(turf, date) });
}));

const customerOnly = [requireAuthService, protect, authorize('customer'), (req, res, next) => {
  if (req.user.needsProfile) return res.status(403).json({ message: 'Complete your profile before booking a slot.' });
  return next();
}];

router.get('/feedback/pending', customerOnly, handle(async (req, res) =>
  res.json({ booking: await pendingBookingFeedback(req.user.id) })));

router.post('/:id/bookings', customerOnly, handle(async (req, res) => {
  const date = req.body?.date;
  if (!validBookingDate(date)) return invalidDate(res);
  const turf = await verifiedTurf(req.params.id);
  if (!turf) return missing(res);
  const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
  const booking = await startBooking(turf, req.user.id, date, req.body, clientOrigin);
  return res.json({ booking: bookingSummary(booking, date) });
}));

router.get('/:id/bookings/:date/:bookingId', customerOnly, handle(async (req, res) => {
  const { id, date, bookingId } = req.params;
  if (!validBookingDate(date) || !isObjectIdOrHexString(bookingId)) {
    return res.status(404).json({ message: 'Booking not found.' });
  }
  const booking = await customerBooking(bookingDayKey(id, date), bookingId, req.user.id);
  return booking ? res.json({ booking: bookingSummary(booking, date) }) : res.status(404).json({ message: 'Booking not found.' });
}));

router.post('/:id/bookings/:date/:bookingId/feedback', customerOnly, handle(async (req, res) => {
  const { id, date, bookingId } = req.params;
  if (!validBookingDate(date) || !isObjectIdOrHexString(bookingId)) {
    return res.status(404).json({ message: 'Booking not found.' });
  }
  const { rating, comment } = req.body ?? {};
  const created = await saveBookingFeedback({ turfId: id, date, bookingId: bookingId.toLowerCase(), user: req.user, rating, comment });
  return res.status(created ? 201 : 200).json({ saved: true });
}));

export default router;
