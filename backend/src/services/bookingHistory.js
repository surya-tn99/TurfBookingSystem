import { Turf } from '../models/Turf.js';
import { cancellationReason } from './bookingCancellation.js';
import { bookingReviews } from './bookingFeedback.js';
import { bookingSummary, customerReservations, isCurrentBooking, slotTimestamp } from './turfBookings.js';

const start = (booking) => slotTimestamp(booking.date, booking.startTime);

export async function customerBookingHistory(customer) {
  const bookings = await customerReservations(customer);
  const now = Date.now();
  const completed = bookings.filter((booking) => booking.status === 'confirmed' && slotTimestamp(booking.date, booking.endTime) <= now);
  const completedIds = new Set(completed.map(({ _id }) => String(_id)));
  const activeTurfIds = [...new Set(bookings.filter((booking) => isCurrentBooking(booking, now)).map(({ turfId }) => turfId))];
  const [reviews, turfs] = await Promise.all([
    bookingReviews(completed),
    activeTurfIds.length ? Turf.find({ _id: { $in: activeTurfIds } }).select('removedAt policies.cancellation').lean() : [],
  ]);
  const turfPolicies = new Map(turfs.map((turf) => [String(turf._id), turf]));
  const current = [];
  const previous = [];

  for (const booking of bookings) {
    const { id, turfName, date, startTime, endTime, amount, equipment, paymentMethod, status } = bookingSummary(booking, booking.date);
    const isCompleted = completedIds.has(String(id));
    const turfReviews = reviews.get(booking.turfId);
    const review = turfReviews?.reviews.get(String(id)) ?? null;
    const entry = { id, turfId: booking.turfId, turfName, date, startTime, endTime, amount, equipment, paymentMethod, status,
      completed: isCompleted, review, canReview: isCompleted && Boolean(turfReviews?.available) && !review };
    if (isCurrentBooking(booking, now)) {
      const reason = cancellationReason(booking, turfPolicies.get(booking.turfId), now);
      current.push({ ...entry, canCancel: !reason, cancellationNote: reason });
    } else previous.push(entry);
  }

  return { current: current.sort((a, b) => start(a) - start(b)), previous: previous.sort((a, b) => start(b) - start(a)) };
}
