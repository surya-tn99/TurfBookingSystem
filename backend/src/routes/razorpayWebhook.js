import { databaseReady, isDatabaseUnavailable } from '../config/db.js';
import { validWebhook } from '../services/razorpay.js';
import { settlePaymentEvent } from '../services/turfBookings.js';

const supportedEvents = new Set(['payment_link.paid', 'payment_link.expired', 'payment_link.cancelled']);

export async function razorpayWebhook(req, res, next) {
  if (!validWebhook(req.body, req.get('X-Razorpay-Signature'))) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body); }
  catch { return res.sendStatus(400); }
  if (!supportedEvents.has(event?.event)) return res.sendStatus(204);
  if (!databaseReady()) return res.sendStatus(503);
  try {
    await settlePaymentEvent(event.payload?.payment_link?.entity);
    return res.sendStatus(204);
  } catch (error) {
    if (isDatabaseUnavailable(error) || error.status === 503) return res.sendStatus(503);
    return next(error);
  }
}
