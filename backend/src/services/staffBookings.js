import { Types } from 'mongoose';
import { User } from '../models/User.js';
import { accountPhone } from './phone.js';
import { bookingDayKey, bookingSummary, currentReservations, overlaps, pricedSlots, reserveSlot, slotTimestamp } from './turfBookings.js';

const fail = (message, status) => Object.assign(new Error(message), { status });

export async function staffSchedule(turf, date) {
  const slots = pricedSlots(turf).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const reservations = await currentReservations(bookingDayKey(String(turf._id), date), slots);
  const customerIds = reservations.filter(({ status, customer, walkIn }) => status === 'confirmed' && customer && !walkIn?.phone)
    .map(({ customer }) => customer);
  const staffIds = reservations.filter(({ recordedBy }) => recordedBy).map(({ recordedBy }) => recordedBy);
  const peopleIds = [...new Set([...customerIds, ...staffIds].map(String))];
  const people = peopleIds.length ? await User.find({ _id: { $in: peopleIds } }).select('name phone role').lean() : [];
  const contacts = new Map(people.map((person) => [String(person._id), person]));
  const now = Date.now();
  return {
    turf: { name: turf.name },
    slots: slots.map((slot) => {
      const occupied = reservations.find((booking) => booking.status !== 'expired' && overlaps(slot, booking));
      const status = occupied ? (occupied.status === 'confirmed' ? 'booked' : 'held')
        : slotTimestamp(date, slot.endTime) <= now ? 'ended' : 'available';
      return { startTime: slot.startTime, endTime: slot.endTime, amount: Math.round(slot.price * 100), status };
    }),
    bookings: reservations.filter(({ status }) => status !== 'expired')
      .sort((a, b) => a.startTime.localeCompare(b.startTime)).map((booking) => {
        const { id, startTime, endTime, amount, equipment, paymentMethod, status } = bookingSummary(booking, date);
        const account = contacts.get(String(booking.customer));
        const contact = booking.walkIn?.phone ? booking.walkIn : account?.role === 'customer' ? account : undefined;
        const recorder = contacts.get(String(booking.recordedBy));
        return { id, startTime, endTime, amount, equipment, status, paymentMethod,
          walkIn: Boolean(booking.walkIn?.phone), customerName: contact?.name, customerPhone: contact?.phone,
          recordedBy: recorder?.role === 'staff' ? recorder.name : undefined };
      }),
  };
}

export async function recordWalkIn(turf, staffId, date, input) {
  const name = typeof input.customerName === 'string' ? input.customerName.trim() : '';
  const phone = accountPhone(input.customerPhone);
  if (!name || name.length > 100) throw fail('Enter a customer name between 1 and 100 characters.', 400);
  if (!phone) throw fail('Enter a valid customer phone number.', 400);
  const slot = pricedSlots(turf).find(({ startTime, endTime }) => input.startTime === startTime && input.endTime === endTime);
  if (!slot) throw fail('This slot is no longer available. Please choose another slot.', 409);
  const dayKey = bookingDayKey(String(turf._id), date);
  const reservations = await currentReservations(dayKey, [slot]);
  const duplicate = reservations.find((booking) => booking.status === 'confirmed' && String(booking.recordedBy) === String(staffId)
    && booking.walkIn?.phone === phone && booking.walkIn.name === name
    && booking.startTime === slot.startTime && booking.endTime === slot.endTime);
  if (duplicate) return duplicate;
  if (slotTimestamp(date, slot.endTime) <= Date.now()) throw fail('This slot has already ended.', 409);

  const customer = await User.findOne({ phone, role: 'customer', isActive: true }).select('_id').lean();
  const amount = Math.round(slot.price * 100);
  const booking = {
    _id: new Types.ObjectId(), customer: customer?._id, walkIn: { name, phone }, recordedBy: staffId, turfName: turf.name,
    startTime: slot.startTime, endTime: slot.endTime, amount, slotAmount: amount, status: 'confirmed',
    paymentMethod: amount === 0 ? 'free' : 'venue',
  };
  return reserveSlot(dayKey, booking);
}
