import { Types } from 'mongoose';
import { BookingDay } from '../models/BookingDay.js';
import { withActiveAccount } from './accountActivity.js';
import { createPaymentLink, findPaymentLink, paymentConfigured, paymentUnavailable } from './razorpay.js';
import { selectedRentals } from './turfEquipment.js';

const holdSeconds = 300;
const startPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const endPattern = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

export function slotTimestamp(date, time) {
  return Date.parse(`${date}T${time}:00+05:30`);
}

export function validBookingDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export const bookingDayKey = (id, date) => `${id.toLowerCase()}:${date}`;

export function pricedSlots(turf) {
  return (turf.timeSlots ?? []).filter(({ isActive, startTime, endTime, price }) =>
    isActive === true && startPattern.test(startTime) && endPattern.test(endTime)
    && startTime < endTime && Number.isFinite(price) && price >= 0);
}

const bookablePrice = (amount, payAtVenue) => amount === 0 || (Number.isSafeInteger(amount) && amount >= (payAtVenue ? 0 : 100));
const paymentMethodFor = ({ paymentMethod, amount }) => paymentMethod ?? (amount === 0 ? 'free' : 'online');
export const overlaps = (left, right) => left.startTime < right.endTime && left.endTime > right.startTime;
const blocksSlot = (booking) => booking.status === 'pending' || booking.status === 'confirmed';
export const isCurrentBooking = (booking, now) => blocksSlot(booking) && slotTimestamp(booking.date, booking.endTime) > now;
const conflict = () => Object.assign(new Error('This slot is no longer available. Please choose another slot.'), { status: 409 });
const byId = (day, id) => day?.reservations.find((booking) => String(booking._id) === String(id));

function parsedUrl(url) {
  try { return new URL(url); }
  catch { return null; }
}

function hostedCheckout(url) {
  if (typeof url !== 'string') return null;
  const parsed = parsedUrl(url);
  return parsed?.protocol === 'https:' && ['rzp.io', 'razorpay.com'].some((domain) =>
    parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)) && !parsed.username && !parsed.password ? parsed.href : null;
}

async function updatePending(dayKey, booking, fields) {
  const day = await BookingDay.findOneAndUpdate({
    _id: dayKey, reservations: { $elemMatch: { _id: booking._id, status: 'pending' } },
  }, { $set: Object.fromEntries(Object.entries(fields).map(([key, value]) => [`reservations.$.${key}`, value])) },
  { returnDocument: 'after' }).lean();
  return byId(day ?? await BookingDay.findById(dayKey).lean(), booking._id);
}

export async function applyPaymentLink(dayKey, booking, link) {
  if (booking.status !== 'pending') return booking;
  if (!link) {
    if (!booking.paymentLinkId && booking.expiresAt.getTime() <= Date.now()) {
      return updatePending(dayKey, booking, { status: 'expired' });
    }
    return booking;
  }
  if (typeof link.id !== 'string' || link.reference_id !== String(booking._id)
    || (booking.paymentLinkId && booking.paymentLinkId !== link.id)
    || link.currency !== 'INR' || link.amount !== booking.amount) throw paymentUnavailable();

  if (link.status === 'paid' && link.amount_paid === booking.amount) {
    return updatePending(dayKey, booking, { status: 'confirmed', paymentLinkId: link.id });
  }
  if (['expired', 'cancelled'].includes(link.status) && link.amount_paid === 0) {
    return updatePending(dayKey, booking, { status: 'expired', paymentLinkId: link.id });
  }
  const checkoutUrl = hostedCheckout(link.short_url);
  if (link.status === 'created' && checkoutUrl && !booking.checkoutUrl) {
    return updatePending(dayKey, booking, { paymentLinkId: link.id, checkoutUrl });
  }
  return booking;
}

async function refreshPending(dayKey, booking) {
  if (booking.status !== 'pending') return booking;
  return applyPaymentLink(dayKey, booking, await findPaymentLink(booking));
}

export async function currentReservations(dayKey, slots) {
  const day = await BookingDay.findById(dayKey).lean();
  const reservations = (day?.reservations ?? []).filter(blocksSlot);
  return Promise.all(reservations.map(async (booking) => {
    if (booking.status !== 'pending' || booking.expiresAt.getTime() > Date.now()
      || !slots.some((slot) => overlaps(slot, booking))) return booking;
    try { return await refreshPending(dayKey, booking); }
    catch (error) {
      if (error.status === 503) return booking;
      throw error;
    }
  }));
}

