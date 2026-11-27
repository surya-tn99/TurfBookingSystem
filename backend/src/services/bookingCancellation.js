import { BookingDay } from '../models/BookingDay.js';
import { Turf } from '../models/Turf.js';
import { bookingDayKey, bookingSummary, isCurrentBooking, slotTimestamp } from './turfBookings.js';

const bookingError = (message, status) => Object.assign(new Error(message), { status });

export function cancellationReason(booking, turf, now) {
  if (!isCurrentBooking(booking, now)) return 'This booking is no longer active.';
  if (booking.status === 'pending') return 'Check your payment status before canceling this booking.';
  if (booking.venuePaidAt) return 'This booking has been paid at the venue. Contact the turf about cancellation.';
  if (bookingSummary(booking, booking.date).paymentMethod === 'online') {
    return 'An online payment must be refunded before the booking can be canceled.';
  }
  if (!turf || turf.removedAt) return '';
  const policy = turf.policies?.cancellation;
  if (policy?.available !== true || !Number.isFinite(policy.cutoffHours)) return 'This turf does not allow cancellations.';
  if (now > slotTimestamp(booking.date, booking.startTime) - policy.cutoffHours * 3_600_000) {
    return 'The cancellation cutoff for this slot has passed.';
  }
  return '';
}

export async function cancelCustomerBooking(turfId, date, bookingId, customer) {
  const dayKey = bookingDayKey(turfId, date);
  const findBooking = (day) => day?.reservations.find(({ _id, customer: owner }) =>
    String(_id) === bookingId && String(owner) === String(customer));
  const booking = findBooking(await BookingDay.findById(dayKey).lean());
  if (!booking) throw bookingError('Booking not found.', 404);
  if (booking.status === 'cancelled') return booking;

  const turf = await Turf.findOne({ _id: turfId }).select('removedAt policies.cancellation').lean();
  const reason = cancellationReason({ ...booking, date }, turf, Date.now());
  if (reason) throw bookingError(reason, 409);
  const updated = await BookingDay.findOneAndUpdate({
    _id: dayKey, reservations: { $elemMatch: { _id: bookingId, customer, status: 'confirmed', venuePaidAt: null } },
  }, { $set: { 'reservations.$.status': 'cancelled', 'reservations.$.cancelledAt': new Date() } },
  { returnDocument: 'after' }).lean();
  const cancelled = findBooking(updated ?? await BookingDay.findById(dayKey).lean());
  if (cancelled?.status !== 'cancelled') throw bookingError('This booking changed. Refresh Wallet and try again.', 409);
  return cancelled;
}
