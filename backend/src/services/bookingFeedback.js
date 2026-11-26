import { BookingDay } from '../models/BookingDay.js';
import { Turf } from '../models/Turf.js';
import { bookingDayKey, slotTimestamp } from './turfBookings.js';

const matchesCustomer = (booking, customer) => booking.status === 'confirmed' && String(booking.customer) === String(customer);
const ended = (booking, date, now) => slotTimestamp(date, booking.endTime) <= now;

export async function pendingBookingFeedback(customer) {
  const days = await BookingDay.find({ reservations: { $elemMatch: { customer, status: 'confirmed' } } })
    .select('reservations._id reservations.customer reservations.turfName reservations.startTime reservations.endTime reservations.status').lean();
  const now = Date.now();
  const due = days.flatMap(({ _id, reservations }) => {
    const [turfId, date] = _id.split(':');
    return reservations.filter((booking) => matchesCustomer(booking, customer) && ended(booking, date, now))
      .map((booking) => ({ turfId, date, id: String(booking._id), turfName: booking.turfName,
        startTime: booking.startTime, endTime: booking.endTime }));
  });
  if (!due.length) return null;

  const turfIds = [...new Set(due.map(({ turfId }) => turfId))];
  const turfs = await Turf.find({ _id: { $in: turfIds }, removedAt: null }).select('feedback._id').lean();
  const reviewed = new Map(turfs.map((turf) => [String(turf._id), new Set((turf.feedback ?? []).map(({ _id }) => String(_id)))]));
  return due.sort((a, b) => `${b.date}T${b.endTime}`.localeCompare(`${a.date}T${a.endTime}`))
    .find(({ turfId, id }) => reviewed.has(turfId) && !reviewed.get(turfId).has(id)) ?? null;
}

export async function saveBookingFeedback({ turfId, date, bookingId, user, rating, comment = '' }) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw Object.assign(new Error('Choose a rating from 1 to 5.'), { status: 400 });
  }
  if (typeof comment !== 'string' || comment.trim().length > 1_000) {
    throw Object.assign(new Error('Keep your feedback to 1,000 characters or fewer.'), { status: 400 });
  }

  const day = await BookingDay.findById(bookingDayKey(turfId, date)).lean();
  const booking = day?.reservations.find((entry) => String(entry._id) === bookingId && matchesCustomer(entry, user.id));
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (!ended(booking, date, Date.now())) {
    throw Object.assign(new Error('You can leave feedback after your slot ends.'), { status: 409 });
  }

  // The booking ID identifies the feedback, so retries and simultaneous requests can only write it once.
  const turf = { _id: turfId, removedAt: null };
  const result = await Turf.updateOne({ ...turf, 'feedback._id': { $ne: bookingId } }, { $push: {
    feedback: { _id: bookingId, customer: user.id, name: user.name, rating, comment: comment.trim() },
  } }, { runValidators: true });
  if (!result.modifiedCount && !await Turf.exists({ ...turf, 'feedback._id': bookingId })) {
    throw Object.assign(new Error('Turf not found.'), { status: 404 });
  }
  return result.modifiedCount > 0;
}
