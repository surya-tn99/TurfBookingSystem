import { createHmac, timingSafeEqual } from 'node:crypto';

export const paymentUnavailable = () => Object.assign(new Error('Checkout is temporarily unavailable. Please try again shortly.'), { status: 503 });

export function paymentConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
}

async function request(path, body) {
  if (!paymentConfigured()) throw paymentUnavailable();
  const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID.trim()}:${process.env.RAZORPAY_KEY_SECRET.trim()}`).toString('base64');
  try {
    const response = await fetch(`https://api.razorpay.com/v1/payment_links${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Basic ${credentials}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.warn(`[Payments] Razorpay ${body ? 'create' : 'lookup'} request returned HTTP ${response.status}.`);
      throw paymentUnavailable();
    }
    return await response.json();
  } catch (error) {
    if (error.status !== 503) console.warn(`[Payments] Razorpay request failed (${error.name}).`);
    throw paymentUnavailable();
  }
}

export function createPaymentLink(booking, dayKey, callbackUrl) {
  return request('', {
    reference_id: String(booking._id),
    amount: booking.amount,
    currency: 'INR',
    accept_partial: false,
    expire_by: Math.floor(booking.expiresAt.getTime() / 1_000),
    description: `${booking.turfName} · ${dayKey.split(':')[1]} · ${booking.startTime}–${booking.endTime}`,
    notes: { pickturf_day: dayKey },
    callback_url: callbackUrl,
    callback_method: 'get',
    notify: { sms: false, email: false },
  });
}

export async function findPaymentLink(booking) {
  if (booking.paymentLinkId) return request(`/${encodeURIComponent(booking.paymentLinkId)}`);
  const data = await request(`?reference_id=${encodeURIComponent(booking._id)}`);
  if (!Array.isArray(data.payment_links)) throw paymentUnavailable();
  return data.payment_links.find((link) => link.reference_id === String(booking._id));
}

export function validWebhook(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(body) || !/^[0-9a-f]{64}$/i.test(signature ?? '')) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