export async function dailySlots(turf, date) {
  const now = Date.now();
  const payAtVenue = turf.policies?.payAtVenue === true;
  const slots = pricedSlots(turf).filter(({ startTime }) => slotTimestamp(date, startTime) > now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const reservations = await currentReservations(bookingDayKey(String(turf._id), date), slots);
  return slots.map(({ startTime, endTime, price }) => ({
    startTime, endTime, amount: Math.round(price * 100),
    available: bookablePrice(Math.round(price * 100), payAtVenue) && !reservations.some((booking) => blocksSlot(booking)
      && overlaps({ startTime, endTime }, booking)),
  }));
}

export function bookingSummary(booking, date) {
  const { _id, turfName, startTime, endTime, amount, slotAmount = amount, equipment = [], status, expiresAt, checkoutUrl, venuePaidAt } = booking;
  return { id: _id, turfName, date, startTime, endTime, amount, slotAmount, equipment, status, expiresAt, venuePaidAt,
    paymentMethod: paymentMethodFor(booking),
    checkoutUrl: status === 'pending' && expiresAt?.getTime() > Date.now() ? checkoutUrl ?? null : null };
}

export async function customerReservations(customer, status, session) {
  const filter = { customer, ...(status && { status }) };
  const days = await BookingDay.find({ reservations: { $elemMatch: filter } }, 'reservations', { session }).lean();
  return days.flatMap(({ _id, reservations }) => {
    const [turfId, date] = _id.split(':');
    return reservations.filter((booking) => String(booking.customer) === String(customer) && (!status || booking.status === status))
      .map((booking) => ({ ...booking, turfId, date }));
  });
}

export async function reserveSlot(dayKey, booking) {
  try {
    await BookingDay.updateOne({ _id: dayKey }, { $setOnInsert: { _id: dayKey } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  async function acquire(session) {
    const acquired = await BookingDay.updateOne({
      _id: dayKey, reservations: { $not: { $elemMatch: {
        status: { $in: ['pending', 'confirmed'] }, startTime: { $lt: booking.endTime }, endTime: { $gt: booking.startTime },
      } } },
    }, { $push: { reservations: booking } }, { session });
    if (acquired.modifiedCount !== 1) throw conflict();
  }
  if (booking.customer) await withActiveAccount(booking.customer, 'customer', acquire);
  else await acquire();
  return booking;
}

export async function startBooking(turf, customer, date, choice, clientOrigin) {
  const slot = pricedSlots(turf).find(({ startTime, endTime }) =>
    startTime === choice?.startTime && endTime === choice?.endTime);
  const now = Date.now();
  if (!slot || slotTimestamp(date, slot.startTime) <= now) throw conflict();
  const slotAmount = Math.round(slot.price * 100);
  const equipment = selectedRentals(turf, choice.equipment);
  const amount = slotAmount + equipment.reduce((total, item) => total + item.unitAmount * item.quantity, 0);
  const requestedMethod = choice.paymentMethod === undefined ? 'online' : choice.paymentMethod;
  if (requestedMethod !== 'online' && requestedMethod !== 'venue') {
    throw Object.assign(new Error('Choose a valid payment option.'), { status: 400 });
  }
  if (amount !== choice.amount || !bookablePrice(amount, requestedMethod === 'venue')) {
    throw Object.assign(new Error('The booking total changed. Review the updated price and try again.'), { status: 409 });
  }

  const paymentMethod = amount === 0 ? 'free' : requestedMethod;
  const turfId = String(turf._id);
  const dayKey = bookingDayKey(turfId, date);
  const reservations = await currentReservations(dayKey, [slot]);
  const existing = reservations.find((booking) => blocksSlot(booking) && overlaps(slot, booking));
  if (existing) {
    const existingRentals = existing.equipment ?? [];
    if (String(existing.customer) === String(customer) && existing.amount === amount
      && paymentMethodFor(existing) === paymentMethod
      && existing.startTime === slot.startTime && existing.endTime === slot.endTime
      && existingRentals.length === equipment.length && equipment.every((item, index) =>
        item.id === existingRentals[index].id && item.quantity === existingRentals[index].quantity)) return existing;
    throw conflict();
  }

  const venueMethod = turf.policies?.payAtVenue === true ? 'venue' : 'online';
  if (amount > 0 && requestedMethod !== venueMethod) {
    throw Object.assign(new Error('The payment option changed. Review your booking and try again.'), { status: 409 });
  }
  const needsOnlinePayment = paymentMethod === 'online';
  const origin = parsedUrl(clientOrigin);
  if (needsOnlinePayment && !paymentConfigured()) {
    console.warn('[Payments] Checkout unavailable. RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must both be set.');
    throw paymentUnavailable();
  }
  if (needsOnlinePayment && !['http:', 'https:'].includes(origin?.protocol)) {
    console.warn('[Payments] Checkout unavailable. CLIENT_URL must be a valid frontend URL.');
    throw paymentUnavailable();
  }

  const expiresAt = needsOnlinePayment ? new Date(Math.min(now + holdSeconds * 1_000, slotTimestamp(date, slot.startTime))) : undefined;
  const booking = { _id: new Types.ObjectId(), customer, turfName: turf.name, startTime: slot.startTime,
    endTime: slot.endTime, slotAmount, equipment, amount, paymentMethod, status: needsOnlinePayment ? 'pending' : 'confirmed', expiresAt };
  await reserveSlot(dayKey, booking);
  if (!needsOnlinePayment) return booking;

  const callback = new URL(`/turfs/${turfId}`, origin);
  callback.search = new URLSearchParams({ date, booking: String(booking._id) });
  try {
    return await applyPaymentLink(dayKey, booking, await createPaymentLink(booking, dayKey, callback.href));
  } catch (error) {
    // A timed-out request may already have created a payment link. Keep the hold and look it up by reference.
    if (error.status === 503) return booking;
    throw error;
  }
}

export async function customerBooking(dayKey, id, customer) {
  const booking = byId(await BookingDay.findById(dayKey).lean(), id);
  if (!booking || String(booking.customer) !== String(customer)) return null;
  return refreshPending(dayKey, booking);
}

export async function settlePaymentEvent(link) {
  const dayKey = link?.notes?.pickturf_day;
  if (typeof dayKey !== 'string' || !/^[a-f\d]{24}:\d{4}-\d{2}-\d{2}$/.test(dayKey)
    || !/^[a-f\d]{24}$/.test(link.reference_id ?? '')) return;
  const booking = byId(await BookingDay.findById(dayKey).lean(), link.reference_id);
  if (booking) await applyPaymentLink(dayKey, booking, link);
}
