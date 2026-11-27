import { bookingReviews } from './bookingFeedback.js';
import { bookingSummary, customerReservations, slotTimestamp } from './turfBookings.js';

const start = (booking) => slotTimestamp(booking.date, booking.startTime);

export async function customerBookingHistory(customer) {
  const bookings = await customerReservations(customer);
  const now = Date.now();
  const completed = bookings.filter((booking) => booking.status === 'confirmed' && slotTimestamp(booking.date, booking.endTime) <= now);
  const completedIds = new Set(completed.map(({ _id }) => String(_id)));
  const reviews = await bookingReviews(completed);
  const current = [];
  const previous = [];

  for (const booking of bookings) {
    const { id, turfName, date, startTime, endTime, amount, equipment, paymentMethod, status } = bookingSummary(booking, booking.date);
    const isCompleted = completedIds.has(String(id));
    const turfReviews = reviews.get(booking.turfId);
    const review = turfReviews?.reviews.get(String(id)) ?? null;
    const entry = { id, turfId: booking.turfId, turfName, date, startTime, endTime, amount, equipment, paymentMethod, status,
      completed: isCompleted, review, canReview: isCompleted && Boolean(turfReviews?.available) && !review };
    const activeHold = status === 'pending' && booking.expiresAt?.getTime() > now && slotTimestamp(date, endTime) > now;
    if ((status === 'confirmed' && !isCompleted) || activeHold) current.push(entry);
    else previous.push(entry);
  }

  return { current: current.sort((a, b) => start(a) - start(b)), previous: previous.sort((a, b) => start(b) - start(a)) };
}
