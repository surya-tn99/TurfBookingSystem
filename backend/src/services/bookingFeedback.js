import { isObjectIdOrHexString } from 'mongoose';
import { BookingDay } from '../models/BookingDay.js';
import { Turf } from '../models/Turf.js';
import { bookingDayKey, customerReservations, slotTimestamp } from './turfBookings.js';

const matchesCustomer = (booking, customer) => booking.status === 'confirmed' && String(booking.customer) === String(customer);
const ended = (booking, date, now) => slotTimestamp(date, booking.endTime) <= now;

export async function bookingReviews(bookings) {
  if (!bookings.length) return new Map();
  const turfIds = [...new Set(bookings.map(({ turfId }) => turfId))];
  const bookingIds = new Set(bookings.map(({ _id }) => String(_id)));
  const turfs = await Turf.find({ _id: { $in: turfIds } }).select('removedAt feedback._id feedback.rating feedback.comment feedback.reply').lean();
  return new Map(turfs.map((turf) => [String(turf._id), {
    available: !turf.removedAt,
    reviews: new Map((turf.feedback ?? []).filter(({ _id }) => bookingIds.has(String(_id)))
      .map(({ _id, rating, comment, reply }) => [String(_id), { rating, comment, ...(reply && { reply }) }])),
  }]));
}

export async function pendingBookingFeedback(customer) {
  const bookings = await customerReservations(customer, 'confirmed');
  const now = Date.now();
  const due = bookings.filter((booking) => ended(booking, booking.date, now));
  const reviewed = await bookingReviews(due);
  const next = due.sort((a, b) => `${b.date}T${b.endTime}`.localeCompare(`${a.date}T${a.endTime}`))
    .find(({ turfId, _id }) => reviewed.get(turfId)?.available && !reviewed.get(turfId).reviews.has(String(_id)));
  if (!next) return null;
  const { _id, turfId, date, turfName, startTime, endTime } = next;
  return { id: String(_id), turfId, date, turfName, startTime, endTime };
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
export async function replyToFeedback(turfQuery, feedbackId, value) {
  const missing = () => Object.assign(new Error('Feedback not found.'), { status: 404 });
  if (!isObjectIdOrHexString(feedbackId)) throw missing();
  const reply = typeof value === 'string' ? value.trim() : '';
  if (!reply || reply.length > 2000) {
    throw Object.assign(new Error('Enter a reply of up to 2,000 characters.'), { status: 400 });
  }
  const turf = await Turf.findOneAndUpdate({ ...turfQuery, 'feedback._id': feedbackId },
    { $set: { 'feedback.$.reply': reply, 'feedback.$.repliedAt': new Date() } }, { returnDocument: 'after' });
  if (!turf) throw missing();
  return turf;
}
