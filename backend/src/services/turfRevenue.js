import { BookingDay } from '../models/BookingDay.js';
import { bookingDayKey, bookingSummary } from './turfBookings.js';

const dayMs = 86_400_000;
const indiaOffsetMs = 19_800_000;
const dateKey = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);

function bookingDateRange(period, from, to) {
  if (period === 'custom') return [from, to];
  const today = dateKey(Date.now() + indiaOffsetMs);
  const todayMs = Date.parse(today);
  if (period === 'last30') return [dateKey(todayMs - 29 * dayMs), today];
  if (period === 'month') {
    const month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    return [dateKey(month), dateKey(month.setUTCMonth(month.getUTCMonth() + 1, 0))];
  }
  return ['', ''];
}

export async function turfRevenue(turfId, period, from, to) {
  const id = turfId.toLowerCase();
  const [first, last] = bookingDateRange(period, from, to);
  // Booking day IDs start with `${id}:`. The next delimiter bounds the range to this turf.
  const upperBound = last ? { $lte: bookingDayKey(id, last) } : { $lt: `${id};` };
  const days = await BookingDay.find({ _id: { $gte: bookingDayKey(id, first), ...upperBound } },
    'reservations.status reservations.amount reservations.slotAmount reservations.paymentMethod reservations.venuePaidAt').lean();
  const totals = { bookings: 0, received: 0, dueAtVenue: 0, receivedOnline: 0, receivedAtVenue: 0, slots: 0, rentals: 0 };
  const daily = [];
  for (const day of days) {
    const date = day._id.split(':')[1];
    const row = { date, bookings: 0, received: 0, dueAtVenue: 0 };
    for (const booking of day.reservations ?? []) {
      if (booking.status !== 'confirmed') continue;
      const { amount, slotAmount, paymentMethod } = bookingSummary(booking, date);
      if (!Number.isSafeInteger(amount) || amount < 0) continue;
      row.bookings += 1;
      if (paymentMethod === 'venue' && !booking.venuePaidAt) {
        row.dueAtVenue += amount;
      } else if (paymentMethod === 'online' || (paymentMethod === 'venue' && booking.venuePaidAt)) {
        row.received += amount;
        if (paymentMethod === 'online') totals.receivedOnline += amount;
        else totals.receivedAtVenue += amount;
        const slotShare = Number.isSafeInteger(slotAmount) && slotAmount >= 0 && slotAmount <= amount ? slotAmount : amount;
        totals.slots += slotShare;
        totals.rentals += amount - slotShare;
      }
    }
    if (!row.bookings) continue;
    daily.push(row);
    totals.bookings += row.bookings;
    totals.received += row.received;
    totals.dueAtVenue += row.dueAtVenue;
  }
  return { totals, daily: daily.sort((a, b) => b.date.localeCompare(a.date)) };
}

export async function recordVenuePayment(turfId, date, bookingId) {
  const dayKey = bookingDayKey(turfId, date);
  const receivedAt = new Date();
  const updated = await BookingDay.updateOne({
    _id: dayKey, reservations: { $elemMatch: { _id: bookingId, status: 'confirmed', paymentMethod: 'venue', amount: { $gt: 0 }, venuePaidAt: null } },
  }, { $set: { 'reservations.$.venuePaidAt': receivedAt } });
  if (updated.modifiedCount === 1) return receivedAt;

  const booking = (await BookingDay.findById(dayKey).lean())?.reservations.find(({ _id }) => String(_id) === bookingId);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (booking.status === 'confirmed' && booking.paymentMethod === 'venue' && booking.venuePaidAt) return booking.venuePaidAt;
  throw Object.assign(new Error('Only confirmed pay-at-venue bookings can be marked as paid.'), { status: 409 });
}
